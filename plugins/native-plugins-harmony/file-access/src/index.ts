/**
 * File access — pick/save files on HarmonyOS through HarmonyBridge
 * (`file.pick`, `file.save`). Picked files land in the attachments store
 * via the native file-drop path.
 * @module @dsh-platform/native-file-access
 */
import { callNative, onNativeEvent } from '@dsh-platform/native-harmony-bridge'

export interface PickedFile {
  uri: string
  name: string
  size?: number
  mime?: string
}

export async function pick(): Promise<PickedFile[]> {
  const result = await callNative('file.pick', { multiple: true })
  return result.ok ? ((result.data as PickedFile[]) ?? []) : []
}

export async function save(uri: string, content: string): Promise<boolean> {
  const result = await callNative('file.save', { uri, content })
  return result.ok
}

/** Subscribe to native events (`file.dropped` when the shell drops files). */
export function onFileDropped(handler: (files: PickedFile[]) => void): () => void {
  return onNativeEvent((event) => {
    if (event.type === 'file.dropped') handler((event.payload as PickedFile[]) ?? [])
  })
}

export const fileAccess = { pick, save, onFileDropped }
