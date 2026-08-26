import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tsconfigPaths from 'vite-tsconfig-paths'

/**
 * Builds the H5 bundle served by ArkWeb (Index.ets) into
 * entry/src/main/resources/rawfile — the compiled shared-ui kit.
 */
export default defineConfig({
  root: 'src/h5',
  plugins: [
    vue(),
    tsconfigPaths({
      projects: ['tsconfig.json'],
      ignoreConfigErrors: true
    })
  ],
  clearScreen: false,
  server: { port: 1480, strictPort: true },
  build: {
    outDir: '../../entry/src/main/resources/rawfile',
    emptyOutDir: true,
    target: 'esnext'
  }
})
