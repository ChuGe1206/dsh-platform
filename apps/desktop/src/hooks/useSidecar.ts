/**
 * useSidecar — the desktop shell's DSH sidecar state machine (React).
 *
 * Talks to the Rust backend through Tauri commands:
 *   start_sidecar / stop_sidecar / restart_sidecar / get_dsh_status
 * and events: `harness-ready` (payload { url }), `harness-status`.
 *
 * @module apps/desktop/hooks
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

export type SidecarPhase = 'idle' | 'starting' | 'ready' | 'error'

export interface DSHStatus {
  state: SidecarPhase
  url: string | null
  port: number | null
  error: string | null
  uptimeMs: number | null
  dshHome: string | null
}

export interface UseSidecarReturn {
  state: SidecarPhase
  url: string | null
  error: string | null
  status: DSHStatus | null
  start: () => Promise<void>
  stop: () => Promise<void>
  restart: () => Promise<void>
  installRuntime: () => Promise<void>
  runtimeInstalled: boolean
  installing: boolean
  stateReady: (listener: (phase: SidecarPhase) => void) => () => void
}

export function useSidecar(): UseSidecarReturn {
  const [state, setState] = useState<SidecarPhase>('idle')
  const stateRef = useRef(state)
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<DSHStatus | null>(null)
  const [runtimeInstalled, setRuntimeInstalled] = useState(true)
  const [installing, setInstalling] = useState(false)
  const listeners = useRef(new Set<(phase: SidecarPhase) => void>())

  const setPhase = useCallback((next: SidecarPhase) => {
    stateRef.current = next
    setState(next)
    for (const listener of listeners.current) listener(next)
  }, [])

  const refreshRuntimeStatus = useCallback(async () => {
    try {
      const info = await invoke<{ dshRuntimeInstalled: boolean }>('runtime_status')
      setRuntimeInstalled(info.dshRuntimeInstalled)
    } catch {
      /* 命令不可用（旧版本）时保持默认 */
    }
  }, [])

  const start = useCallback(async () => {
    if (stateRef.current === 'starting' || stateRef.current === 'ready') return
    setPhase('starting')
    setError(null)
    try {
      const dshUrl = await invoke<string>('start_sidecar')
      setUrl(dshUrl)
      setPhase('ready')
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      setPhase('error')
      // CLI 缺失提示 → 刷新运行时状态（决定是否显示安装按钮）
      if (/DSH CLI not found/i.test(message)) void refreshRuntimeStatus()
    }
  }, [setPhase, refreshRuntimeStatus])

  const stop = useCallback(async () => {
    try {
      await invoke('stop_sidecar')
    } catch {
      /* ignore */
    }
    setUrl(null)
    setPhase('idle')
  }, [setPhase])

  const restart = useCallback(async () => {
    await stop()
    await start()
  }, [stop, start])

  const installRuntime = useCallback(async () => {
    if (installing) return
    setInstalling(true)
    setError(null)
    try {
      await invoke('install_runtime')
      setRuntimeInstalled(true)
      await restart()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setPhase('error')
    } finally {
      setInstalling(false)
    }
  }, [installing, restart, setPhase])

  useEffect(() => {
    let unlistenReady: UnlistenFn | null = null
    let unlistenStatus: UnlistenFn | null = null
    let cancelled = false
    void (async () => {
      try {
        unlistenReady = await listen<{ url: string }>('harness-ready', (event) => {
          setUrl(event.payload.url)
          setPhase('ready')
        })
        unlistenStatus = await listen<DSHStatus>('harness-status', (event) => {
          setStatus(event.payload)
          if (event.payload.state === 'ready') setUrl(event.payload.url)
        })
        // Current status (also refreshes after a WebView reload).
        const current = await invoke<DSHStatus>('get_dsh_status')
        if (!cancelled) {
          setStatus(current ?? null)
          if (current?.state === 'ready') {
            setUrl(current.url)
            setPhase('ready')
          }
        }
      } catch {
        /* outside Tauri (plain browser dev preview) */
      }
    })()
    return () => {
      cancelled = true
      unlistenReady?.()
      unlistenStatus?.()
    }
  }, [setPhase])

  const stateReady = useCallback((listener: (phase: SidecarPhase) => void) => {
    listeners.current.add(listener)
    return () => {
      listeners.current.delete(listener)
    }
  }, [])

  return {
    state,
    url,
    error,
    status,
    start,
    stop,
    restart,
    installRuntime,
    runtimeInstalled,
    installing,
    stateReady
  }
}
