/**
 * Share sheet — hand DSH output (text/files) to other apps on mobile.
 * Native contract: `share_text` / `share_files` (invoke).
 * @module @dsh-platform/native-share-sheet
 */
import { invoke } from '@tauri-apps/api/core'

export interface ShareTextOptions {
  title?: string
  subject?: string
}

export async function shareText(text: string, options: ShareTextOptions = {}): Promise<void> {
  try {
    await invoke('share_text', { text, title: options.title ?? 'DSH', subject: options.subject ?? '' })
  } catch {
    /* share unsupported (desktop preview) */
  }
}

export async function shareFiles(paths: string[], title = 'DSH 附件'): Promise<void> {
  try {
    await invoke('share_files', { paths, title })
  } catch {
    /* share unsupported */
  }
}

export const shareSheet = { shareText, shareFiles }
