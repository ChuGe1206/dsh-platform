<script setup lang="ts">
import { computed } from 'vue'
import { useDSH, type UseDSHReturn } from '../composables/useDSH'

const props = defineProps<{
  dsh: UseDSHReturn
}>()

const sessions = computed(() => props.dsh.sessions.value)
const selected = computed(() => props.dsh.currentSessionId.value)

function select(id: string) {
  props.dsh.selectSession(id)
}

function newSession() {
  props.dsh.selectSession(null)
}
</script>

<template>
  <aside class="dsh-sidebar">
    <div class="dsh-sidebar__head">
      <span class="dsh-sidebar__title">Sessions</span>
      <button class="dsh-sidebar__new dsh-button" data-testid="new-session" @click="newSession">+</button>
    </div>
    <ul class="dsh-sidebar__list" data-testid="session-list">
      <li
        v-for="session in sessions"
        :key="session.id"
        :class="['dsh-sidebar__item', { 'dsh-sidebar__item--active': selected === session.id }]"
        @click="select(session.id)"
      >
        <span class="dsh-sidebar__item-title">{{ session.title || '未命名会话' }}</span>
        <span class="dsh-sidebar__item-time">{{ new Date(session.updatedAt).toLocaleString() }}</span>
      </li>
      <li v-if="sessions.length === 0" class="dsh-sidebar__empty">暂无会话</li>
    </ul>
  </aside>
</template>

<style scoped>
.dsh-sidebar {
  width: 240px;
  flex-shrink: 0;
  background: var(--dsh-bg-elevated);
  border-right: 1px solid var(--dsh-border);
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.dsh-sidebar__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--dsh-gap-m);
  border-bottom: 1px solid var(--dsh-border);
}
.dsh-sidebar__title {
  font-weight: 600;
}
.dsh-sidebar__list {
  list-style: none;
  margin: 0;
  padding: var(--dsh-gap-s);
  overflow-y: auto;
  flex: 1;
}
.dsh-sidebar__item {
  padding: 10px 12px;
  border-radius: var(--dsh-radius-s);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.dsh-sidebar__item:hover {
  background: var(--dsh-bg-input);
}
.dsh-sidebar__item--active {
  background: var(--dsh-bg-input);
  outline: 1px solid var(--dsh-accent);
}
.dsh-sidebar__item-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-sidebar__item-time {
  font-size: 11px;
  color: var(--dsh-text-secondary);
}
.dsh-sidebar__empty {
  padding: 20px 12px;
  color: var(--dsh-text-secondary);
}
</style>
