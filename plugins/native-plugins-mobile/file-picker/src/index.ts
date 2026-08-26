/**
 * File picker — open files on Tauri mobile (SAF) or through the bridge.
 * The picked files are reported to the attachments store via `file-drop`.
 * @module @dsh-platform/native-file-picker
 */
import { invoke } from '@tauri-apps/api/core'
import { BridgeClient, type FileDropPayload } from '@dsh-platform/shared-bridge'

export interface PickedFile {
  name: string
  /** data URL or base64 payload */
  data?: string
  path?: string
  size?: number
  mime?: string
}

export interface PickOptions {
  multiple?: boolean
  /** Accepted MIME types/globs (native dependent). */
  filter?: string[]
}

/** Open the native picker; returns picked files (or [] when cancelled). */
export async function pickFiles(options: PickOptions = {}): Promise<PickedFile[]> {
  try {
    return (await invoke('open_file_dialog', {
      multiple: options.multiple ?? false,
      filters: options.filter ?? []
    })) as PickedFile[]
  } catch {
    return []
  }
}

/** Feed picked files into the attachments store (shared-bridge file-drop). */
export async function pickAndAttach(bridge?: BridgeClient): Promise<PickedFile[]> {
  const files = await pickFiles({ multiple: true })
  if (files.length > 0) {
    const payload: FileDropPayload = {
      files: files.map((file) => ({ name: file.name, data: file.data ?? '' })),
      origin: 'mobile'
    }
    if (bridge) await bridge.fileDrop(payload)
    else await invoke('file_drop', { payload })
  }
  return files
}

export const filePicker = { pickFiles, pickAndAttach }
