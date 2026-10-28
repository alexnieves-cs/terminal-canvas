/**
 * M610. THE APP'S CHORDS IN A BROWSER TAB (lane Q's hosted page). Two facts a
 * desktop window never meets:
 *
 *   - A browser keeps some chords for itself and the page never sees the
 *     keydown: ⌘N/⌘T/⌘W (and their ⇧ forms) open, reopen and close windows
 *     and tabs. On a host, New task, New shell and Close would be dead keys.
 *     Each gets ⌥ in place of ⌘ — ⌥N is New task — and the Keyboard page
 *     prints that form, so the one place that lists chords tells the truth.
 *   - Off a Mac there is no ⌘. Ctrl stands in, except where Ctrl already
 *     means something: in a terminal (Ctrl+C is SIGINT) and in a text field
 *     (Ctrl+A selects, Ctrl+Z undoes the field). There Ctrl+Shift stands in
 *     — the convention every Linux terminal uses for its own copy and paste —
 *     and the Shift is spent on that, so a chord that already holds ⇧ is
 *     reached from outside the field.
 *
 * V is never translated: paste rides the browser's own paste event, which
 * only the browser's own Ctrl+V / ⌘V fires (host-chrome.ts).
 *
 * Pure, so verify:host runs it without a browser. host-chrome.ts applies
 * `appChordOf` to every keydown; KeyboardPane prints `tabChord`.
 */

/** The keys whose ⌘ chord a browser keeps (with or without ⇧). */
export const BROWSER_RESERVED_KEYS: readonly string[] = ['n', 't', 'w']

export interface KeyFacts {
  meta: boolean
  ctrl: boolean
  alt: boolean
  shift: boolean
  /** keys.ts `keyOf`: the physical key, lower case. */
  key: string
}

/**
 * The ⌘-space chord a tab's keydown stands for, or null when it stands for
 * nothing and must reach the page as it is. `inField` is a terminal, input,
 * textarea or contenteditable under the event.
 */
export function appChordOf(e: KeyFacts, mac: boolean, inField: boolean): KeyFacts | null {
  if (e.key === 'v') return null
  const reserved = BROWSER_RESERVED_KEYS.includes(e.key)
  // ⌥ in place of ⌘ for the chords the browser keeps, on any platform.
  if (reserved && e.alt && !e.meta && !e.ctrl) return { ...e, meta: true, alt: false }
  if (mac || e.meta || !e.ctrl) return null
  if (inField) return e.shift ? { ...e, meta: true, ctrl: false, shift: false } : null
  // Outside a field, Ctrl is ⌘ — but the browser would have kept these, so they are ⌥'s.
  if (reserved) return null
  return { ...e, meta: true, ctrl: false }
}

/**
 * A registry chord ('⌘⇧N') as a person presses it in this tab. On a Mac the
 * symbols stay; elsewhere they are spelled with words, which is how a PC
 * keyboard is labelled.
 */
export function tabChord(chord: string, mac: boolean): string {
  const m = /^([⌘⌥⇧⌃]*)(.+)$/u.exec(chord)
  if (m === null) return chord
  let mods = m[1]
  const key = m[2]
  const reserved = mods.includes('⌘') && !mods.includes('⌥') && !mods.includes('⌃') && BROWSER_RESERVED_KEYS.includes(key.toLowerCase())
  if (reserved) mods = mods.replace('⌘', '⌥')
  if (mac) return `${order(mods)}${key}`
  const words: string[] = []
  if (mods.includes('⌃') || mods.includes('⌘')) words.push('Ctrl')
  if (mods.includes('⌥')) words.push('Alt')
  if (mods.includes('⇧')) words.push('Shift')
  return [...words, key].join('+')
}

/** Apple's modifier order (⌃⌥⇧⌘), so a swapped ⌥ reads as a native chord. */
function order(mods: string): string {
  return ['⌃', '⌥', '⇧', '⌘'].filter((s) => mods.includes(s)).join('')
}

/** Whether a registry chord is one a browser keeps, so the Keyboard page can say why it differs. */
export function browserKeeps(chord: string): boolean {
  const m = /^([⌘⌥⇧⌃]*)(.+)$/u.exec(chord)
  return m !== null && m[1].includes('⌘') && !m[1].includes('⌥') && !m[1].includes('⌃') && BROWSER_RESERVED_KEYS.includes(m[2].toLowerCase())
}

/**
 * Copy written for the desktop app names "this Mac". On a host the machine
 * running agents is the server, and the person may be on any computer.
 */
export function hostedWords(text: string): string {
  return text
    .replace(/\b(this|your|the) Mac\b/g, 'the host')
    .replace(/\bMac kept awake\b/g, 'host kept awake')
}
