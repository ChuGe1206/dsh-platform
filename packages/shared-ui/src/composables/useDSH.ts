/**
 * useDSH — session/turn reactive state fed by DSH events.
 *
 * In the desktop shell the DSH UI is a separate iframe; useDSH is the shared
 * UI kit's view of the DSH domain used by the harness-adjacent surfaces
 * (composer previews, sidecar status, deliverable lists). On mobile/harmony
 * (remote mode) the same composable is fed by the RemoteClient transport.
 * @module @dsh-platform/shared-ui/composables
 */
import { computed, onScopeDispose, ref, shallowRef, type Ref, type ShallowRef } from 'vue'
import type { Session, SessionEvent, Turn } from '@dsh-platform/shared-bridge'
import type { DSHEvent } from '@dsh-platform/shared-bridge'

export interface UseDSHOptions {
  /** Optional wired event source (RemoteClient or a plugin bus). */
  source?: {
    onEvent: (listener: (event: DSHEvent) => void) => () => void
  }
}

export interface UseDSHReturn {
  sessions: ShallowRef<Session[]>
  currentSessionId: Ref<string | null>
  currentSession: import('vue').ComputedRef<Session | null>
  turns: ShallowRef<Map<string, Turn>>
  runningTurns: import('vue').ComputedRef<Turn[]>
  activeSessionCount: import('vue').ComputedRef<number>
  handleEvent: (event: DSHEvent) => void
  selectSession: (id: string | null) => void
  upsertSession: (session: Session) => void
}

export function useDSH(options: UseDSHOptions = {}): UseDSHReturn {
  const sessions = shallowRef<Session[]>([])
  const turns = shallowRef<Map<string, Turn>>(new Map())
  const currentSessionId = ref<string | null>(null)

  function handleEvent(event: DSHEvent) {
    const payload = event.payload
    switch (event.type) {
      case 'session/start':
        if (payload && typeof payload === 'object' && 'id' in payload) {
          upsertSession(payload as Session)
        }
        break
      case 'turn/start':
      case 'turn/end':
        if (payload && typeof payload === 'object' && 'id' in payload && event.sessionId) {
          const map = new Map(turns.value)
          map.set((payload as Turn).id, payload as Turn)
          turns.value = map
        }
        break
      case 'agent/error':
        // surfaced through the UI as a transient status; kept minimal here
        break
      default:
        break
    }
  }

  function upsertSession(session: Session) {
    const next = sessions.value.slice()
    const index = next.findIndex((item) => item.id === session.id)
    if (index >= 0) next[index] = session
    else next.push(session)
    next.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0))
    sessions.value = next
    if (!currentSessionId.value) currentSessionId.value = session.id
  }

  function selectSession(id: string | null) {
    currentSessionId.value = id
  }

  const currentSession = computed(
    () => sessions.value.find((item) => item.id === currentSessionId.value) ?? null
  )

  const runningTurns = computed(() => [...turns.value.values()].filter((turn) => turn.status === 'running'))

  const activeSessionCount = computed(() => sessions.value.length)

  let unlisten: (() => void) | undefined
  if (options.source) {
    unlisten = options.source.onEvent(handleEvent)
  }
  onScopeDispose(() => unlisten?.())

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
