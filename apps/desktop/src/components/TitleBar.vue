<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { minimize, toggleMaximize, closeWindow } from '@dsh-platform/native-window-manager'

defineProps<{
  state: 'idle' | 'starting' | 'ready' | 'error'
  dshUrl: string | null
}>()

const focused = ref(true)
let unlisten: UnlistenFn | null = null

onMounted(async () => {
  try {
    unlisten = await listen<boolean>('window-focused', (event) => {
      focused.value = event.payload
    })
  } catch {
    /* outside Tauri (vite preview) */
  }
})

onUnmounted(() => unlisten?.())

const stateText = (state: string) =>
  state === 'ready' ? 'DSH 已就绪' : state === 'starting' ? '正在启动 DSH…' : state === 'error' ? '启动失败' : '空闲'
</script>

<template>
  <header class="titlebar" :class="{ 'titlebar--unfocused': !focused }">
    <div class="titlebar__left">
      <span class="titlebar__dot" />
      <span class="titlebar__app">dsh-platform</span>
      <span class="titlebar__state" data-state="state">{{ stateText(state) }}</span>
    </div>
    <div class="titlebar__title">{{ dshUrl ?? '' }}</div>
    <div class="titlebar__controls">
      <button class="titlebar__button" title="最小化" @click="minimize()">─</button>
      <button class="titlebar__button" title="最大化/还原" @click="toggleMaximize()">□</button>
      <button class="titlebar__button titlebar__button--close" title="关闭" @click="closeWindow()">✕</button>
    </div>
  </header>
</template>

<style scoped>
.titlebar {
  height: var(--dsh-titlebar-h);
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 8px 0 12px;
  background: var(--dsh-bg-elevated);
  border-bottom: 1px solid var(--dsh-border);
  user-select: none;
  flex-shrink: 0;
}
.titlebar--unfocused {
  opacity: 0.85;
}
.titlebar__left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.titlebar__dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--dsh-accent);
  box-shadow: 0 0 6px var(--dsh-accent);
}
.titlebar__app {
  font-weight: 600;
  font-size: 13px;
}
.titlebar__state {
  font-size: 12px;
  color: var(--dsh-text-secondary);
}
.titlebar__title {
  flex: 1;
  text-align: center;
  font-size: 12px;
  color: var(--dsh-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.titlebar__controls {
  display: flex;
  gap: 4px;
}
.titlebar__button {
  width: 42px;
  height: 28px;
  border: none;
  background: transparent;
  color: var(--dsh-text-secondary);
  border-radius: var(--dsh-radius-s);
}
.titlebar__button:hover {
  background: var(--dsh-bg-input);
}
.titlebar__button--close:hover {
  background: var(--dsh-danger);
  color: #fff;
}
</style>
