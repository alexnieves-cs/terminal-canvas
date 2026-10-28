/**
 * M610. Whether this renderer is in a browser tab served by `tc host` (lane
 * Q), and whether the computer in front of the person is a Mac. Read at use,
 * never at module scope: verify suites load renderer modules in plain node,
 * where there is no `window`.
 */
export function isHosted(): boolean {
  return typeof window !== 'undefined' && window.canvas?.hosted === true
}

/** The keyboard's platform, which on a host is this computer's, not the server's. */
export function keyboardIsMac(): boolean {
  if (typeof navigator === 'undefined') return true
  return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
}
