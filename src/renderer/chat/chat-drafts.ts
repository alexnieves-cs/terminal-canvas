/**
 * M322. THE UNSENT DRAFT, per conversation, outside the component.
 *
 * The composer's text was `useState` in ChatNode: switching workspace,
 * opening a task's focus view (a second host of the same conversation) or a
 * relaunch unmounted it and the half-written message was gone with no word.
 * The draft is a per-viewer convenience — never shared, never read by main —
 * so it lives in localStorage, wrapped: storage can throw or come back empty,
 * and a composer without it still works (it just forgets, as before).
 *
 * Kept by PANEL id, capped (oldest out), and cleared by a successful send —
 * not by `clearChat`, which also runs when a workspace switch unmounts a
 * panel that still exists.
 */

const KEY = 'tc.chat-drafts'
const MAX = 50
const WRITE_MS = 250

type Drafts = Record<string, { text: string; at: number }>

let cache: Drafts | null = null
let timer: ReturnType<typeof setTimeout> | null = null

function load(): Drafts {
  if (cache !== null) return cache
  cache = {}
  try {
    const raw = window.localStorage.getItem(KEY)
    const parsed: unknown = raw === null ? null : JSON.parse(raw)
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      for (const [id, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof v === 'object' && v !== null && typeof (v as { text?: unknown }).text === 'string') {
          cache[id] = { text: (v as { text: string }).text, at: Number((v as { at?: unknown }).at) || 0 }
        }
      }
    }
  } catch { /* no storage: this run keeps drafts in memory only */ }
  return cache
}

function flushSoon(): void {
  if (timer !== null) return
  timer = setTimeout(() => {
    timer = null
    try { window.localStorage.setItem(KEY, JSON.stringify(load())) } catch { /* kept in memory */ }
  }, WRITE_MS)
}

export function readDraft(id: string): string {
  return load()[id]?.text ?? ''
}

/** An empty text removes the entry: a cleared composer is not a draft. */
export function writeDraft(id: string, text: string): void {
  const drafts = load()
  if (text === '') {
    if (!(id in drafts)) return
    delete drafts[id]
  } else {
    drafts[id] = { text, at: Date.now() }
    const ids = Object.keys(drafts)
    if (ids.length > MAX) {
      ids.sort((a, b) => (drafts[a]?.at ?? 0) - (drafts[b]?.at ?? 0))
      for (const old of ids.slice(0, ids.length - MAX)) delete drafts[old]
    }
  }
  flushSoon()
}
