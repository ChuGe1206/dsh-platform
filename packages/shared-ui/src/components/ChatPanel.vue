<script setup lang="ts">
import { computed } from 'vue'
import { useDSH, type UseDSHReturn } from '../composables/useDSH'

const props = defineProps<{
  dsh: UseDSHReturn
  /** Whether the panel is the sole content (mobile) or beside a session list. */
  embedded?: boolean
}>()

const currentSession = computed(() => props.dsh.currentSession.value)
const running = computed(() => props.dsh.runningTurns.value)
</script>

<template>
  <section
    :class="['dsh-chat-panel', { 'dsh-chat-panel--embedded': embedded }]"
    data-testid="chat-panel"
  >
    <header class="dsh-chat-panel__header">
      <span class="dsh-chat-panel__title">{{ currentSession?.title || '新会话' }}</span>
      <span v-if="running.length" class="dsh-chip dsh-status--ready">● {{ running.length }} 运行中</span>
    </header>
    <div class="dsh-chat-panel__body">
      <div class="dsh-chat-panel__empty">
        <h3>连接到 DeepSeek Harness</h3>
        <p>
          桌面端由 Tauri 壳启动 DSH sidecar；移动/鸿蒙端通过远程连接。会话与回合事件通过
          <code>shared-bridge</code> 协议同步到本面板。
        </p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.dsh-chat-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
}
.dsh-chat-panel__header {
  display: flex;
  align-items: center;
  gap: var(--dsh-gap-m);
  padding: var(--dsh-gap-m);
  border-bottom: 1px solid var(--dsh-border);
  min-height: 52px;
}
.dsh-chat-panel__title {
  font-weight: 600;
}
.dsh-chat-panel__body {
  flex: 1;
  overflow-y: auto;
  padding: var(--dsh-gap-m);
}
.dsh-chat-panel__empty {
  max-width: 480px;
  margin: 48px auto;
  text-align: center;
  color: var(--dsh-text-secondary);
}
code {
  background: var(--dsh-bg-input);
  border-radius: 4px;
  padding: 1px 6px;
}
</style>
