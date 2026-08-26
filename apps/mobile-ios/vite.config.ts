import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tsconfigPaths from 'vite-tsconfig-paths'

// Mobile iOS shell — same shared-ui kit compiled into the Tauri mobile WebView.
export default defineConfig({
  plugins: [
    vue(),
    tsconfigPaths({
      projects: ['tsconfig.json'],
      ignoreConfigErrors: true
    })
  ],
  clearScreen: false,
  server: {
    port: 1470,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**', '**/harness/**', '**/target/**'] }
  },
  build: { target: 'esnext' }
})
