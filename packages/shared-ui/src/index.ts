/**
 * @dsh-platform/shared-ui — shared Vue 3 UI kit.
 *
 * @packageDocumentation
 */
import './styles/theme.css'

export { default as Sidebar } from './components/Sidebar.vue'
export { default as ChatPanel } from './components/ChatPanel.vue'
export { default as Composer } from './components/Composer.vue'

export * from './composables/useTheme'
export * from './composables/useBridge'
export * from './composables/useDSH'

export type { UseThemeOptions, ThemeName } from './composables/useTheme'
export type { UseBridgeReturn } from './composables/useBridge'
export type { UseDSHOptions, UseDSHReturn } from './composables/useDSH'
