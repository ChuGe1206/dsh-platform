import { useEffect, useState } from 'react'
import { ChatPanel, Sidebar, Composer, useDSH } from '@dsh-platform/shared-ui'
import { RemoteClient } from '@dsh-platform/shared-dsh/browser'
import { hmsPush, getToken } from '@dsh-platform/native-hms-push'
import { discover } from '@dsh-platform/native-distributed-softbus'

/** HarmonyOS H5 shell — remote mode; native pushes arrive via HMS Push. */
export default function App() {
  const [endpoint, setEndpoint] = useState(() => localStorage.getItem('dsh:remote-harmony') ?? '')
  const [remote, setRemote] = useState<RemoteClient | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nearby, setNearby] = useState<string[]>([])
  const dsh = useDSH()

  useEffect(() => {
    void (async () => {
      try {
        const token = await getToken()
        if (token) console.log('[hms] token ready', token.token.slice(0, 8))
        const devices = await discover(2000)
        setNearby(devices.map((device) => device.name))
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
    localStorage.setItem('dsh:remote-harmony', url)
    const client = new RemoteClient({ endpoint: url })
    setRemote(client)
    try {
      await client.connect()
      client.onEvent((event) => dsh.handleEvent(event))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setConnecting(false)
    }
  }

  async function submit(text: string) {
    await remote?.send({ type: 'turn/start', payload: { text }, timestamp: Date.now() })
  }

  async function notifyMe() {
    await hmsPush.sendPush({ title: 'DSH', body: '回合完成', sound: true })
  }

  return (
    <div className="harmony">
      <header className="harmony__bar">
        <h1>DSH Harmony</h1>
        <button className="dsh-button" onClick={() => void notifyMe()}>
          🔔
        </button>
      </header>
      <form
        className="harmony__connect"
        onSubmit={(e) => {
          e.preventDefault()
          void connect()
        }}
      >
        <input
          className="dsh-input harmony__endpoint"
          placeholder="http://192.168.1.10:13375"
          value={endpoint}
          onChange={(e) => setEndpoint(e.target.value)}
        />
        <button className="dsh-button dsh-button--primary" disabled={connecting || !endpoint.trim()}>
          连接
        </button>
      </form>
      {error && <p className="harmony__error">{error}</p>}
      {nearby.length > 0 && <p className="harmony__nearby">附近设备：{nearby.join('、')}</p>}
      <div className="harmony__body">
        <Sidebar dsh={dsh} />
        <div className="harmony__chat">
          <ChatPanel dsh={dsh} embedded />
          <Composer onSubmit={submit} />
        </div>
      </div>
    </div>
  )
}
