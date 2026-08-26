/**
 * DSHSidecar — spawns the DSH web profile as a Node.js sidecar and parses its
 * ready line (`dsh web: http://127.0.0.1:<PORT>`).
 *
 * This is the TypeScript mirror of `apps/desktop/src-tauri/src/sidecar.rs`;
 * the Rust process actually owns the sidecar lifecycle in production, and this
 * class powers development tooling (smoke script) and the headless runner.
 *
 * @module @dsh-platform/shared-dsh/sidecar
 */
import { spawn, type ChildProcessByStdio } from 'node:child_process'
import { createInterface, type Interface } from 'node:readline'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import type { Readable } from 'node:stream'

export const READY_LINE_PREFIX = 'dsh web: http://127.0.0.1:'
export const READY_LINE = /^dsh web: http:\/\/127\.0\.0\.1:(\d+)(?: \(LAN: .*\))?\s*$/

export interface SidecarLocator {
  /** Repo root used to find harness/ and node_modules. */
  root: string
  /** Optional explicit CLI bin path (e.g. installed `@deepseek-ai/dsh`). */
  cliPath?: string
}

export interface SidecarOptions {
  /** Repo root (default: process.cwd()). */
  root?: string
  /** Overlay applied with --patch. */
  overlayPath?: string
  /** DSH_HOME data directory; default `<root>/.dsh-local/home`. */
  dshHome?: string
  /** Extra args appended after `web`. */
  extraArgs?: string[]
  /** Node executable; default `node` from PATH (or $DSH_NODE). */
  nodeBinary?: string
  /** Emits every stdout/stderr line (for debugging). */
  onLog?: (stream: 'stdout' | 'stderr', line: string) => void
  /** Milliseconds to wait for the ready line before failing (default 60s). */
  readyTimeoutMs?: number
}

export type SidecarState = 'stopped' | 'starting' | 'ready' | 'error'

export class DSHSidecar {
  private child: ChildProcessByStdio<null, Readable, Readable> | null = null
  private readline: Interface | null = null
  private state: SidecarState = 'stopped'
  private url: string | null = null
  private error: string | null = null
  private stderrBuffer: string[] = []

  constructor(private readonly options: SidecarOptions = {}) {}

  /**
   * Locate the DSH CLI bin.js:
   *  1. explicit `cliPath`
   *  2. `<root>/harness/apps/cli/lib/bin.js` (submodule build output; pinned
   *     tag per HARNESS_UPSTREAM.md)
   *  3. `<root>/node_modules/@deepseek-ai/dsh/lib/bin.js` (npm fallback)
   */
  static locateCli(options: Pick<SidecarLocator, 'root'> & { cliPath?: string }): string {
    if (options.cliPath && existsSync(options.cliPath)) return options.cliPath
    const root = resolve(options.root ?? process.cwd())
    const candidates = [
      join(root, 'harness', 'apps', 'cli', 'lib', 'bin.js'),
      join(root, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
    ]
    for (const candidate of candidates) {
      if (existsSync(candidate)) return candidate
    }
    throw new Error(
      `DSH CLI not found; tried:\n  ${candidates.join('\n  ')}\nRun 'pnpm install' (npm CLI fallback) or build harness/apps/cli.`
    )
  }

  get currentState(): SidecarState {
    return this.state
  }

  get currentUrl(): string | null {
    return this.url
  }

  get lastError(): string | null {
    return this.error
  }

  /** Last N stderr lines for diagnostics. */
  get stderrTail(): string[] {
    return this.stderrBuffer.slice(-20)
  }

  /**
   * Spawn DSH and resolve once `dsh web: http://127.0.0.1:<PORT>` arrives.
   * Command: node <cli> web --host 127.0.0.1 --port 0 --no-open [--patch <overlay>]
   */
  async start(): Promise<string> {
    if (this.state === 'starting' || this.state === 'ready') {
      throw new Error(`sidecar already ${this.state}`)
    }
    const root = resolve(this.options.root ?? process.cwd())
    const cli = DSHSidecar.locateCli({ root })
    const overlay = this.options.overlayPath ? resolve(root, this.options.overlayPath) : undefined
    const dshHome = this.options.dshHome ?? join(root, '.dsh-local', 'home')

    // Launcher flags (--patch) must come BEFORE the app's pass-through flags
    // (--host/--port/--no-open): the CLI's commander parses known options
    // only up to the first unknown option, then passes the rest through.
    const args = [
      cli,
      'web',
      ...(overlay ? ['--patch', overlay] : []),
      '--host', '127.0.0.1',
      '--port', '0',
      '--no-open',
      ...(this.options.extraArgs ?? [])
    ]

    const nodeBinary = this.options.nodeBinary ?? process.env.DSH_NODE ?? 'node'
    this.state = 'starting'
    this.url = null
    this.error = null
    this.stderrBuffer = []

    const child = spawn(nodeBinary, args, {
      env: { ...process.env, DSH_HOME: dshHome },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    })
    this.child = child

    const deadline = Date.now() + (this.options.readyTimeoutMs ?? 60_000)
    const readyLine = await new Promise<string>((resolvePromise, reject) => {
      const stdout = createInterface({ input: child.stdout })
      const stderr = createInterface({ input: child.stderr })

      const timer = setInterval(() => {
        if (Date.now() > deadline) {
          finish(new Error(`DSH did not output ready line within ${this.options.readyTimeoutMs ?? 60_000}ms`))
        }
      }, 1000)

      let settled = false
      // Exactly-once settlement: clear the watchdog and close the readlines.
      const finish = (error: Error | null, value?: string) => {
        if (settled) return
        settled = true
        clearInterval(timer)
        stdout.close()
        stderr.close()
        if (error) reject(error)
        else resolvePromise(value!)
      }

      stdout.on('line', (line) => {
        this.options.onLog?.('stdout', line)
        const match = READY_LINE.exec(line.trim())
        if (match) finish(null, line.trim())
      })
      stderr.on('line', (line) => {
        this.options.onLog?.('stderr', line)
        this.stderrBuffer.push(line)
        if (this.stderrBuffer.length > 200) this.stderrBuffer.shift()
      })

      child.once('error', (err) => finish(new Error(`failed to spawn DSH: ${err.message}`)))
      child.once('exit', (code, signal) => {
        if (!settled) {
          const tail = this.stderrTail.join('\n')
          finish(new Error(`DSH exited before ready (code=${code ?? 'null'} signal=${signal ?? 'none'})\n${tail}`))
        }
      })
    })

    const match = READY_LINE.exec(readyLine)
    if (!match) throw new Error(`unexpected ready line: ${readyLine}`)
    const port = Number(match[1])
    if (!Number.isInteger(port) || port === 0 || port > 65535) {
      throw new Error(`invalid port parsed from ready line: ${readyLine}`)
    }
    this.url = `http://127.0.0.1:${port}`
    this.state = 'ready'
    return this.url
  }

  /** Gracefully stop the sidecar (SIGTERM → kill after grace). */
  async stop(): Promise<void> {
    const child = this.child
    if (!child) return
    await new Promise<void>((resolvePromise) => {
      const finished = () => resolvePromise()
      child.once('exit', finished)
      child.kill()
      setTimeout(() => {
        if (this.child === child) {
          child.kill('SIGKILL')
        }
        setTimeout(finished, 1000)
      }, 3000)
    })
    this.child = null
    this.state = 'stopped'
    this.url = null
  }

  get port(): number | null {
    if (!this.url) return null
    const u = new URL(this.url)
    return Number(u.port)
  }
}

/** Spawn and collect the ready URL in one call. */
export async function startSidecar(options: SidecarOptions = {}): Promise<DSHSidecar> {
  const sidecar = new DSHSidecar(options)
  await sidecar.start()
  return sidecar
}

/** Directory of the CLI bin (for resource layouts). */
export function cliDir(cliPath: string): string {
  return dirname(cliPath)
}
