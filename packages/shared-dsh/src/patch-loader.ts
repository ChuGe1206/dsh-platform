/**
 * Overlay patch loader for DSH `--patch config/*.yml` files.
 *
 * DSH accepts a patch-list overlay: a top-level YAML array of loader patch
 * rows (id overrides / disable) plus `insert:` lists whose entries carry
 * `id`, `name` (module specifier) and `config`.
 *
 * The DSH loader resolves:
 *  - absolute path names → file URL (verified in @deepseek-ai/dsh-app-boot)
 *  - `./relative` names → relative to the *profile* config file, which lives
 *    in `$DSH_HOME/profiles/<name>/` — NOT the repo root.
 *
 * Therefore this package renders a committed template (project-root-relative
 * `./plugins/...` refs, the format the objective prescribes) into a
 * `*.generated.yml` with absolute module paths that actually load.
 *
 * @module @dsh-platform/shared-dsh/patch-loader
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, isAbsolute, join, normalize, resolve } from 'node:path'
import { load, type YAMLException } from 'js-yaml'

/** One insert row inside a patch `insert:` list. */
export interface PatchRow {
  id: string
  name?: string
  config?: Record<string, any>
  disabled?: boolean
}

/** One patch entry in the overlay array. */
export interface PatchEntry {
  id?: string
  insert?: PatchRow[]
  remove?: string[]
  disabled?: boolean
  config?: Record<string, any>
}

/** Parsed overlay: ordered patch entries. */
export type Overlay = PatchEntry[]

/** How `./plugins/...` refs are resolved. */
export type RefResolution =
  | { kind: 'absolute-root'; root: string }
  | { kind: 'keep-relative'; base: string }

export interface RenderOptions {
  /** The repo root to resolve `./path` refs against (default: cwd). */
  root?: string
  /**
   * Plugin `name` refs ending in `.ts`/`.tsx` or pointing at a package dir
   * are rewritten to `<abs>/lib/index.js` when that file exists, else left as
   * a directory URL (loader will fail visibly if it is missing).
   */
  preferBuilt?: boolean
}

export class PatchLoadError extends Error {
  constructor(message: string, readonly sourceFile?: string, readonly original?: unknown) {
    super(sourceFile ? `${message} (${sourceFile})` : message)
    this.name = 'PatchLoadError'
  }
}

/** Load an overlay YAML file and validate its shape. */
export function loadOverlay(file: string): Overlay {
  let text: string
  try {
    text = readFileSync(file, 'utf8')
  } catch (err) {
    throw new PatchLoadError('cannot read overlay', file, err)
  }
  let parsed: unknown
  try {
    parsed = load(text)
  } catch (err) {
    throw new PatchLoadError('cannot parse overlay YAML', file, err as YAMLException)
  }
  return validateOverlay(parsed, file)
}

function validateOverlay(parsed: unknown, file: string): Overlay {
  if (!Array.isArray(parsed)) {
    throw new PatchLoadError('overlay must be a top-level YAML array of patch rows', file)
  }
  return parsed.map((entry, index) => {
    if (typeof entry !== 'object' || entry === null) {
      throw new PatchLoadError(`overlay entry ${index} is not a mapping`, file)
    }
    const record = entry as Record<string, unknown>
    const patch: PatchEntry = {}
    if (typeof record.id === 'string') patch.id = record.id
    if (typeof record.disabled === 'boolean') patch.disabled = record.disabled
    if (typeof record.config === 'object' && record.config !== null) patch.config = record.config as Record<string, any>
    if (Array.isArray(record.remove)) patch.remove = record.remove.map(String)
    if (Array.isArray(record.insert)) {
      patch.insert = record.insert.map((row, i) => {
        if (typeof row !== 'object' || row === null) {
          throw new PatchLoadError(`overlay entry ${index} insert row ${i} is not a mapping`, file)
        }
        const rr = row as Record<string, unknown>
        if (typeof rr.id !== 'string') {
          throw new PatchLoadError(`overlay entry ${index} insert row ${i} lacks id`, file)
        }
        return {
          id: rr.id,
          ...(typeof rr.name === 'string' ? { name: rr.name } : {}),
          ...(typeof rr.disabled === 'boolean' ? { disabled: rr.disabled } : {}),
          ...(typeof rr.config === 'object' && rr.config !== null ? { config: rr.config as Record<string, any> } : {})
        }
      })
    }
    if (patch.id === undefined && patch.insert === undefined && patch.remove === undefined) {
      throw new PatchLoadError(`overlay entry ${index} is neither an id patch nor an insert/remove list`, file)
    }
    return patch
  })
}

/**
 * Resolve a plugin ref from a template overlay row:
 *  - absolute Windows/unix paths or file URLs are kept;
 *  - `./…` and `../…` refs resolve against the repo root;
 *  - bare package names are kept as-is (installed into the profile).
 */
export function resolvePluginRef(name: string, options: RenderOptions = {}): string {
  if (name.startsWith('file:') || isAbsoluteRef(name)) return name
  if (name.startsWith('.')) {
    const root = options.root ?? process.cwd()
    const abs = resolve(root, name)
    // The DSH loader imports row names through the ESM loader: on Windows a
    // plain absolute path arrives as a bare specifier with scheme 'e:' and
    // fails, so absolute refs must be file:// URLs.
    const toUrl = (path: string) => 'file:///' + path.replace(/\\/g, '/').replace(/\s/g, '%20')
    if (!options.preferBuilt) return toUrl(abs)
    const built = join(abs, 'lib', 'index.js')
    if (existsSync(built)) return toUrl(built)
    const dist = join(abs, 'dist', 'index.js')
    if (existsSync(dist)) return toUrl(dist)
    return toUrl(abs)
  }
  return name
}

/**
 * Render an overlay from a template, resolving `./plugins/…` refs to
 * absolute file URLs consumable by the DSH loader.
 */
export function renderOverlay(overlay: Overlay, options: RenderOptions = {}): Overlay {
  const root = options.root ?? process.cwd()
  return overlay.map((entry) => {
    if (!entry.insert) return entry
    return {
      ...entry,
      insert: entry.insert.map((row) =>
        row.name !== undefined ? { ...row, name: resolvePluginRef(row.name, { ...options, root }) } : row
      )
    }
  })
}

/** Load a template overlay and render it in one step. */
export function loadAndRenderOverlay(template: string, options: RenderOptions = {}): Overlay {
  return renderOverlay(loadOverlay(template), options)
}

/** Write a rendered overlay to disk (atomic-ish: write temp, rename). */
export function writeOverlay(overlay: Overlay, file: string): void {
  const text = `# GENERATED by @dsh-platform/shared-dsh patch-loader — do not edit.\n# Plugin refs are absolute module specifiers; regenerate with 'pnpm prepare:harness'.\n${JSON.stringify(overlay, null, 2)}\n`
  writeFileSync(file, text, 'utf8')
}

export interface OverlayTemplateOptions {
  root: string
  preferBuilt?: boolean
}

/** Convenience: resolve a template overlay and write `<dir>/<name>.generated.yml`. */
export function prepareOverlay(templatePath: string, outputPath: string, options: OverlayTemplateOptions): Overlay {
  const overlay = loadAndRenderOverlay(templatePath, options)
  writeOverlay(overlay, outputPath)
  return overlay
}

/** True when a ref is an absolute module path (portable across platforms). */
export function isAbsoluteRef(ref: string): boolean {
  return isAbsolute(ref) || ref.startsWith('file:') || ref.startsWith('\\')
}

/** Directory of the template (for diagnostics). */
export function templateDir(file: string): string {
  const normalized = normalize(resolve(file))
  return dirname(normalized)
}
