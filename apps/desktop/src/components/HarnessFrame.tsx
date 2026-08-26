import { useEffect, useState } from 'react'
import { listen, emit, type UnlistenFn } from '@tauri-apps/api/event'

interface HarnessFrameProps {
  url: string | null
  state: 'idle' | 'starting' | 'ready' | 'error'
  error: string | null
  /** 未安装 DSH 运行时（发布形态首次引导） */
  runtimeMissing?: boolean
  installing?: boolean
  onInstallRuntime?: () => void
}

export default function HarnessFrame({ url, state, error, runtimeMissing, installing, onInstallRuntime }: HarnessFrameProps) {
  const [loaded, setLoaded] = useState(false)
  const [retryCounter, setRetryCounter] = useState(0)

  useEffect(() => {
    let unlisten: UnlistenFn | null = null
    let cancelled = false
    void (async () => {
      try {
        const un = await listen<string>('harness-start-failed', () => {
          if (!cancelled) setLoaded(false)
        })
        if (!cancelled) unlisten = un
        else un()
      } catch {
        /* outside Tauri */
      }
    })()
    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [])

  const showInstallButton = runtimeMissing === true && state === 'error'

  function onHarnessLoad() {
    setLoaded(true)
    emit('harness-frame-loaded', { url })
  }

  function retry() {
    const next = retryCounter + 1
    setRetryCounter(next)
    setLoaded(false)
    emit('harness-retry', { attempt: next })
  }

  function handleInstallRuntime() {
    void onInstallRuntime?.()
  }

  return (
    <div className="harness" data-state={state}>
      {url ? (
        <iframe
          key={retryCounter}
          src={url}
          className="harness__frame"
          sandbox="allow-same-origin allow-scripts allow-forms"
          allow="clipboard-read; clipboard-write"
          onLoad={onHarnessLoad}
          title="DSH"
        />
      ) : (
        <div className="harness__overlay" data-testid="harness-overlay">
          <div className="harness__spinner" />
          {state === 'error' ? (
            <>
              <p className="harness__error">{error || 'DSH 启动失败'}</p>
              <div className="harness__actions">
                <button className="dsh-button harness__retry" data-testid="retry" onClick={retry}>
                  重试
                </button>
                {showInstallButton && (
                  <button
                    className="dsh-button dsh-button--primary harness__install"
                    data-testid="install-runtime"
                    disabled={installing}
                    onClick={handleInstallRuntime}
                  >
                    {installing ? '正在安装 DSH 运行时（首次需要几分钟）…' : '安装 DSH 运行时'}
                  </button>
                )}
              </div>
              {showInstallButton && (
                <p className="harness__hint">需要本机已安装 Node.js；也可手动执行 npm -g install @deepseek-ai/dsh 后点重试</p>
              )}
            </>
          ) : (
            <p>正在启动 DSH…</p>
          )}
        </div>
      )}
    </div>
  )
}
