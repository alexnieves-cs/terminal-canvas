/**
 * M446. A keydown, turned into the chord string the registry already speaks.
 *
 * Pure on purpose: the page decides what to do with the step, and the canvas
 * ⌘ rule lives in `proposeOverride`, not here. Escape with no modifier
 * cancels. A modifier by itself is not a chord yet — the person is still
 * holding it down on the way to the key. ⌘Esc is a chord (Step out), so
 * Escape only cancels when it arrives alone.
 */

export const RECORDING_HINT = 'Recording — press the new shortcut, or Esc to cancel.'

export interface RecordKey {
  key: string
  code: string
  metaKey: boolean
  altKey: boolean
  shiftKey: boolean
  ctrlKey: boolean
  repeat?: boolean
}

export type RecordStep =
  | { kind: 'cancel' }
  | { kind: 'pending' }
  | { kind: 'chord'; chord: string }

const CODE_GLYPH: Record<string, string> = {
  Period: '.',
  Space: 'Space',
  Escape: 'Esc',
  Enter: '↵',
  Backslash: '\\',
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓'
}

for (let i = 0; i < 26; i += 1) {
  const letter = String.fromCharCode(65 + i)
  CODE_GLYPH[`Key${letter}`] = letter
}
for (let i = 0; i < 10; i += 1) CODE_GLYPH[`Digit${i}`] = String(i)

const MODIFIER_CODES = new Set([
  'ShiftLeft', 'ShiftRight', 'AltLeft', 'AltRight',
  'MetaLeft', 'MetaRight', 'ControlLeft', 'ControlRight'
])

export function stepFromKey(event: RecordKey): RecordStep {
  if (event.repeat) return { kind: 'pending' }
  const bare = !event.metaKey && !event.altKey && !event.shiftKey && !event.ctrlKey
  if (bare && (event.key === 'Escape' || event.code === 'Escape')) return { kind: 'cancel' }
  if (MODIFIER_CODES.has(event.code)) return { kind: 'pending' }
  const glyph = CODE_GLYPH[event.code]
  if (glyph === undefined) return { kind: 'pending' }
  let chord = ''
  if (event.metaKey) chord += '⌘'
  if (event.altKey) chord += '⌥'
  if (event.shiftKey) chord += '⇧'
  if (event.ctrlKey) chord += '⌃'
  chord += glyph
  return { kind: 'chord', chord }
}
