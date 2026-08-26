import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

// Mobile Android shell — same shared-ui kit compiled into the Tauri mobile WebView.
export default defineConfig({
  plugins: [
    react(),
    tsconfigPaths({
      // Limit discovery to this app's tsconfig: cargo resource copies under
      // src-tauri/target contain harness tsconfigs whose extends targets do
      // not exist there.
      projects: ['tsconfig.json'],
      ignoreConfigErrors: true
    })
  ],
  clearScreen: false,
  server: {
    port: 1460,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**', '**/harness/**', '**/target/**'] }
  },
  build: { target: 'esnext' }
})
