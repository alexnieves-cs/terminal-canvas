import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { buildTimeDsn } from './src/shared/crash-dsn'

export default defineConfig({
  main: {
    // node-pty loads a native .node binary at runtime. externalizeDepsPlugin keeps
    // every `dependencies` entry out of the bundle so it is `require`d from
    // node_modules instead of being inlined (which would break the binary link).
    plugins: [externalizeDepsPlugin()],
    // M696. The project's crash-report address, from TC_CRASH_DSN at build
    // time; '' when unset. A value that is set and is not a DSN throws here,
    // so the build fails rather than shipping a toggle that cannot report.
    // Main only: the renderer never holds the address (reports ride IPC).
    define: { __TC_CRASH_DSN__: JSON.stringify(buildTimeDsn(process.env)) },
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
