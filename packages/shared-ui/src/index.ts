/**
 * @dsh-platform/shared-ui — shared React UI kit.
 *
 * @packageDocumentation
 */
import './styles/theme.css'
import './components/components.css'

export { Sidebar } from './components/Sidebar'
export { ChatPanel } from './components/ChatPanel'
export { Composer } from './components/Composer'

export { useTheme } from './hooks/useTheme'
export { useBridge } from './hooks/useBridge'
export { useDSH } from './hooks/useDSH'

export type { ThemeName, UseThemeOptions } from './hooks/useTheme'
export type { UseBridgeReturn } from './hooks/useBridge'
export type { UseDSHOptions, UseDSHReturn } from './hooks/useDSH'
