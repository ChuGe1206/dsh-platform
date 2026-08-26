/**
 * useDSH — React hook: session/turn reactive state fed by DSH events.
 *
 * In the desktop shell the DSH UI is a separate iframe; useDSH is the shared
 * UI kit's view of the DSH domain used by the harness-adjacent surfaces
 * (composer previews, sidecar status, deliverable lists). On mobile/harmony
 * (remote mode) the same hook is fed by the RemoteClient transport.
 * @module @dsh-platform/shared-ui/hooks
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Session, Turn, DSHEvent } from '@dsh-platform/shared-bridge'

export interface UseDSHOptions {
  /** Optional wired event source (RemoteClient or a plugin bus). */
  source?: {
    onEvent: (listener: (event: DSHEvent) => void) => () => void
  }
}

export interface UseDSHReturn {
  sessions: Session[]
  currentSessionId: string | null
  currentSession: Session | null
  turns: Map<string, Turn>
  runningTurns: Turn[]
  activeSessionCount: number
  handleEvent: (event: DSHEvent) => void
  selectSession: (id: string | null) => void
  upsertSession: (session: Session) => void
}

export function useDSH(options: UseDSHOptions = {}): UseDSHReturn {
  const [sessions, setSessions] = useState<Session[]>([])
  const [turns, setTurns] = useState<Map<string, Turn>>(new Map())
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)

  const upsertSession = useCallback((session: Session) => {
    setSessions((prev) => {
      const next = prev.slice()
      const index = next.findIndex((item) => item.id === session.id)
      if (index >= 0) next[index] = session
      else next.push(session)
      next.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0))
      return next
    })
    setCurrentSessionId((prev) => prev ?? session.id)
  }, [])

  const handleEvent = useCallback(
    (event: DSHEvent) => {
      const payload = event.payload
      switch (event.type) {
        case 'session/start':
          if (payload && typeof payload === 'object' && 'id' in payload) upsertSession(payload as Session)
          break
        case 'turn/start':
        case 'turn/end':
          if (payload && typeof payload === 'object' && 'id' in payload && event.sessionId) {
            const turn = payload as Turn
            setTurns((prev) => new Map(prev).set(turn.id, turn))
          }
          break
        default:
          break
      }
    },
    [upsertSession]
  )

  const selectSession = useCallback((id: string | null) => setCurrentSessionId(id), [])

  useEffect(() => {
    if (!options.source) return
    const dispose = options.source.onEvent(handleEvent)
    return () => dispose()
  }, [options.source, handleEvent])

  const currentSession = useMemo(
    () => sessions.find((item) => item.id === currentSessionId) ?? null,
    [sessions, currentSessionId]
  )
  const runningTurns = useMemo(
    () => [...turns.values()].filter((turn) => turn.status === 'running'),
    [turns]
  )
  const activeSessionCount = sessions.length

  return {
    sessions,
    currentSessionId,
    currentSession,
    turns,
    runningTurns,
    activeSessionCount,
    handleEvent,
    selectSession,
    upsertSession
  }
}
