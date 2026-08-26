<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { listen, emit, type UnlistenFn } from '@tauri-apps/api/event'

const props = defineProps<{
  url: string | null
  state: 'idle' | 'starting' | 'ready' | 'error'
  error: string | null
}>()

const frameRef = ref<HTMLIFrameElement | null>(null)
const loaded = ref(false)
const retryCounter = ref(0)
let unlisten: UnlistenFn | null = null

onMounted(async () => {
  try {
    unlisten = await listen<string>('harness-start-failed', () => {
      loaded.value = false
    })
  } catch {
    /* outside Tauri */
  }
})

onUnmounted(() => unlisten?.())

function onHarnessLoad() {
  loaded.value = true
  emit('harness-frame-loaded', { url: props.url })
}

function retry() {
  retryCounter.value += 1
  loaded.value = false
  emit('harness-retry', { attempt: retryCounter.value })
}
</script>

<template>
  <div class="harness" :data-state="state">
    <iframe
      v-if="url"
      ref="frameRef"
      :key="retryCounter"
      :src="url"
      class="harness__frame"
      sandbox="allow-same-origin allow-scripts allow-forms"
      allow="clipboard-read; clipboard-write"
      @load="onHarnessLoad"
    />
    <div v-else class="harness__overlay" data-testid="harness-overlay">
      <div class="harness__spinner" />
      <template v-if="state === 'error'">
        <p class="harness__error">{{ error || 'DSH 启动失败' }}</p>
        <button class="dsh-button harness__retry" data-testid="retry" @click="retry">重试</button>
      </template>
      <template v-else>
        <p>正在启动 DSH…</p>
      </template>
    </div>
  </div>
</template>

<style scoped>
.harness {
  flex: 1;
  position: relative;
  min-height: 0;
}
.harness__frame {
  width: 100%;
  height: 100%;
  border: none;
  background: var(--dsh-bg);
}
.harness__overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  color: var(--dsh-text-secondary);
}
.harness__spinner {
  width: 42px;
  height: 42px;
  border: 3px solid var(--dsh-border);
  border-top-color: var(--dsh-accent);
  border-radius: 50%;
  animation: harness-spin 1s linear infinite;
}
.harness__error {
  color: var(--dsh-danger);
  max-width: 480px;
  text-align: center;
  white-space: pre-wrap;
}
@keyframes harness-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
