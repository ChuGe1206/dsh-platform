<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ChatPanel, Sidebar, Composer, useDSH } from '@dsh-platform/shared-ui'
import { RemoteClient } from '@dsh-platform/shared-dsh/browser'
import { hmsPush, getToken } from '@dsh-platform/native-hms-push'
import { discover } from '@dsh-platform/native-distributed-softbus'

/** HarmonyOS H5 shell — remote mode; native pushes arrive via HMS Push. */
const endpoint = ref(localStorage.getItem('dsh:remote-harmony') ?? '')
const remote = ref<RemoteClient | null>(null)
const connecting = ref(false)
const error = ref<string | null>(null)
const dsh = useDSH()
const nearby = ref<string[]>([])

onMounted(async () => {
  const token = await getToken()
  if (token) console.log('[hms] token ready', token.token.slice(0, 8))
  const devices = await discover(2000)
  nearby.value = devices.map((device) => device.name)
})

async function connect() {
  const url = endpoint.value.trim()
  if (!url) return
  connecting.value = true
  error.value = null
  localStorage.setItem('dsh:remote-harmony', url)
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

async function notifyMe() {
  await hmsPush.sendPush({ title: 'DSH', body: '回合完成', sound: true })
}
</script>

<template>
  <div class="harmony">
    <header class="harmony__bar">
      <h1>DSH Harmony</h1>
      <button class="dsh-button" @click="notifyMe">🔔</button>
    </header>
    <form class="harmony__connect" @submit.prevent="connect">
      <input v-model="endpoint" class="dsh-input harmony__endpoint" placeholder="http://192.168.1.10:13375" />
      <button class="dsh-button dsh-button--primary" :disabled="connecting || !endpoint.trim()">连接</button>
    </form>
    <p v-if="error" class="harmony__error">{{ error }}</p>
    <p v-if="nearby.length" class="harmony__nearby">附近设备：{{ nearby.join('、') }}</p>
    <div class="harmony__body">
      <Sidebar :dsh="dsh" />
      <div class="harmony__chat">
        <ChatPanel :dsh="dsh" embedded />
        <Composer @submit="submit" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.harmony {
  height: 100vh;
  display: flex;
  flex-direction: column;
}
.harmony__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px var(--dsh-gap-m);
  border-bottom: 1px solid var(--dsh-border);
}
.harmony__bar h1 {
  font-size: 15px;
  margin: 0;
}
.harmony__connect {
  display: flex;
  gap: var(--dsh-gap-s);
  padding: var(--dsh-gap-m);
}
.harmony__endpoint {
  flex: 1;
}
.harmony__error {
  color: var(--dsh-danger);
  padding: 0 var(--dsh-gap-m);
  margin: 0;
}
.harmony__nearby {
  color: var(--dsh-text-secondary);
  padding: 0 var(--dsh-gap-m);
  margin: 0 0 8px;
}
.harmony__body {
  flex: 1;
  display: flex;
  min-height: 0;
}
.harmony__chat {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
</style>
