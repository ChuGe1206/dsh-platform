import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tsconfigPaths from 'vite-tsconfig-paths'

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
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**', '**/harness/**', '**/target/**']
    }
  },
  build: {
    target: 'esnext',
    sourcemap: true
  }
})
