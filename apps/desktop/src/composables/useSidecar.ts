/**
 * useSidecar — the desktop shell's DSH sidecar state machine.
 *
 * Talked to the Rust backend through Tauri commands:
 *   start_sidecar / stop_sidecar / restart_sidecar / get_dsh_status
 * and events: `harness-ready` (payload { url }), `harness-status`.
 *
 * @module apps/desktop/composables
 */
import { onMounted, onUnmounted, ref, type Ref } from 'vue'
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
  state: Ref<SidecarPhase>
  url: Ref<string | null>
  error: Ref<string | null>
  status: Ref<DSHStatus | null>
  start: () => Promise<void>
  stop: () => Promise<void>
  restart: () => Promise<void>
  /** 在线安装 DSH 运行时（发布形态引导），成功后自动重启 sidecar */
  installRuntime: () => Promise<void>
  /** 运行时是否已安装（install_runtime 状态查询） */
  runtimeInstalled: Ref<boolean>
  installing: Ref<boolean>
  stateReady: (listener: (state: SidecarPhase) => void) => void
}

export function useSidecar(): UseSidecarReturn {
  const state = ref<SidecarPhase>('idle')
  const url = ref<string | null>(null)
  const error = ref<string | null>(null)
  const status = ref<DSHStatus | null>(null)
  const runtimeInstalled = ref<boolean>(true)
  const installing = ref<boolean>(false)
  const listeners = new Set<(phase: SidecarPhase) => void>()
  let unlistenReady: UnlistenFn | null = null
  let unlistenStatus: UnlistenFn | null = null

  function setState(next: SidecarPhase) {
    state.value = next
    for (const listener of listeners) listener(next)
  }

  async function refreshRuntimeStatus() {
    try {
      const info = await invoke<{ dshRuntimeInstalled: boolean }>('runtime_status')
      runtimeInstalled.value = info.dshRuntimeInstalled
    } catch {
      /* 命令不可用（旧版本）时保持默认 */
    }
  }

  async function start() {
    if (state.value === 'starting' || state.value === 'ready') return
    setState('starting')
    error.value = null
    try {
      const dshUrl = await invoke<string>('start_sidecar')
      url.value = dshUrl
      setState('ready')
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
      setState('error')
      // CLI 缺失提示 → 刷新运行时状态（决定是否显示安装按钮）
      if (/DSH CLI not found/i.test(error.value)) void refreshRuntimeStatus()
    }
  }

  async function installRuntime() {
    if (installing.value) return
    installing.value = true
    error.value = null
    try {
      await invoke('install_runtime')
      runtimeInstalled.value = true
      await restart()
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
      setState('error')
    } finally {
      installing.value = false
    }
  }

  async function stop() {
    try {
      await invoke('stop_sidecar')
    } catch {
      /* ignore */
    }
    url.value = null
    setState('idle')
  }

  async function restart() {
    await stop()
    await start()
  }

  onMounted(async () => {
    try {
      unlistenReady = await listen<{ url: string }>('harness-ready', (event) => {
        url.value = event.payload.url
        setState('ready')
      })
      unlistenStatus = await listen<DSHStatus>('harness-status', (event) => {
        status.value = event.payload
        if (event.payload.state === 'ready') url.value = event.payload.url
      })
      // Current status (also refreshes after a WebView reload).
      status.value = (await invoke<DSHStatus>('get_dsh_status')) ?? null
      if (status.value?.state === 'ready') {
        url.value = status.value.url
        setState('ready')
      }
    } catch {
      /* outside Tauri (plain browser dev preview) */
    }
  })

  onUnmounted(() => {
    unlistenReady?.()
    unlistenStatus?.()
  })

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
    stateReady: (listener) => {
      listeners.add(listener)
    }
  }
}
