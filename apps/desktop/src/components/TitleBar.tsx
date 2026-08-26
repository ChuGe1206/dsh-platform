import { useEffect, useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { minimize, toggleMaximize, closeWindow } from '@dsh-platform/native-window-manager'

interface TitleBarProps {
  state: 'idle' | 'starting' | 'ready' | 'error'
  dshUrl: string | null
}

function stateText(state: string): string {
  return state === 'ready' ? 'DSH 已就绪' : state === 'starting' ? '正在启动 DSH…' : state === 'error' ? '启动失败' : '空闲'
}

function MinimizeIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16">
      <line x1="3" y1="8" x2="13" y2="8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function MaximizeIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16">
      <rect x="3" y="3" width="10" height="10" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

function RestoreIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16">
      <rect x="5.5" y="3.5" width="7" height="6.5" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4.5 5.8v6.2a1.5 1.5 0 0 0 1.5 1.5h5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16">
      <line x1="4.2" y1="4.2" x2="11.8" y2="11.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="11.8" y1="4.2" x2="4.2" y2="11.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

export default function TitleBar({ state, dshUrl }: TitleBarProps) {
  const [focused, setFocused] = useState(true)
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    let unlistenFocus: UnlistenFn | null = null
    let unlistenResize: (() => void) | null = null
    let cancelled = false
    const win = getCurrentWindow()

    const syncMaximized = async () => {
      try {
        const maximized = await win.isMaximized()
        if (!cancelled) setIsMaximized(maximized)
      } catch {
        /* outside Tauri */
      }
    }

    void (async () => {
      try {
        unlistenFocus = await listen<boolean>('window-focused', (event) => {
          if (!cancelled) setFocused(event.payload)
        })
        unlistenResize = await win.onResized(() => {
          if (!cancelled) void syncMaximized()
        })
        await syncMaximized()
      } catch {
        /* outside Tauri (vite preview) */
      }
    })()

    return () => {
      cancelled = true
      unlistenFocus?.()
      unlistenResize?.()
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
          <MinimizeIcon />
        </button>
        <button className="titlebar__button" title={isMaximized ? '还原' : '最大化'} onClick={() => toggleMaximize()}>
          {isMaximized ? <RestoreIcon /> : <MaximizeIcon />}
        </button>
        <button className="titlebar__button titlebar__button--close" title="关闭" onClick={() => closeWindow()}>
          <CloseIcon />
        </button>
      </div>
    </header>
  )
}

