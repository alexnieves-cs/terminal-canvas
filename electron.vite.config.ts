import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    // node-pty loads a native .node binary at runtime. externalizeDepsPlugin keeps
    // every `dependencies` entry out of the bundle so it is `require`d from
    // node_modules instead of being inlined (which would break the binary link).
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        // M54. The tc CLI is a second main-process entry: out/main/tc.js,
        // run by the launcher as node. It must never import electron.
        input: { index: resolve(__dirname, 'src/main/index.ts'), tc: resolve(__dirname, 'src/cli/tc-main.ts') }
      }
    },
    resolve: {
      alias: { '@shared': resolve(__dirname, 'src/shared') }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts') }
      }
    },
    resolve: {
      alias: { '@shared': resolve(__dirname, 'src/shared') }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/renderer/index.html') }
      }
    },
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared'),
        '@renderer': resolve(__dirname, 'src/renderer')
      }
    }
  }
})
