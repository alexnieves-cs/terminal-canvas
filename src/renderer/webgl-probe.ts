/**
 * Whether this machine will give the page a WebGL context at all — asked of a
 * scratch canvas BEFORE a 3D scene mounts, so a view can say "no WebGL" in its
 * own words instead of finding out by its renderer throwing (M293 for
 * Orchestrate's island; M430 for the World view).
 *
 * Its own module, at the renderer's root, because both callers are first-chunk
 * code that must not import the other's module graph: the World view's stage
 * would otherwise reach into `OrchestrationView` (and every module it pulls),
 * and the probe must never sit beside three.js, which is exactly what it is
 * asked ahead of. No imports.
 *
 * The scratch context is released at once (`WEBGL_lose_context`): browsers
 * cap live contexts per page, and a probe left to the garbage collector would
 * count against the terminals' own xterm-webgl contexts until it was collected.
 */
export function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas')
    const gl = c.getContext('webgl2') ?? c.getContext('webgl')
    if (gl === null) return false
    const ext = (gl as WebGLRenderingContext).getExtension('WEBGL_lose_context')
    ext?.loseContext()
    return true
  } catch {
    return false
  }
}
