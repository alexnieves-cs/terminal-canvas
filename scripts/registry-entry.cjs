/* esbuild entry: re-exports the registry for plain-node testing.
   The registry takes its bridge and factory as parameters precisely so this
   bundle needs no DOM and no Electron. */
export * from '../src/renderer/session/session-registry'
export * from '../src/renderer/session/panel-session'
