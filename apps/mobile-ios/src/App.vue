<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ChatPanel, Sidebar, Composer, useDSH } from '@dsh-platform/shared-ui'
import { RemoteClient } from '@dsh-platform/shared-dsh/browser'
import { requestPermission, getToken } from '@dsh-platform/native-push-notification'
import { pickAndAttach } from '@dsh-platform/native-file-picker'
import { shareText } from '@dsh-platform/native-share-sheet'

/** iOS shell — remote mode (mirrors mobile-android; APNs via native-push). */
const endpoint = ref(localStorage.getItem('dsh:remote-ios') ?? '')
const remote = ref<RemoteClient | null>(null)
const connecting = ref(false)
const error = ref<string | null>(null)
const dsh = useDSH()

onMounted(async () => {
  await requestPermission()
  const token = await getToken()
  if (token) console.log('[push] token ready', token.platform)
})

async function connect() {
  const url = endpoint.value.trim()
  if (!url) return
  connecting.value = true
  error.value = null
  localStorage.setItem('dsh:remote-ios', url)
  const client = new RemoteClient({ endpoint: url })
  remote.value = client
  try {
    await client.connect()
    client.onEvent((event) => dsh.handleEvent(event))
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    connecting.value = false
  }
}

async function submit(text: string) {
  await remote.value?.send({ type: 'turn/start', payload: { text }, timestamp: Date.now() })
}

async function attach() {
  await pickAndAttach()
}

async function exportSession() {
  await shareText(JSON.stringify(dsh.sessions.value.slice(0, 1)))
}
</script>

<template>
  <div class="mobile">
    <header class="mobile__bar">
      <h1>DSH Mobile</h1>
      <button class="dsh-button" @click="attach">⊕</button>
      <button class="dsh-button" @click="exportSession">⤴</button>
    </header>
    <form class="mobile__connect" @submit.prevent="connect">
      <input v-model="endpoint" class="dsh-input mobile__endpoint" placeholder="http://192.168.1.10:13375" />
      <button class="dsh-button dsh-button--primary" :disabled="connecting || !endpoint.trim()">
        {{ connecting ? '连接中…' : '连接' }}
      </button>
    </form>
    <p v-if="error" class="mobile__error">{{ error }}</p>
    <div class="mobile__body">
      <Sidebar :dsh="dsh" />
      <div class="mobile__chat">
        <ChatPanel :dsh="dsh" embedded />
        <Composer @submit="submit" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.mobile {
  height: 100vh;
  display: flex;
  flex-direction: column;
}
.mobile__bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px var(--dsh-gap-m);
  border-bottom: 1px solid var(--dsh-border);
}
.mobile__bar h1 {
  font-size: 15px;
  margin: 0;
  flex: 1;
}
.mobile__connect {
  display: flex;
  gap: var(--dsh-gap-s);
  padding: var(--dsh-gap-m);
}
.mobile__endpoint {
  flex: 1;
}
.mobile__error {
  color: var(--dsh-danger);
  padding: 0 var(--dsh-gap-m);
  margin: 0;
}
.mobile__body {
  flex: 1;
  display: flex;
  min-height: 0;
}
.mobile__chat {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
</style>
