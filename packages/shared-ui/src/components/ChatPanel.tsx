/**
 * ChatPanel — the conversation surface for the DSH UI kit.
 * @module @dsh-platform/shared-ui/components
 */
import type { UseDSHReturn } from '../hooks/useDSH'

export interface ChatPanelProps {
  dsh: UseDSHReturn
  /** Whether the panel is the sole content (mobile) or beside a session list. */
  embedded?: boolean
}

export function ChatPanel({ dsh, embedded }: ChatPanelProps) {
  const currentSession = dsh.currentSession
  const running = dsh.runningTurns
  return (
    <section className={`dsh-chat-panel${embedded ? ' dsh-chat-panel--embedded' : ''}`} data-testid="chat-panel">
      <header className="dsh-chat-panel__header">
        <span className="dsh-chat-panel__title">{currentSession?.title || '新会话'}</span>
        {running.length > 0 && <span className="dsh-chip dsh-status--ready">● {running.length} 运行中</span>}
      </header>
      <div className="dsh-chat-panel__body">
        <div className="dsh-chat-panel__empty">
          <h3>连接到 DeepSeek Harness</h3>
          <p>
            桌面端由 Tauri 壳启动 DSH sidecar；移动/鸿蒙端通过远程连接。会话与回合事件通过
            <code>shared-bridge</code> 协议同步到本面板。
          </p>
        </div>
      </div>
    </section>
  )
}
