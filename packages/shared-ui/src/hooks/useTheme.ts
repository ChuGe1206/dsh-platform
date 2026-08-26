/**
 * useTheme — React hook: system-preference detection, persistence, and
 * shell sync (theme-sync over the bridge client).
 * @module @dsh-platform/shared-ui/hooks
 */
import { useCallback, useEffect, useState } from 'react'
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

function initialTheme(storageKey: string): ThemeName {
  if (typeof localStorage === 'undefined') return 'system'
  const stored = localStorage.getItem(storageKey)
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system'
}

function applyDark(theme: ThemeName): boolean {
  return theme === 'system' ? systemPrefersDark() : theme === 'dark'
}

export function useTheme(options: UseThemeOptions = {}) {
  const storageKey = options.storageKey ?? STORAGE_KEY
  const [theme, setTheme] = useState<ThemeName>(() => initialTheme(storageKey))
  const [applied, setApplied] = useState<'light' | 'dark'>(() => (applyDark(theme) ? 'dark' : 'light'))

  // React to OS scheme changes while the user is on 'system'.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      setTheme((current) => {
        if (current === 'system') setApplied(media.matches ? 'dark' : 'light')
        return current
      })
    }
    media.addEventListener?.('change', onChange)
    return () => media.removeEventListener?.('change', onChange)
  }, [])

  // Persist + apply + sync whenever the selected theme changes.
  useEffect(() => {
    const dark = applyDark(theme)
    const next = dark ? 'dark' : 'light'
    setApplied(next)
    if (typeof localStorage !== 'undefined') localStorage.setItem(storageKey, theme)
    if (typeof document !== 'undefined') document.documentElement.setAttribute('data-theme', next)
    if (options.onSync) options.onSync({ theme, source: 'web', timestamp: Date.now() })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, storageKey])

  const isDark = applied === 'dark'
  const toggle = useCallback(() => setTheme((current) => (current === 'dark' ? 'light' : 'dark')), [])

  return { theme, applied, isDark, setTheme, toggle }
}
