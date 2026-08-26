<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import type { UnlistenFn } from '@tauri-apps/api/event'
import TitleBar from './components/TitleBar.vue'
import HarnessFrame from './components/HarnessFrame.vue'
import { useSidecar } from './composables/useSidecar'
import { useTheme } from '@dsh-platform/shared-ui'
import { setTrayStatus } from '@dsh-platform/native-system-tray'

const sidecar = useSidecar()
const theme = useTheme()

let unlistenThemeSync: UnlistenFn | null = null

onMounted(async () => {
  void sidecar.start()

  // theme-sync 桥接消费：DSH web 内的主题变更经 desktop-bridge 插件
  // POST /theme-sync → 原生桥 → 此处事件 → 同步壳主题（端到端链路）。
  try {
    const { listen } = await import('@tauri-apps/api/event')
    unlistenThemeSync = await listen<{
      theme: 'light' | 'dark' | 'system'
      source: string
      timestamp: number
    }>('bridge://theme-sync', (event) => {
      if (event.payload.theme === 'light' || event.payload.theme === 'dark' || event.payload.theme === 'system') {
        theme.setTheme(event.payload.theme)
      }
    })
  } catch {
    /* 纯浏览器预览时无 Tauri 事件通道 */
  }
})

onUnmounted(() => unlistenThemeSync?.())

// Mirror sidecar state into the tray (native command is a no-op until tray
// integration lands in Phase 3 — errors are swallowed by the plugin).
sidecar.stateReady((state) => {
  void setTrayStatus(state === 'ready' ? 'ready' : state === 'starting' ? 'starting' : state === 'error' ? 'error' : 'idle')
})
</script>

<template>
  <div class="shell" :data-theme="theme.applied.value">
    <TitleBar :state="sidecar.state.value" :dsh-url="sidecar.url.value" />
    <HarnessFrame
      :url="sidecar.url.value"
      :state="sidecar.state.value"
      :error="sidecar.error.value"
      :runtime-missing="!sidecar.runtimeInstalled.value"
      :installing="sidecar.installing.value"
      :on-install-runtime="sidecar.installRuntime"
    />
  </div>
</template>

<style scoped>
.shell {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--dsh-bg);
  overflow: hidden;
}
</style>
