/**
 * dsh-session-backup — automatic session snapshots.
 *
 * Strategy: on each tick, snapshot sessions (through the ctx.sessions seam)
 * into `<backup_dir>/<yyyy-mm-dd>/sessions/<sessionId>.json(.gz)`; keep only
 * the newest `max_backups` generations; optional gzip compression. Every
 * write goes through a temp file + atomic rename.
 *
 * @module @dsh-platform/dsh-session-backup
 */
import { mkdirSync, writeFileSync, readdirSync, rmSync, renameSync, readFileSync } from 'node:fs'
import { gzipSync, gunzipSync } from 'node:zlib'
import { join, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'

export const name = 'dsh-session-backup'

export interface BackupConfig {
  /** Backup interval in ms (default 5 min). */
  interval?: number
  /** Max snapshot generations to keep (default 50). */
  max_backups?: number
  /** gzip snapshot JSONs (default true). */
  compress?: boolean
  /** Backup root (default $DSH_HOME/backups or ~/.dsh-platform/backups). */
  backup_dir?: string
}

export interface SnapshotState {
  lastRunAt: number | null
  lastSnapshotCount: number
  lastError: string | null
}

function backupRoot(config: BackupConfig): string {
  if (config.backup_dir) return config.backup_dir
  if (process.env.DSH_HOME) return join(process.env.DSH_HOME, 'backups')
  return join(resolve(process.env.HOME ?? '.'), '.dsh-platform', 'backups')
}

function writeJsonAtomic(file: string, data: unknown, compress: boolean): void {
  const json = JSON.stringify(data)
  const payload = compress ? gzipSync(json) : Buffer.from(json, 'utf8')
  const tmp = `${file}.tmp`
  try {
    writeFileSync(tmp, payload)
    renameSync(tmp, file)
  } catch (err) {
    rmSync(tmp, { force: true })
    throw err instanceof Error ? err : new Error(String(err))
  }
}

/** Read a snapshot back (auto-detects gzip by extension). */
export function readSnapshot(file: string): unknown | null {
  try {
    const raw = readFileSync(file)
    const text = file.endsWith('.gz') ? gunzipSync(raw).toString('utf8') : raw.toString('utf8')
    return JSON.parse(text)
  } catch {
    return null
  }
}

/** Snapshot every session through the ctx.sessions seam (sync or async list). */
async function listSessions(ctx: Context): Promise<Array<{ id: string; updatedAt: string }>> {
  const sessions = (ctx as any).get?.('sessions') as
    | { list?: () => unknown[] | Promise<unknown[]> }
    | undefined
  if (!sessions || typeof sessions.list !== 'function') return []
  try {
    const list = await Promise.resolve(sessions.list())
    return (Array.isArray(list) ? list : []).map((item: any) => ({
      id: String(item?.id ?? 'unknown'),
      updatedAt: String(item?.updatedAt ?? '')
    }))
  } catch {
    return []
  }
}

export function apply(ctx: Context, rawConfig: BackupConfig) {
  const config: Required<Pick<BackupConfig, 'interval' | 'max_backups' | 'compress'>> & BackupConfig = {
    interval: rawConfig.interval ?? 300_000,
    max_backups: rawConfig.max_backups ?? 50,
    compress: rawConfig.compress ?? true,
    ...rawConfig
  }
  const logger = ctx.logger
  const root = backupRoot(config)
  const state: SnapshotState = { lastRunAt: null, lastSnapshotCount: 0, lastError: null }

  const runOnce = async () => {
    try {
      const stamp = new Date().toISOString().slice(0, 10)
      const sessionsDir = join(root, stamp, 'sessions')
      mkdirSync(sessionsDir, { recursive: true })

      const sessions = await listSessions(ctx)
      for (const session of sessions) {
        const file = join(sessionsDir, `${sanitize(session.id)}.json${config.compress ? '.gz' : ''}`)
        writeJsonAtomic(file, { ...session, snapshotAt: Date.now() }, config.compress)
      }

      // Rotation: keep the newest max_backups yyyy-mm-dd generations.
      const generations = readdirSync(root)
        .filter((entry) => /^\d{4}-\d{2}-\d{2}$/.test(entry))
        .sort()
      while (generations.length > config.max_backups) {
        rmSync(join(root, generations.shift()!), { recursive: true, force: true })
      }

      state.lastRunAt = Date.now()
      state.lastSnapshotCount = sessions.length
      state.lastError = null
      if (sessions.length > 0) logger.info(`[dsh-session-backup] wrote ${sessions.length} snapshot(s) to ${root}`)
    } catch (err) {
      state.lastError = err instanceof Error ? err.message : String(err)
      logger.warn(`[dsh-session-backup] backup failed: ${state.lastError}`)
    }
  }

  // Reversible effect: immediate first run + interval, cleared on dispose.
  ctx.effect(() => {
    void runOnce()
    const timer = setInterval(() => void runOnce(), config.interval)
    return () => clearInterval(timer)
  }, 'dsh-session-backup.timer')

  const commands = (ctx as any).get?.('commands') as
    | { register?: (name: string, handler: (input: unknown) => unknown) => void }
    | undefined
  if (commands?.register) {
    commands.register('session-backup/status', () => ({ ...state, backup_dir: root }))
    commands.register('session-backup/run-now', () => {
      void runOnce()
      return { started: true }
    })
  }
}

function sanitize(id: string): string {
  return id.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 80)
}
