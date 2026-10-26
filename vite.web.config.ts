import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { version } from './package.json'

/**
 * Lane N (M565). The renderer as a web page: the same `src/renderer` tree,
 * entered through `src/web/main.ts`, which installs the fake bridge before a
 * single renderer module runs. Nothing here is part of the Electron build;
 * `electron.vite.config.ts` stays the app's only config.
 *
 * `base: './'` because GitHub Pages serves a project site under
 * `/<repo>/`, and every asset URL the renderer builds from
 * `import.meta.env.BASE_URL` has to follow it there.
 */
export default defineConfig({
  root: resolve(__dirname, 'src/web'),
  base: './',
  // The renderer's public folder (fonts, models) is the app's; the demo serves the same one.
  publicDir: resolve(__dirname, 'src/renderer/public'),
  plugins: [react()],
  define: {
    __TC_VERSION__: JSON.stringify(version),
    // electron-vite compiles the renderer's `process.env` to `{}`; plain vite leaves it, and a browser has no `process`.
    'process.env': '{}'
  },
  build: {
    outDir: resolve(__dirname, 'out/web'),
    emptyOutDir: true,
    rollupOptions: { input: { index: resolve(__dirname, 'src/web/index.html') } }
  },
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@renderer': resolve(__dirname, 'src/renderer')
    }
  }
})
