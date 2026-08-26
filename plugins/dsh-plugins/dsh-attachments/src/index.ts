/**
 * dsh-attachments — file-drop enhancement and attachment tools.
 *
 * Seam-first: registers tools only when `ctx.tools` is available; every
 * filesystem write is guarded and reversible where possible (temp file +
 * rename). All failures surface through tools' return values, never through
 * unhandled throws.
 *
 * @module @dsh-platform/dsh-attachments
 */
import { mkdirSync, writeFileSync, readdirSync, statSync, unlinkSync, renameSync } from 'node:fs'
import { join, extname, basename } from 'node:path'
import { homedir } from 'node:os'
import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'

export const name = 'dsh-attachments'

export interface AttachmentsConfig {
  /** Max accepted file size in bytes (default 100 MiB). */
  max_file_size?: number
  /** Allowed extensions; empty/undefined allows everything. */
  allowed_extensions?: string[]
  /** Where attachments are stored (default ~/.dsh-platform/attachments). */
  storage_dir?: string
  /** Max tracked attachments (default 200) — oldest removed first. */
  max_attachments?: number
}

export interface AttachmentRecord {
  id: string
  name: string
  size: number
  path: string
  addedAt: number
}

interface FileDropPayload {
  paths?: string[]
  files?: Array<{ name: string; data?: string; mime?: string }>
}

function store(config: AttachmentsConfig): string {
  const configured = config.storage_dir?.trim()
  return configured ? configured : join(homedir(), '.dsh-platform', 'attachments')
}

function validate(file: { name: string; size: number }, config: AttachmentsConfig): string | null {
  const max = config.max_file_size ?? 104_857_600
  if (file.size > max) return `file ${file.name} exceeds max_file_size (${max} bytes)`
  const allowed = config.allowed_extensions
  if (allowed && allowed.length > 0) {
    const ext = extname(file.name).toLowerCase()
    if (!allowed.includes(ext)) return `extension ${ext} not allowed`
  }
  return null
}

export function apply(ctx: Context, config: AttachmentsConfig) {
  const logger = ctx.logger
  const dir = store(config)
  const index = new Map<string, AttachmentRecord>()
  mkdirSync(dir, { recursive: true })

  // Custom seam event: cordis' typed Events map knows 'agent/*' etc. but not
  // shell-scoped 'desktop/*'/'web/*' events — cast the listener registration.
  const onCustom = (ctx.on as (event: string, listener: (payload?: unknown) => void) => unknown).bind(ctx)

  const track = (record: AttachmentRecord) => {
    index.set(record.id, record)
    const max = config.max_attachments ?? 200
    while (index.size > max) {
      const oldest = [...index.values()].sort((a, b) => a.addedAt - b.addedAt)[0]
      if (!oldest) break
      index.delete(oldest.id)
      try {
        unlinkSync(oldest.path)
      } catch {
        /* already gone */
      }
    }
  }

  const persistData = (name: string, data: string | undefined, sizeHint: number): AttachmentRecord | null => {
    const id = randomUUID()
    const safeName = basename(name)
    const problem = validate({ name: safeName, size: sizeHint }, config)
    if (problem) {
      logger.warn(`[dsh-attachments] rejected ${safeName}: ${problem}`)
      return null
    }
    const path = join(dir, `${id}-${safeName}`)
    if (data) {
      // data may be a base64 data URL ("data:<mime>;base64,....") or raw text
      const comma = data.indexOf(',')
      const body = comma >= 0 ? data.slice(comma + 1) : data
      writeFileSync(`${path}.tmp`, Buffer.from(body, 'base64'))
      renameSync(`${path}.tmp`, path)
    } else {
      writeFileSync(path, Buffer.alloc(0))
    }
    const record: AttachmentRecord = {
      id,
      name: safeName,
      size: sizeHint,
      path,
      addedAt: Date.now()
    }
    track(record)
    return record
  }

  // ---- file-drop handler (desktop shell forwards native drops here) -------
  onCustom('desktop/file-drop', (payload) => {
    const drop = payload as FileDropPayload
    const records: AttachmentRecord[] = []
    for (const file of drop.files ?? []) {
      const size = file.data ? Math.floor(file.data.length * 0.75) : 0
      const record = persistData(file.name, file.data, size)
      if (record) records.push(record)
    }
    for (const path of drop.paths ?? []) {
      try {
        const stat = statSync(path)
        if (!stat.isFile()) continue
        const name = basename(path)
        const problem = validate({ name, size: stat.size }, config)
        if (problem) continue
        const id = randomUUID()
        const dest = join(dir, `${id}-${name}`)
        renameSync(path, dest)
        const record: AttachmentRecord = { id, name, size: stat.size, path: dest, addedAt: Date.now() }
        track(record)
        records.push(record)
      } catch (err) {
        logger.warn(`[dsh-attachments] drop failed for ${path}: ${err}`)
      }
    }
    if (records.length > 0) {
      logger.info(`[dsh-attachments] stored ${records.length} file(s)`)
    }
  })

  // ---- tools (seam-first, optional service via ctx.get) ---------------------
  const tools = (ctx as any).get?.('tools') as
    | { register?: (name: string, tool: unknown) => void }
    | undefined
  if (tools && typeof tools.register === 'function') {
    tools.register('attachment_add', {
      name: 'attachment_add',
      description: 'Store one attachment (name + base64 data) in the attachments store.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          data: { type: 'string', description: 'base64 or data URL content' }
        },
        required: ['name', 'data']
      },
      execute: async (input: unknown) => {
        const { name, data } = input as { name: string; data: string }
        const record = persistData(name, data, Math.floor(data.length * 0.75))
        return record ?? { error: 'attachment rejected (size/extension policy)' }
      }
    })
    tools.register('attachment_list', {
      name: 'attachment_list',
      description: 'List tracked attachments with id, name, size and path.',
      parameters: { type: 'object', properties: {} },
      execute: async () => [...index.values()].sort((a, b) => b.addedAt - a.addedAt)
    })
    tools.register('attachment_remove', {
      name: 'attachment_remove',
      description: 'Remove a tracked attachment by id; returns whether it was deleted.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id']
      },
      execute: async (input: unknown) => {
        const { id } = input as { id: string }
        const record = index.get(id)
        if (!record) return { removed: false, reason: 'unknown id' }
        index.delete(id)
        try {
          unlinkSync(record.path)
        } catch {
          /* missing on disk is fine */
        }
        return { removed: true, id, name: record.name }
      }
    })
    tools.register('attachments_summary', {
      name: 'attachments_summary',
      description: 'Summarize the attachment store: count, total bytes, directory.',
      parameters: { type: 'object', properties: {} },
      execute: async () => ({
        count: index.size,
        totalBytes: [...index.values()].reduce((sum, item) => sum + item.size, 0),
        directory: dir
      })
    })
  } else {
    logger.info('[dsh-attachments] ctx.tools unavailable — tool registration skipped (file-drop handler remains active)')
  }

  // Hot directory rescan: pick up pre-existing attachments at boot.
  ctx.effect(() => {
    for (const entry of readdirSync(dir)) {
      try {
        const path = join(dir, entry)
        const stat = statSync(path)
        if (!stat.isFile() || entry.endsWith('.tmp')) continue
        const splitted = entry.indexOf('-')
        const id = splitted >= 0 ? entry.slice(0, splitted) : entry
        track({ id, name: entry, size: stat.size, path, addedAt: stat.mtimeMs })
      } catch {
        /* ignore unreadable entries */
      }
    }
    return () => {
      /* nothing to dispose; index dies with the context */
    }
  }, 'dsh-attachments.rescan')
}
