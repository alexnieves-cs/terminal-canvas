/** Lane N. Stamped by vite.web.config.ts from package.json, so the splash's "what's new" reads the real version. */
declare const __TC_VERSION__: string

declare module 'virtual:tc-door-shapes' {
  const shapes: import('./stub-door').DoorShapes
  export default shapes
}
