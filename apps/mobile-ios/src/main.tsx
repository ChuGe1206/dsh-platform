import { createRoot } from 'react-dom/client'
import App from './App'
import '@dsh-platform/shared-ui/theme.css'
import './mobile.css'

createRoot(document.getElementById('root')!).render(<App />)
