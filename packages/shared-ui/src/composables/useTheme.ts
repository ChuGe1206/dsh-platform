/**
 * useTheme — reactive theme with system-preference detection, persistence,
 * and shell sync (theme-sync over the bridge client).
 * @module @dsh-platform/shared-ui/composables
 */
import { computed, onScopeDispose, ref, watch, type Ref } from 'vue'
import type { ThemeSyncPayload } from '@dsh-platform/shared-bridge'

export type ThemeName = 'light' | 'dark' | 'system'

export interface UseThemeOptions {
  /** Bridge theme-sync callback (optional). */
  onSync?: (payload: ThemeSyncPayload) => void
  storageKey?: string
}

const STORAGE_KEY = 'dsh-platform:theme'

function systemPrefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

/** Shared singleton so all consumers stay in sync. */
let themeState: { theme: Ref<ThemeName>; applied: Ref<'light' | 'dark'> } | null = null

function ensureState(storageKey: string) {
  if (themeState) return themeState
  const stored = (typeof localStorage !== 'undefined' && localStorage.getItem(storageKey)) as ThemeName | null
  const theme = ref<ThemeName>(stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system')
  const applied = ref<'light' | 'dark'>(theme.value === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : theme.value)

  if (typeof window !== 'undefined') {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener?.('change', () => {
      if (theme.value === 'system') applied.value = media.matches ? 'dark' : 'light'
    })
  }

  watch(theme, (value) => {
    applied.value = value === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : value
    if (typeof localStorage !== 'undefined') localStorage.setItem(storageKey, value)
  })

  watch(applied, (value) => {
    if (typeof document !== 'undefined') document.documentElement.setAttribute('data-theme', value)
  }, { immediate: true })

  themeState = { theme, applied }
  return themeState
}

export function useTheme(options: UseThemeOptions = {}) {
  const { theme, applied } = ensureState(options.storageKey ?? STORAGE_KEY)

  const isDark = computed(() => applied.value === 'dark')

  function setTheme(next: ThemeName) {
    theme.value = next
  }

  function toggle() {
    setTheme(isDark.value ? 'light' : 'dark')
  }

  onScopeDispose(() => {
    /* singleton state stays; nothing to clean per-scope */
  })

  watch(theme, (value) => {
    if (options.onSync) {
      options.onSync({ theme: value, source: 'web', timestamp: Date.now() })
    }
  })

  return { theme, applied, isDark, setTheme, toggle }
}
