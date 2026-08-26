/**
 * Sidebar — the session list for the DSH UI kit.
 * @module @dsh-platform/shared-ui/components
 */
import type { UseDSHReturn } from '../hooks/useDSH'

export interface SidebarProps {
  dsh: UseDSHReturn
}

export function Sidebar({ dsh }: SidebarProps) {
  const sessions = dsh.sessions
  const selected = dsh.currentSessionId
  return (
    <aside className="dsh-sidebar">
      <div className="dsh-sidebar__head">
        <span className="dsh-sidebar__title">Sessions</span>
        <button className="dsh-sidebar__new dsh-button" data-testid="new-session" onClick={() => dsh.selectSession(null)}>
          +
        </button>
      </div>
      <ul className="dsh-sidebar__list" data-testid="session-list">
        {sessions.map((session) => (
          <li
            key={session.id}
            className={`dsh-sidebar__item${selected === session.id ? ' dsh-sidebar__item--active' : ''}`}
            onClick={() => dsh.selectSession(session.id)}
          >
            <span className="dsh-sidebar__item-title">{session.title || '未命名会话'}</span>
            <span className="dsh-sidebar__item-time">{new Date(session.updatedAt).toLocaleString()}</span>
          </li>
        ))}
        {sessions.length === 0 && <li className="dsh-sidebar__empty">暂无会话</li>}
      </ul>
    </aside>
  )
}
