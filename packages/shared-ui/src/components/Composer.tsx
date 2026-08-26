/**
 * Composer — message input for the DSH UI kit.
 * @module @dsh-platform/shared-ui/components
 */
import { useState, type DragEvent, type KeyboardEvent } from 'react'

export interface ComposerProps {
  disabled?: boolean
  placeholder?: string
  /** Async submit; parent decides transport (bridge / remote / local DSH). */
  onSubmit?: (text: string) => void | Promise<void>
  onDropFiles?: (files: Array<{ name: string; data: string }>) => void
}

export function Composer({
  disabled,
  placeholder = '输入消息，Enter 发送，Shift+Enter 换行',
  onSubmit,
  onDropFiles
}: ComposerProps) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)

  async function send() {
    const value = text.trim()
    if (!value || disabled || sending) return
    setSending(true)
    try {
      await onSubmit?.(value)
      setText('')
    } finally {
      setSending(false)
    }
  }

  function onKeydown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      void send()
    }
  }

  async function onDrop(event: DragEvent<HTMLDivElement>) {
    const items = Array.from(event.dataTransfer?.items ?? []).filter((item) => item.kind === 'file')
    if (items.length === 0) return
    event.preventDefault()
    const files: Array<{ name: string; data: string }> = []
    for (const item of items) {
      const file = item.getAsFile()
      if (!file) continue
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(file)
      })
      files.push({ name: file.name, data: dataUrl })
    }
    onDropFiles?.(files)
  }

  return (
    <footer className="dsh-composer">
      <div className="dsh-composer__drop" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
        <textarea
          className="dsh-textarea dsh-composer__input"
          placeholder={placeholder}
          disabled={disabled}
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeydown}
        />
        <div className="dsh-composer__actions">
          <button
            className="dsh-button dsh-button--primary"
            disabled={disabled || text.trim().length === 0 || sending}
            onClick={send}
          >
            {sending ? '发送中…' : '发送'}
          </button>
        </div>
      </div>
    </footer>
  )
}
