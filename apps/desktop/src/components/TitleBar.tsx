import { useEffect, useState } from 'react'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { minimize, toggleMaximize, closeWindow } from '@dsh-platform/native-window-manager'

interface TitleBarProps {
  state: 'idle' | 'starting' | 'ready' | 'error'
  dshUrl: string | null
}

function stateText(state: string): string {
  return state === 'ready' ? 'DSH 已就绪' : state === 'starting' ? '正在启动 DSH…' : state === 'error' ? '启动失败' : '空闲'
}

export default function TitleBar({ state, dshUrl }: TitleBarProps) {
  const [focused, setFocused] = useState(true)

  useEffect(() => {
    let unlisten: UnlistenFn | null = null
    let cancelled = false
    void (async () => {
      try {
        const un = await listen<boolean>('window-focused', (event) => {
          if (!cancelled) setFocused(event.payload)
        })
        if (!cancelled) unlisten = un
        else un()
      } catch {
        /* outside Tauri (vite preview) */
      }
    })()
    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [])

  return (
    <header className={`titlebar${focused ? '' : ' titlebar--unfocused'}`}>
      <div className="titlebar__left">
        <span className="titlebar__dot" />
        <span className="titlebar__app">dsh-platform</span>
        <span className="titlebar__state" data-state="state">
          {stateText(state)}
        </span>
      </div>
      <div className="titlebar__title">{dshUrl ?? ''}</div>
      <div className="titlebar__controls">
        <button className="titlebar__button" title="最小化" onClick={() => minimize()}>
          ─
        </button>
        <button className="titlebar__button" title="最大化/还原" onClick={() => toggleMaximize()}>
          □
        </button>
        <button className="titlebar__button titlebar__button--close" title="关闭" onClick={() => closeWindow()}>
          ✕
        </button>
      </div>
    </header>
  )
}
