import { createRoot } from 'react-dom/client'
import { getCurrentWindow } from '@tauri-apps/api/window'
import App from './App'
import Splash from './Splash'
import '@dsh-platform/shared-ui/theme.css'
import './App.css'
import './Splash.css'

// splash 窗口(label="splash")渲染启动画面；主窗口渲染主壳。非 Tauri 预览默认主壳。
let isSplash = false
try {
  isSplash = getCurrentWindow().label === 'splash'
} catch {
  /* outside Tauri */
}

const Root = isSplash ? Splash : App

createRoot(document.getElementById('root')!).render(<Root />)
