/**
 * useBridge — React hook wrapping a stable BridgeClient (all platforms).
 * @module @dsh-platform/shared-ui/hooks
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { BridgeClient, type BridgeClientOptions, type BridgeMethod, type BridgeResponse } from '@dsh-platform/shared-bridge'

export interface UseBridgeReturn {
  client: BridgeClient
  endpoint: string
  connected: boolean
  lastError: string | null
  request: (method: BridgeMethod, payload?: Record<string, any>) => Promise<BridgeResponse | undefined>
  notify: (title: string, body: string, sound?: boolean) => Promise<void>
  reconnect: () => void
}

export function useBridge(options: BridgeClientOptions = {}): UseBridgeReturn {
  const clientRef = useRef<BridgeClient>(new BridgeClient(options))
  const [endpoint, setEndpoint] = useState<string>(clientRef.current.url)
  const [connected, setConnected] = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)

  const probe = useCallback(async () => {
    const ok = await clientRef.current.ping()
    setConnected(ok)
    setLastError(ok ? null : `bridge unreachable at ${clientRef.current.url}`)
  }, [])

  const reconnect = useCallback(() => {
    clientRef.current = new BridgeClient(options)
    setEndpoint(clientRef.current.url)
    void probe()
  }, [options, probe])

  const request = useCallback(async (method: BridgeMethod, payload: Record<string, any> = {}) => {
    const response = await clientRef.current.request(method, payload)
    if (response && !response.success) setLastError(response.error ?? 'bridge error')
    return response
  }, [])

  const notify = useCallback(async (title: string, body: string, sound = true) => {
    await clientRef.current.notify({ title, body, sound })
  }, [])

  useEffect(() => {
    void probe()
    const timer = setInterval(() => void probe(), 15_000)
    return () => clearInterval(timer)
  }, [probe])

  return { client: clientRef.current, endpoint, connected, lastError, request, notify, reconnect }
}
