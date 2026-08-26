<script setup lang="ts">
import { onMounted } from 'vue'
import TitleBar from './components/TitleBar.vue'
import HarnessFrame from './components/HarnessFrame.vue'
import { useSidecar } from './composables/useSidecar'
import { useTheme } from '@dsh-platform/shared-ui'
import { setTrayStatus } from '@dsh-platform/native-system-tray'

const sidecar = useSidecar()
const theme = useTheme()

onMounted(() => {
  void sidecar.start()
})

// Mirror sidecar state into the tray (native command is a no-op until tray
// integration lands in Phase 3 — errors are swallowed by the plugin).
sidecar.stateReady((state) => {
  void setTrayStatus(state === 'ready' ? 'ready' : state === 'starting' ? 'starting' : state === 'error' ? 'error' : 'idle')
})
</script>

<template>
  <div class="shell" :data-theme="theme.applied.value">
    <TitleBar :state="sidecar.state.value" :dsh-url="sidecar.url.value" />
    <HarnessFrame :url="sidecar.url.value" :state="sidecar.state.value" :error="sidecar.error.value" />
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
