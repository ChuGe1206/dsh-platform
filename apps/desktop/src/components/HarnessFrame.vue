<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { listen, emit, type UnlistenFn } from '@tauri-apps/api/event'

const props = defineProps<{
  url: string | null
  state: 'idle' | 'starting' | 'ready' | 'error'
  error: string | null
  /** 未安装 DSH 运行时（发布形态首次引导） */
  runtimeMissing?: boolean
  installing?: boolean
  onInstallRuntime?: () => void
}>()

const frameRef = ref<HTMLIFrameElement | null>(null)
const loaded = ref(false)
const retryCounter = ref(0)
let unlisten: UnlistenFn | null = null

const showInstallButton = computed(
  () => props.runtimeMissing === true && props.state === 'error'
)

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

function installRuntime() {
  void props.onInstallRuntime?.()
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
        <div class="harness__actions">
          <button class="dsh-button harness__retry" data-testid="retry" @click="retry">重试</button>
          <button
            v-if="showInstallButton"
            class="dsh-button dsh-button--primary harness__install"
            data-testid="install-runtime"
            :disabled="installing"
            @click="installRuntime"
          >
            {{ installing ? '正在安装 DSH 运行时（首次需要几分钟）…' : '安装 DSH 运行时' }}
          </button>
        </div>
        <p v-if="showInstallButton" class="harness__hint">
          需要本机已安装 Node.js；也可手动执行 npm -g install @deepseek-ai/dsh 后点重试
        </p>
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
.harness__actions {
  display: flex;
  gap: 8px;
  align-items: center;
}
.harness__hint {
  font-size: 12px;
  max-width: 420px;
  text-align: center;
}
@keyframes harness-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
