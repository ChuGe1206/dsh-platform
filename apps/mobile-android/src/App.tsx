import { useEffect, useState } from 'react'
import { ChatPanel, Sidebar, Composer, useDSH } from '@dsh-platform/shared-ui'
import { RemoteClient } from '@dsh-platform/shared-dsh/browser'
import { requestPermission, getToken } from '@dsh-platform/native-push-notification'
import { pickAndAttach } from '@dsh-platform/native-file-picker'

/**
 * Android shell — remote mode.
 *
 * Flow: user enters the desktop DSH web URL (or a forwarded tunnel address);
 * RemoteClient probes it and wires the event transport; the shell receives
 * pushes via native-push-notification. There is no sidecar on the device.
 */
export default function App() {
  const [endpoint, setEndpoint] = useState(() => localStorage.getItem('dsh:remote') ?? '')
  const [remote, setRemote] = useState<RemoteClient | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dsh = useDSH()

  useEffect(() => {
    void (async () => {
      try {
        const token = await getToken()
        if (token) console.log('[push] token ready', token.platform)
        await requestPermission()
      } catch {
        /* native not available outside Tauri */
      }
    })()
  }, [])

  async function connect() {
    const url = endpoint.trim()
    if (!url) return
    setConnecting(true)
    setError(null)
    localStorage.setItem('dsh:remote', url)
    const client = new RemoteClient({ endpoint: url })
    setRemote(client)
    try {
      await client.connect()
      client.onEvent((event) => dsh.handleEvent(event))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setConnecting(false)
    }
  }

  async function submit(text: string) {
    // Remote mode: the shell sends the message through the bridge; the session
    // remains on the desktop DSH instance.
    await remote?.send({ type: 'turn/start', payload: { text }, timestamp: Date.now() })
  }

  async function attach() {
    await pickAndAttach()
  }

  return (
    <div className="mobile">
      <header className="mobile__bar">
        <h1>DSH Mobile</h1>
        <button className="dsh-button" onClick={() => void attach()}>
          ⊕
        </button>
      </header>

      <form
        className="mobile__connect"
        onSubmit={(e) => {
          e.preventDefault()
          void connect()
        }}
      >
        <input
          className="dsh-input mobile__endpoint"
          placeholder="http://192.168.1.10:13375 (桌面 DSH Web 地址)"
          value={endpoint}
          onChange={(e) => setEndpoint(e.target.value)}
        />
        <button className="dsh-button dsh-button--primary" disabled={connecting || !endpoint.trim()}>
          {connecting ? '连接中…' : '连接'}
        </button>
      </form>
      {error && <p className="mobile__error">{error}</p>}

      <div className="mobile__body">
        <Sidebar dsh={dsh} />
        <div className="mobile__chat">
          <ChatPanel dsh={dsh} embedded />
          <Composer onSubmit={submit} />
        </div>
      </div>
    </div>
  )
}
