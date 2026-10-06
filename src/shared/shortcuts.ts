/**
 * M438. The one shortcut list. Settings › Keyboard, the app menu and the
 * canvas listeners read this — a second list is how ⌘⌥T and ⌘⇧T drift apart.
 *
 * `ShortcutDef` is the Phase 0 contract (`redesign-contracts.ts`). It has no
 * handler field; `SHORTCUT_HANDLERS` is the binding name beside each id, so
 * a lane can wire a chord without a contract change. Mouse rows have no
 * Electron accelerator.
 *
 * D4. ⌘K is the palette unless the focused panel is focus-locked (⌘⇧L), in
 * which case every canvas chord yields and the key reaches the terminal.
 * `SHORTCUT_CONFLICTS` records that Claude Code and macOS terminals use ⌘K
 * to clear.
 *
 * D5. Tidy's old chord (⌘⌥T) stays as `tidy-alias` for one release. The menu
 * still shows that accelerator. ⌘0/⌘1 in `useViewport` are not retargeted
 * here: that file is another lane's, and this registry names the concept
 * chords without changing the chords that already fire.
 */

import type { ShortcutDef } from './redesign-contracts'

export const SHORTCUTS: readonly ShortcutDef[] = [
  { id: 'new-agent', chord: '⌘N', scope: 'canvas', group: 'create', label: 'New agent' },
  { id: 'new-shell', chord: '⌘T', scope: 'canvas', group: 'create', label: 'New shell' },
  { id: 'spawn-sheet', chord: '⌘⇧N', scope: 'canvas', group: 'create', label: 'Choose what to spawn' },
  { id: 'make-task', chord: '⌘G', scope: 'canvas', group: 'create', label: 'Make task from selection' },

  { id: 'sessions', chord: '⌘⇧S', scope: 'canvas', group: 'sessions', label: 'Sessions' },
  { id: 'jump', chord: '⌘J', scope: 'canvas', group: 'sessions', label: 'Next that needs you' },
  { id: 'jump-prev', chord: '⌘⇧J', scope: 'canvas', group: 'sessions', label: 'Previous that needs you' },
  { id: 'allow', chord: '⌘Y', scope: 'canvas', group: 'sessions', label: 'Allow pending request' },
  { id: 'pause', chord: '⌘.', scope: 'canvas', group: 'sessions', label: 'Pause or resume' },
  { id: 'focus-lock', chord: '⌘⇧L', scope: 'canvas', group: 'sessions', label: 'Focus lock' },
  { id: 'ask', chord: '⌘L', scope: 'canvas', group: 'sessions', label: 'Ask an agent' },

  { id: 'palette', chord: '⌘K', scope: 'canvas', group: 'navigate', label: 'Find or run anything' },
  { id: 'fit-all', chord: '⌘0', scope: 'canvas', group: 'navigate', label: 'Fit all' },
  { id: 'fit-task', chord: '⌘⇧0', scope: 'canvas', group: 'navigate', label: 'Fit task' },
  { id: 'tier-work', chord: '⌘1', scope: 'canvas', group: 'navigate', label: 'Work' },
  { id: 'tier-plan', chord: '⌘2', scope: 'canvas', group: 'navigate', label: 'Plan' },
  { id: 'tier-map', chord: '⌘3', scope: 'canvas', group: 'navigate', label: 'Map' },
  { id: 'move-left', chord: '⌘←', scope: 'canvas', group: 'navigate', label: 'Panel to the left' },
  { id: 'move-right', chord: '⌘→', scope: 'canvas', group: 'navigate', label: 'Panel to the right' },
  { id: 'move-up', chord: '⌘↑', scope: 'canvas', group: 'navigate', label: 'Panel above' },
  { id: 'move-down', chord: '⌘↓', scope: 'canvas', group: 'navigate', label: 'Panel below' },
  { id: 'step-in', chord: '⌘↵', scope: 'canvas', group: 'navigate', label: 'Step in' },
  { id: 'step-out', chord: '⌘Esc', scope: 'canvas', group: 'navigate', label: 'Step out' },
  { id: 'tidy', chord: '⌘⇧T', scope: 'canvas', group: 'navigate', label: 'Tidy' },
  { id: 'world', chord: '⌘⇧W', scope: 'canvas', group: 'navigate', label: 'World' },
  { id: 'search', chord: '⌘F', scope: 'canvas', group: 'navigate', label: 'Search' },
  { id: 'navigator', chord: '⌘\\', scope: 'canvas', group: 'navigate', label: 'Navigator' },
  { id: 'context', chord: '⇧⌘\\', scope: 'canvas', group: 'navigate', label: 'Context pane' },

  // D5. The chord the menu still shows. Same verb as `tidy`, hidden from the
  // primary map by `aliasOf` so a later Settings page can fold it.
  { id: 'tidy-alias', chord: '⌘⌥T', scope: 'canvas', group: 'existing', label: 'Tidy', aliasOf: 'tidy' },
  { id: 'flip', chord: '⌘⌥F', scope: 'canvas', group: 'existing', label: 'Flip terminals' },
  { id: 'broadcast', chord: '⌘⇧I', scope: 'canvas', group: 'existing', label: 'Broadcast input' },
  { id: 'pill', chord: '⌘⇧Space', scope: 'canvas', group: 'existing', label: 'Command pill' },
  { id: 'undo', chord: '⌘Z', scope: 'anywhere', group: 'existing', label: 'Undo' },
  { id: 'redo', chord: '⌘⇧Z', scope: 'anywhere', group: 'existing', label: 'Redo' },
  { id: 'copy', chord: '⌘C', scope: 'anywhere', group: 'existing', label: 'Copy' },
  { id: 'paste', chord: '⌘V', scope: 'anywhere', group: 'existing', label: 'Paste' },
  // The terminal's own chord (D4). A different scope, so it is not a duplicate
  // of the palette's ⌘K.
  { id: 'terminal-clear', chord: '⌘K', scope: 'panel', group: 'existing', label: 'Clear' },

  { id: 'spawn-at-cursor', chord: 'double-click', scope: 'mouse', group: 'mouse', label: 'Spawn at the cursor' },
  { id: 'spawn-handoff', chord: 'drag from a port', scope: 'mouse', group: 'mouse', label: 'Spawn a connected handoff' },
  { id: 'pan', chord: 'Space+drag', scope: 'mouse', group: 'mouse', label: 'Pan' },
  { id: 'zoom-scroll', chord: '⌘+scroll', scope: 'mouse', group: 'mouse', label: 'Zoom at the cursor' },
  { id: 'zoom-pinch', chord: 'pinch', scope: 'mouse', group: 'mouse', label: 'Pinch to zoom' }
]

/** Binding name for each id. Not a field on `ShortcutDef` — the contract has none. */
export const SHORTCUT_HANDLERS: Readonly<Record<string, string>> = {
  'new-agent': 'spawnDefaultAgent',
  'new-shell': 'spawnShell',
  'spawn-sheet': 'openSpawnSheet',
  'make-task': 'makeTask',
  'sessions': 'toggleSessions',
  'jump': 'jumpAttention',
  'jump-prev': 'jumpAttentionBack',
  'allow': 'allowPending',
  'pause': 'pauseOrResume',
  'focus-lock': 'toggleFocusLock',
  'ask': 'askAgent',
  'palette': 'openPalette',
  'fit-all': 'fitAll',
  'fit-task': 'fitTask',
  'tier-work': 'zoomTierWork',
  'tier-plan': 'zoomTierPlan',
  'tier-map': 'zoomTierMap',
  'move-left': 'selectPanelLeft',
  'move-right': 'selectPanelRight',
  'move-up': 'selectPanelUp',
  'move-down': 'selectPanelDown',
  'step-in': 'focusSelection',
  'step-out': 'releaseFocus',
  'tidy': 'tidyPanels',
  'tidy-alias': 'tidyPanels',
  'world': 'toggleWorld',
  'search': 'openSearch',
  'navigator': 'toggleNavigator',
  'context': 'toggleContext',
  'flip': 'flipTerminals',
  'broadcast': 'toggleBroadcast',
  'pill': 'openCommandPill',
  'undo': 'editUndo',
  'redo': 'editRedo',
  'copy': 'editCopy',
  'paste': 'editPaste',
  'terminal-clear': 'terminalClear',
  'spawn-at-cursor': 'spawnAtCursor',
  'spawn-handoff': 'spawnConnectedHandoff',
  'pan': 'spaceDragPan',
  'zoom-scroll': 'zoomAtCursor',
  'zoom-pinch': 'pinchZoom'
}

export interface ShortcutConflict {
  id: string
  chord: string
  /** Who already owns the chord when the canvas yields. */
  owner: string
  note: string
}

export const SHORTCUT_CONFLICTS: readonly ShortcutConflict[] = [
  {
    id: 'terminal-clear',
    chord: '⌘K',
    owner: 'Claude and macOS terminals',
    note: 'Clear in Claude Code and macOS terminals. The canvas owns ⌘K unless the focused panel is focus-locked (⌘⇧L); then the key reaches the terminal.'
  }
]

export interface ShortcutEvent {
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  code: string
}

interface ParsedChord {
  meta: boolean
  alt: boolean
  shift: boolean
  ctrl: boolean
  code: string
}

const KEY_CODE: Readonly<Record<string, string>> = {
  N: 'KeyN', T: 'KeyT', K: 'KeyK', J: 'KeyJ', Y: 'KeyY', G: 'KeyG', L: 'KeyL',
  S: 'KeyS', W: 'KeyW', F: 'KeyF', I: 'KeyI',
  '0': 'Digit0', '1': 'Digit1', '2': 'Digit2', '3': 'Digit3',
  '.': 'Period',
  Space: 'Space',
  Esc: 'Escape',
  '↵': 'Enter',
  '\\': 'Backslash',
  '←': 'ArrowLeft', '→': 'ArrowRight', '↑': 'ArrowUp', '↓': 'ArrowDown'
}

const ACCEL: Readonly<Record<string, string>> = {
  KeyN: 'N', KeyT: 'T', KeyK: 'K', KeyJ: 'J', KeyY: 'Y', KeyG: 'G', KeyL: 'L',
  KeyS: 'S', KeyW: 'W', KeyF: 'F', KeyI: 'I',
  Digit0: '0', Digit1: '1', Digit2: '2', Digit3: '3',
  Period: '.',
  Space: 'Space',
  Escape: 'Escape',
  Enter: 'Enter',
  Backslash: '\\',
  ArrowLeft: 'Left', ArrowRight: 'Right', ArrowUp: 'Up', ArrowDown: 'Down'
}

// The strings the menu already showed. Electron accepts any modifier order;
// these stay byte-for-byte so a rebuilt menu does not rename a chord.
const HISTORICAL: Readonly<Record<string, string>> = {
  'spawn-sheet': 'CmdOrCtrl+Shift+N',
  'tidy-alias': 'CmdOrCtrl+Alt+T',
  flip: 'CmdOrCtrl+Alt+F',
  undo: 'CmdOrCtrl+Z',
  redo: 'Shift+CmdOrCtrl+Z',
  copy: 'CmdOrCtrl+C',
  paste: 'CmdOrCtrl+V'
}

export function shortcutById(id: string): ShortcutDef | undefined {
  return SHORTCUTS.find((row) => row.id === id)
}

/** A chord string that is not a key (a mouse gesture) parses as null. */
export function parseChord(chord: string): ParsedChord | null {
  let meta = false
  let alt = false
  let shift = false
  let ctrl = false
  let i = 0
  while (i < chord.length) {
    const ch = chord[i]
    if (ch === '⌘') { meta = true; i++; continue }
    if (ch === '⌥') { alt = true; i++; continue }
    if (ch === '⇧') { shift = true; i++; continue }
    if (ch === '⌃') { ctrl = true; i++; continue }
    break
  }
  const code = KEY_CODE[chord.slice(i)]
  if (code === undefined) return null
  return { meta, alt, shift, ctrl, code }
}

function matches(row: ShortcutDef, event: ShortcutEvent): boolean {
  const parsed = parseChord(row.chord)
  if (parsed === null) return false
  return parsed.meta === event.metaKey && parsed.alt === event.altKey &&
    parsed.shift === event.shiftKey && parsed.ctrl === event.ctrlKey &&
    parsed.code === event.code
}

/** Canvas wins when the same chord exists in two scopes (⌘K). */
export function matchShortcut(event: ShortcutEvent): ShortcutDef | null {
  const hits = SHORTCUTS.filter((row) => matches(row, event))
  return hits.find((row) => row.scope === 'canvas') ?? hits[0] ?? null
}

/** Chord strings that collide inside one scope. The live list must be empty. */
export function duplicateChords(list: readonly ShortcutDef[]): string[] {
  const seen = new Map<string, string>()
  const dups: string[] = []
  for (const row of list) {
    const key = `${row.scope}\0${row.chord}`
    const prev = seen.get(key)
    if (prev !== undefined) dups.push(`${row.chord} in ${row.scope}: ${prev} and ${row.id}`)
    else seen.set(key, row.id)
  }
  return dups
}

export function electronAccelerator(id: string): string {
  const historical = HISTORICAL[id]
  if (historical !== undefined) return historical
  const def = shortcutById(id)
  if (def === undefined) throw new Error(`unknown shortcut ${id}`)
  const parsed = parseChord(def.chord)
  if (parsed === null) throw new Error(`${id} has no menu accelerator`)
  const parts: string[] = []
  if (parsed.alt) parts.push('Alt')
  if (parsed.shift) parts.push('Shift')
  if (parsed.meta) parts.push('CmdOrCtrl')
  if (parsed.ctrl) parts.push('Ctrl')
  const key = ACCEL[parsed.code]
  if (key === undefined) throw new Error(`${id} has no accelerator key`)
  parts.push(key)
  return parts.join('+')
}

/**
 * While a panel is locked, every canvas chord stands down except ⌘⇧L.
 * Callers that would `preventDefault` must return first, so the key reaches
 * the terminal (D4). Unlocked, nothing stands down.
 */
export function canvasChordStandsDown(def: ShortcutDef, locked: boolean): boolean {
  if (!locked) return false
  if (def.scope !== 'canvas') return false
  return def.id !== 'focus-lock'
}

let lockedPanelId: string | null = null
const lockListeners = new Set<() => void>()

export function getFocusLock(): string | null {
  return lockedPanelId
}

export function focusLocked(): boolean {
  return lockedPanelId !== null
}

export function subscribeFocusLock(listener: () => void): () => void {
  lockListeners.add(listener)
  return () => { lockListeners.delete(listener) }
}

function emitLock(): void {
  for (const listener of lockListeners) listener()
}

export function setFocusLock(panelId: string | null): void {
  const next = panelId === null || panelId === '' ? null : panelId
  if (next === lockedPanelId) return
  lockedPanelId = next
  emitLock()
}

/** Locked → unlock, whoever is focused. Unlocked → lock `panelId`. */
export function toggleFocusLock(panelId: string): void {
  if (lockedPanelId !== null) setFocusLock(null)
  else setFocusLock(panelId)
}

/** True when this keydown is a canvas chord the terminal should receive. */
export function yieldsToTerminal(event: ShortcutEvent): boolean {
  const hit = matchShortcut(event)
  if (hit === null) return false
  return canvasChordStandsDown(hit, focusLocked())
}
