import { useEffect } from 'react'
import TitleBar from './components/TitleBar'
import HarnessFrame from './components/HarnessFrame'
import { useSidecar } from './hooks/useSidecar'
import { useTheme } from '@dsh-platform/shared-ui'
import { setTrayStatus } from '@dsh-platform/native-system-tray'
import './App.css'

export default function App() {
  const { state, url, error, runtimeInstalled, installing, start, installRuntime, stateReady } = useSidecar()
  const { applied, setTheme } = useTheme()

  useEffect(() => {
    void start()

    // theme-sync 桥接消费：DSH web 内的主题变更经 desktop-bridge 插件
    // POST /theme-sync → 原生桥 → 此处事件 → 同步壳主题（端到端链路）。
    let unlistenThemeSync: (() => void) | null = null
    let cancelled = false
    void (async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event')
        const unlisten = await listen<{ theme: 'light' | 'dark' | 'system'; source: string; timestamp: number }>(
          'bridge://theme-sync',
          (event) => {
            const theme = event.payload.theme
            if (theme === 'light' || theme === 'dark' || theme === 'system') setTheme(theme)
          }
        )
        if (!cancelled) unlistenThemeSync = unlisten
        else unlisten()
      } catch {
        /* 纯浏览器预览时无 Tauri 事件通道 */
      }
    })()

    // Mirror sidecar state into the tray.
    const dispose = stateReady((sidecarState) => {
      void setTrayStatus(
        sidecarState === 'ready' ? 'ready' : sidecarState === 'starting' ? 'starting' : sidecarState === 'error' ? 'error' : 'idle'
      )
    })

    return () => {
      cancelled = true
      unlistenThemeSync?.()
      dispose()
    }
  }, [start, stateReady, setTheme])

  return (
    <div className="shell" data-theme={applied}>
      <TitleBar state={state} dshUrl={url} />
      <HarnessFrame
        url={url}
        state={state}
        error={error}
        runtimeMissing={!runtimeInstalled}
        installing={installing}
        onInstallRuntime={installRuntime}
      />
    </div>
  )
}
