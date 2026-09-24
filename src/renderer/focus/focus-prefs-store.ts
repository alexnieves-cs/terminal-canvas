import { defaultFocusPrefs, parseFocusPrefsMap, withFocusPrefs, type FocusPrefs } from './focus-model'

/**
 * M324. The focus view's per-task prefs, in localStorage — a per-viewer
 * convenience, wrapped: storage can throw or come back empty, and the view
 * then opens at its defaults. Written a beat after the last change so a
 * scrolling diff is one write, not sixty.
 */

const KEY = 'tc.focus-prefs'
const WRITE_MS = 300

let cache: Record<string, FocusPrefs> | null = null
let timer: ReturnType<typeof setTimeout> | null = null

function load(): Record<string, FocusPrefs> {
  if (cache !== null) return cache
  try {
    const raw = window.localStorage.getItem(KEY)
    cache = parseFocusPrefsMap(raw === null ? null : JSON.parse(raw))
  } catch {
    cache = {}
  }
  return cache
}

export function readFocusPrefs(itemId: string): FocusPrefs {
  return load()[itemId] ?? defaultFocusPrefs()
}

export function writeFocusPrefs(itemId: string, patch: Partial<Omit<FocusPrefs, 'at'>>): FocusPrefs {
  const all = load()
  const next = withFocusPrefs(all[itemId] ?? defaultFocusPrefs(), patch, Date.now())
  all[itemId] = next
  if (timer === null) {
    timer = setTimeout(() => {
      timer = null
      // Re-parsed on the way out so the cap holds on disk too.
      try { window.localStorage.setItem(KEY, JSON.stringify(parseFocusPrefsMap(load()))) } catch { /* kept in memory */ }
    }, WRITE_MS)
  }
  return next
}
