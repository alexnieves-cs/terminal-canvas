import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Lane Q (M591). The hosted page: the same `src/renderer` tree, entered
 * through `src/host-web/main.ts`, with the app's OWN preload in front of it.
 * Three imports in that preload are a desktop's and are pointed at the tab's
 * answers here: `electron` (ipcRenderer over the host's WebSocket), `os`
 * (the host's home, from /host-info.js) and Sentry's preload hook (off).
 *
 * Absolute `base: '/'`: the host serves the page at its root and nothing
 * else, and /host-info.js is root-relative in index.html.
 */
export default defineConfig({
  root: resolve(__dirname, 'src/host-web'),
  base: '/',
  publicDir: resolve(__dirname, 'src/renderer/public'),
  plugins: [react()],
  define: {
    // electron-vite compiles the renderer's `process.env` to `{}`; plain vite leaves it, and a browser has no `process`.
    'process.env': '{}',
    // The preload's two other reads of `process` (install.ts says why these are names, not a fake `process`).
    'process.argv': 'globalThis.__TC_HOST_ARGV__',
    'process.platform': 'globalThis.__TC_HOST_PLATFORM__'
  },
  build: {
    outDir: resolve(__dirname, 'out/host-web'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 8000,
    rollupOptions: { input: { index: resolve(__dirname, 'src/host-web/index.html') } }
  },
  resolve: {
    alias: [
      { find: /^electron$/, replacement: resolve(__dirname, 'src/host-web/electron-renderer.ts') },
      { find: /^os$/, replacement: resolve(__dirname, 'src/host-web/os.ts') },
      { find: '@sentry/electron/preload-namespaced', replacement: resolve(__dirname, 'src/host-web/sentry-off.ts') },
      { find: '@shared', replacement: resolve(__dirname, 'src/shared') },
      { find: '@renderer', replacement: resolve(__dirname, 'src/renderer') }
    ]
  }
})
