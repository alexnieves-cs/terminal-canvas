/**
 * Lane Q (M590). The hosted version's one wire format, read by both ends:
 * the host (`src/host/hub.ts`) and the page (`src/host-web/ipc-renderer.ts`).
 *
 * Electron's IPC is a STRUCTURED CLONE, and JSON is not: `undefined` inside an
 * array, a `Uint8Array` (a pasted image, a PNG export), a `Date` and a `Map`
 * all survive one and not the other. A handler written against IPC returns
 * those freely, so the wire tags them rather than letting JSON flatten a
 * Buffer into `{type:'Buffer',data:[…]}` and the renderer read a different
 * shape than it would in the app. Plain JSON values pass through untouched,
 * which keeps a PTY chunk (the hot path) one `JSON.stringify` away.
 *
 * No imports, no Node, no DOM: both bundles take this file as it is.
 */

/** A page → host frame. */
export type ClientFrame =
  | { t: 'invoke'; id: number; channel: string; args: unknown[] }
  | { t: 'send'; channel: string; args: unknown[] }
  /** The preload has run and the renderer is subscribed: the host's `did-finish-load`. */
  | { t: 'ready' }
  /** The answer to a host `ask` (a dialog the page drew). */
  | { t: 'answer'; id: number; value: unknown }
  /** A menu accelerator the page matched (M591): the host runs that item's click. */
  | { t: 'menu'; id: string }

/** A host → page frame. */
export type HostFrame =
  | { t: 'result'; id: number; ok: true; value: unknown }
  | { t: 'result'; id: number; ok: false; message: string }
  | { t: 'event'; channel: string; args: unknown[] }
  /** A question only the person can answer: a confirm, a file name, a link to open. */
  | { t: 'ask'; id: number; kind: string; payload: unknown }
  /** Another tab took the session over; this one stops (M590's one-tab rule). */
  | { t: 'replaced' }
  /** The menu's accelerators, so the page can match keys the browser has no menu for. */
  | { t: 'menu'; items: MenuKey[] }

export interface MenuKey {
  id: string
  /** Electron's accelerator string, e.g. `CmdOrCtrl+Shift+P`. */
  accelerator: string
  label: string
}

const TAG = '$tc'

type Tagged =
  | { [TAG]: 'u' }
  | { [TAG]: 'bytes'; b64: string }
  | { [TAG]: 'date'; v: number }
  | { [TAG]: 'map'; v: Array<[unknown, unknown]> }
  | { [TAG]: 'set'; v: unknown[] }
  | { [TAG]: 'error'; message: string; name: string }

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** Base64 without Buffer or btoa, so the one codec runs in both places. */
export function bytesToBase64(bytes: Uint8Array): string {
  let out = ''
  let i = 0
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + B64[(n >> 6) & 63]! + B64[n & 63]!
  }
  const rest = bytes.length - i
  if (rest === 1) {
    const n = bytes[i]! << 16
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + '=='
  } else if (rest === 2) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8)
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + B64[(n >> 6) & 63]! + '='
  }
  return out
}

export function base64ToBytes(text: string): Uint8Array {
  const clean = text.replace(/=+$/, '')
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4))
  let o = 0
  for (let i = 0; i < clean.length; i += 4) {
    const a = B64.indexOf(clean[i] ?? 'A')
    const b = B64.indexOf(clean[i + 1] ?? 'A')
    const c = i + 2 < clean.length ? B64.indexOf(clean[i + 2]!) : 0
    const d = i + 3 < clean.length ? B64.indexOf(clean[i + 3]!) : 0
    const n = (a << 18) | (b << 12) | (c << 6) | d
    if (o < out.length) out[o++] = (n >> 16) & 255
    if (o < out.length) out[o++] = (n >> 8) & 255
    if (o < out.length) out[o++] = n & 255
  }
  return out
}

/** A structured-clone-shaped value → a JSON-safe one. */
export function pack(value: unknown): unknown {
  if (value === undefined) return { [TAG]: 'u' }
  if (value === null || typeof value !== 'object') {
    // A function does not survive IPC either (it throws there); here it is dropped like JSON drops it.
    return typeof value === 'function' || typeof value === 'symbol' ? { [TAG]: 'u' } : value
  }
  if (ArrayBuffer.isView(value)) {
    const view = value as ArrayBufferView
    return { [TAG]: 'bytes', b64: bytesToBase64(new Uint8Array(view.buffer, view.byteOffset, view.byteLength)) }
  }
  if (value instanceof ArrayBuffer) return { [TAG]: 'bytes', b64: bytesToBase64(new Uint8Array(value)) }
  if (value instanceof Date) return { [TAG]: 'date', v: value.getTime() }
  if (value instanceof Map) return { [TAG]: 'map', v: [...value].map(([k, v]) => [pack(k), pack(v)]) }
  if (value instanceof Set) return { [TAG]: 'set', v: [...value].map(pack) }
  if (value instanceof Error) return { [TAG]: 'error', message: value.message, name: value.name }
  if (Array.isArray(value)) return value.map(pack)
  const out: Record<string, unknown> = {}
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    // An absent key and an `undefined` one are the same thing after a clone
    // of an OBJECT (structured clone keeps the key, but every reader here
    // tests `=== undefined`), so the key is dropped rather than tagged.
    if (v === undefined) continue
    out[key] = pack(v)
  }
  return out
}

/** The inverse of `pack`. Bytes come back as a `Uint8Array`, which is what IPC hands a renderer for a Buffer. */
export function unpack(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(unpack)
  const record = value as Record<string, unknown>
  const tag = record[TAG]
  if (typeof tag === 'string') {
    const t = record as Tagged
    switch (t[TAG]) {
      case 'u': return undefined
      case 'bytes': return base64ToBytes(t.b64)
      case 'date': return new Date(t.v)
      case 'map': return new Map(t.v.map(([k, v]) => [unpack(k), unpack(v)]))
      case 'set': return new Set(t.v.map(unpack))
      case 'error': { const e = new Error(t.message); e.name = t.name; return e }
    }
  }
  const out: Record<string, unknown> = {}
  for (const [key, v] of Object.entries(record)) out[key] = unpack(v)
  return out
}

export function encodeFrame(frame: ClientFrame | HostFrame): string {
  if (frame.t === 'invoke' || frame.t === 'send' || frame.t === 'event') return JSON.stringify({ ...frame, args: frame.args.map(pack) })
  if (frame.t === 'result' && frame.ok) return JSON.stringify({ ...frame, value: pack(frame.value) })
  if (frame.t === 'answer') return JSON.stringify({ ...frame, value: pack(frame.value) })
  if (frame.t === 'ask') return JSON.stringify({ ...frame, payload: pack(frame.payload) })
  return JSON.stringify(frame)
}

/** Parses one frame; anything malformed is `null`, never a throw on the socket's message handler. */
export function decodeFrame<T extends ClientFrame | HostFrame>(text: string): T | null {
  let raw: unknown
  try { raw = JSON.parse(text) } catch { return null }
  if (raw === null || typeof raw !== 'object' || typeof (raw as { t?: unknown }).t !== 'string') return null
  const frame = raw as Record<string, unknown>
  if (Array.isArray(frame['args'])) frame['args'] = (frame['args'] as unknown[]).map(unpack)
  if ('value' in frame) frame['value'] = unpack(frame['value'])
  if ('payload' in frame) frame['payload'] = unpack(frame['payload'])
  return frame as T
}

/** What `ipcRenderer.invoke` rejects with when the handler threw: Electron's own wording, so a caller matching on it still matches. */
export function remoteError(channel: string, message: string): Error {
  return new Error(`Error invoking remote method '${channel}': ${message}`)
}
