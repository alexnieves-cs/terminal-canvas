import { browserHost, browserRefusal, isReadableUrl } from '../shared/browser-panel'
import { captureRefusal } from '../shared/preview'

/**
 * M185. A REAL PICTURE OF THE GUEST, WRITTEN TO THIS APP'S OWN DIRECTORY.
 *
 * Three rules, each with a silent failure behind it:
 *
 *  1. The scheme is checked on the guest's LIVE url, the same rule and for
 *     the same reason as `browser-read.ts`: a page can redirect itself to
 *     `data:`, and a capture of the user's disk is a file this app made of
 *     something it was never pointed at.
 *  2. An EMPTY capture is refused BY NAME rather than written. `capturePage`
 *     answers a zero-size image for a guest that has not painted yet, and a
 *     0-byte PNG on the canvas reads as a broken image kind rather than as a
 *     page that was not ready.
 *  3. The result names the PAGE it came from. A capture is handed to an image
 *     panel and from there to an export and to an agent; a picture with no
 *     provenance is a picture nobody can check.
 *
 * Everything is injected, so the module runs under plain node: `capture` is
 * the guest's `capturePage`, `write` the file write, `now` the clock.
 */
export interface CaptureImage { toPNG: () => Uint8Array; isEmpty?: () => boolean }

export interface CaptureDeps {
  getUrl: () => string
  capture: () => Promise<CaptureImage>
  write: (path: string, data: Uint8Array) => Promise<void>
  /** `userData/captures`, created by the caller. */
  dir: string
  now: () => number
}

export type CaptureResult =
  | { kind: 'captured'; path: string; url: string; host: string; bytes: number }
  | { kind: 'refused'; reason: string }

/** `2026-09-08T17-40-12-127.0.0.1_5173.png` — sortable, and it says what it is a picture of. */
export function captureFileName(url: string, at: number): string {
  const stamp = new Date(at).toISOString().replace(/[:.]/g, '-').replace(/Z$/, '')
  const host = browserHost(url).replace(/[^a-zA-Z0-9._-]/g, '_')
  return `${stamp}-${host}.png`
}

export async function capturePreview(deps: CaptureDeps): Promise<CaptureResult> {
  const url = deps.getUrl()
  if (!isReadableUrl(url)) return { kind: 'refused', reason: captureRefusal('not-web', browserRefusal(url)) }
  let image: CaptureImage
  try {
    image = await deps.capture()
  } catch (error) {
    return { kind: 'refused', reason: `the page did not answer: ${error instanceof Error ? error.message : String(error)}` }
  }
  if (image.isEmpty?.() === true) return { kind: 'refused', reason: captureRefusal('empty') }
  const png = image.toPNG()
  if (png.length === 0) return { kind: 'refused', reason: captureRefusal('empty') }
  const path = `${deps.dir.replace(/\/$/, '')}/${captureFileName(url, deps.now())}`
  // M185's critic (finding 4): the write is the one step that can fail for a
  // reason outside this app (no space, a read-only volume, a permission), and
  // an unguarded `writeFileSync` REJECTED the invoke — the renderer awaits it
  // with no catch, so the Capture button said nothing at all.
  try {
    await deps.write(path, png)
  } catch (error) {
    return { kind: 'refused', reason: `the capture could not be written: ${error instanceof Error ? error.message : String(error)}` }
  }
  return { kind: 'captured', path, url, host: browserHost(url), bytes: png.length }
}
