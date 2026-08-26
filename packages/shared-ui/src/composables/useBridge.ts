/**
 * useBridge — a stable BridgeClient wrapper for Vue components (all platforms).
 * @module @dsh-platform/shared-ui/composables
 */
import { onScopeDispose, ref, type Ref, type ShallowRef, shallowRef } from 'vue'
import { BridgeClient, type BridgeClientOptions, type BridgeMethod, type BridgeResponse } from '@dsh-platform/shared-bridge'

export interface UseBridgeReturn {
  client: ShallowRef<BridgeClient>
  endpoint: Ref<string>
  connected: Ref<boolean>
  lastError: Ref<string | null>
  request: (method: BridgeMethod, payload?: Record<string, any>) => Promise<BridgeResponse | undefined>
  notify: (title: string, body: string, sound?: boolean) => Promise<void>
  reconnect: () => void
}

export function useBridge(options: BridgeClientOptions = {}): UseBridgeReturn {
  const client = shallowRef<BridgeClient>(new BridgeClient(options))
  const endpoint = ref(client.value.url)
  const connected = ref(false)
  const lastError = ref<string | null>(null)

  let probeTimer: ReturnType<typeof setInterval> | null = null

  async function probe() {
    const ok = await client.value.ping()
    connected.value = ok
    if (!ok) lastError.value = `bridge unreachable at ${endpoint.value}`
    else lastError.value = null
  }

  function reconnect() {
    client.value = new BridgeClient(options)
    endpoint.value = client.value.url
    void probe()
  }

  async function request(method: BridgeMethod, payload: Record<string, any> = {}) {
    const response = await client.value.request(method, payload)
    if (response && !response.success) lastError.value = response.error ?? 'bridge error'
    return response
  }

  async function notify(title: string, body: string, sound = true) {
    await client.value.notify({ title, body, sound })
  }

  void probe()
  probeTimer = setInterval(() => void probe(), 15_000)

  onScopeDispose(() => {
    if (probeTimer) clearInterval(probeTimer)
    probeTimer = null
  })

  return { client, endpoint, connected, lastError, request, notify, reconnect }
}
