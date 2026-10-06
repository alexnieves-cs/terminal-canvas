/**
 * M446. User chords over the frozen registry.
 *
 * `shortcuts.ts` is the list Settings, the menu and the listeners read, and
 * it is frozen at rd-foundations. A re-recorded chord cannot be written
 * there. This module is the merge: pure, no Electron, no DOM. Callers that
 * still import `electronAccelerator` or `matchShortcut` keep the registry
 * chord until they take `acceleratorFor` / `matchEffective` (R-025). An empty
 * override list is that registry, including the historical menu strings.
 *
 * Canvas scope requires ⌘ (D4's half of the same rule: a bare key belongs
 * to the terminal). A duplicate is refused inside one scope, the way
 * `duplicateChords` already defines a collision, and the clashing row is
 * named so the page can show it before anything is stored. `tidy-alias`
 * stays its own id (D5): moving Tidy onto ⌘⌥T clashes with the alias rather
 * than silently retiring it.
 */

import type { ShortcutDef, ShortcutGroup, ShortcutScope } from './redesign-contracts'
import {
  SHORTCUTS,
  SHORTCUT_CONFLICTS,
  electronAccelerator,
  parseChord,
  shortcutById,
  type ShortcutEvent
} from './shortcuts'

export interface ShortcutOverride {
  id: string
  chord: string
}

export type ProposeResult =
  | { ok: true; overrides: ShortcutOverride[] }
  | { ok: false; reason: string; clashId?: string }

const GLYPH_ACCEL: Readonly<Record<string, string>> = {
  Space: 'Space',
  Esc: 'Escape',
  '↵': 'Enter',
  '\\': '\\',
  '←': 'Left',
  '→': 'Right',
  '↑': 'Up',
  '↓': 'Down',
  '.': '.'
}

/** What the section heading is for. Absent for a group the registry adds later: the id is the heading. */
const GROUP_PURPOSE: Readonly<Partial<Record<ShortcutGroup, string>>> = {
  create: 'New objects on the canvas',
  sessions: "Move between what's running",
  navigate: 'Move around the canvas',
  mouse: 'The pointer',
  existing: 'Chords already in the app'
}

export interface KeyboardAlias {
  id: string
  chord: string
  /** True while the alias still wears the registry chord (D5's one release). */
  kept: boolean
}

export interface KeyboardRowModel {
  id: string
  label: string
  chord: string
  scope: ShortcutScope
  group: ShortcutGroup
  recordable: boolean
  alias?: KeyboardAlias
}

export interface KeyboardSection {
  group: ShortcutGroup
  rows: KeyboardRowModel[]
}

export function effectiveShortcuts(overrides: readonly ShortcutOverride[]): ShortcutDef[] {
  const chords = new Map(overrides.map((item) => [item.id, item.chord]))
  return SHORTCUTS.map((row) => {
    const chord = chords.get(row.id)
    return chord === undefined ? row : { ...row, chord }
  })
}

/**
 * Accept or refuse one re-record against the overrides already stored.
 * Refusing returns no list: a caller that saved `overrides` off a failure
 * would have nothing to write, which is the point of naming the clash first.
 */
export function proposeOverride(id: string, chord: string, current: readonly ShortcutOverride[]): ProposeResult {
  const def = shortcutById(id)
  if (def === undefined) return { ok: false, reason: `${id} is not a shortcut` }
  const parsed = parseChord(chord)
  // The frozen parser only knows the registry's keys. A letter it has never
  // seen (P, for one) cannot be matched later, so it is refused here rather
  // than stored as a chord nothing will recognise.
  if (def.scope === 'mouse' || parsed === null) {
    return {
      ok: false,
      reason: def.scope === 'mouse'
        ? `${def.label} is not a key chord`
        : `${def.label} can't use ${chord} — that key isn't one this list can match.`
    }
  }
  if (def.scope === 'canvas' && !parsed.meta) {
    return { ok: false, reason: `${def.label} needs ⌘ — a bare key belongs to the terminal you're typing in.` }
  }
  // Back to the registry chord is "no override", not a stored copy of the default.
  const next = current.filter((item) => item.id !== id)
  if (chord !== def.chord) next.push({ id, chord })
  const mine = effectiveShortcuts(next).find((row) => row.id === id)
  const clash = effectiveShortcuts(next).find((row) => row.id !== id && row.scope === mine?.scope && row.chord === chord)
  if (clash !== undefined) {
    return { ok: false, reason: `${clash.label} already uses ${chord}.`, clashId: clash.id }
  }
  return { ok: true, overrides: next }
}

/** `id<TAB>chord`. A chord never contains a tab; an id never does either. */
export function encodeOverrideList(overrides: readonly ShortcutOverride[]): string[] {
  return overrides.map((item) => `${item.id}\t${item.chord}`)
}

/**
 * The load door. An unknown id, a chord `parseChord` rejects, a bare canvas
 * key and a duplicate are dropped rather than applied: the same refusals
 * `proposeOverride` makes on the way in, so a hand-edited list cannot paint
 * two rows on one chord.
 */
export function parseOverrideList(stored: readonly string[]): ShortcutOverride[] {
  if (!Array.isArray(stored)) return []
  let kept: ShortcutOverride[] = []
  for (const entry of stored) {
    if (typeof entry !== 'string') continue
    const tab = entry.indexOf('\t')
    if (tab <= 0) continue
    const result = proposeOverride(entry.slice(0, tab), entry.slice(tab + 1), kept)
    if (!result.ok) continue
    kept = result.overrides
  }
  return kept
}

/** Menu accelerator for an id. No override: the frozen helper, historical strings included. */
export function acceleratorFor(id: string, overrides: readonly ShortcutOverride[]): string {
  const hit = overrides.find((item) => item.id === id)
  if (hit === undefined) return electronAccelerator(id)
  const parsed = parseChord(hit.chord)
  if (parsed === null) throw new Error(`${id} has no menu accelerator`)
  let i = 0
  while (i < hit.chord.length && '⌘⌥⇧⌃'.includes(hit.chord[i])) i += 1
  const glyph = hit.chord.slice(i)
  const key = GLYPH_ACCEL[glyph] ?? (glyph.length === 1 ? glyph : undefined)
  if (key === undefined) throw new Error(`${id} has no accelerator key`)
  const parts: string[] = []
  if (parsed.alt) parts.push('Alt')
  if (parsed.shift) parts.push('Shift')
  if (parsed.meta) parts.push('CmdOrCtrl')
  if (parsed.ctrl) parts.push('Ctrl')
  parts.push(key)
  return parts.join('+')
}

/** `matchShortcut`, over the merged list. Canvas still wins inside one chord (⌘K). */
export function matchEffective(event: ShortcutEvent, overrides: readonly ShortcutOverride[]): ShortcutDef | null {
  const hits = effectiveShortcuts(overrides).filter((row) => {
    const parsed = parseChord(row.chord)
    if (parsed === null) return false
    return parsed.meta === event.metaKey && parsed.alt === event.altKey &&
      parsed.shift === event.shiftKey && parsed.ctrl === event.ctrlKey &&
      parsed.code === event.code
  })
  return hits.find((row) => row.scope === 'canvas') ?? hits[0] ?? null
}

export function sectionPurpose(group: ShortcutGroup): string {
  return GROUP_PURPOSE[group] ?? group
}

/** Groups in registry order. Aliases fold onto their target instead of a second row. */
export function keyboardSections(overrides: readonly ShortcutOverride[]): KeyboardSection[] {
  const rows = effectiveShortcuts(overrides)
  const order: ShortcutGroup[] = []
  for (const row of rows) {
    if (row.aliasOf !== undefined) continue
    if (!order.includes(row.group)) order.push(row.group)
  }
  const aliases = rows.filter((row) => row.aliasOf !== undefined)
  return order.map((group) => ({
    group,
    rows: rows.filter((row) => row.group === group && row.aliasOf === undefined).map((row) => {
      const alias = aliases.find((item) => item.aliasOf === row.id)
      const registryAlias = SHORTCUTS.find((item) => item.aliasOf === row.id)
      const model: KeyboardRowModel = {
        id: row.id,
        label: row.label,
        chord: row.chord,
        scope: row.scope,
        group: row.group,
        recordable: row.scope !== 'mouse' && parseChord(row.chord) !== null
      }
      if (alias !== undefined && registryAlias !== undefined) {
        model.alias = { id: alias.id, chord: alias.chord, kept: alias.chord === registryAlias.chord }
      }
      return model
    })
  }))
}

export function filterSections(sections: readonly KeyboardSection[], query: string): KeyboardSection[] {
  const q = query.trim().toLowerCase()
  if (q === '') return sections.map((section) => ({ ...section, rows: [...section.rows] }))
  return sections
    .map((section) => ({
      ...section,
      rows: section.rows.filter((row) =>
        row.label.toLowerCase().includes(q) ||
        row.chord.toLowerCase().includes(q) ||
        row.id.toLowerCase().includes(q) ||
        (row.alias?.chord.toLowerCase().includes(q) ?? false))
    }))
    .filter((section) => section.rows.length > 0)
}

/**
 * D4, in the sentence the Keyboard page shows. The chords are the registry's
 * (palette and focus lock), not a second copy, so a rename of either chord
 * moves this sentence with it.
 */
export function conflictBanner(): { text: string; changeId: string } | null {
  const palette = shortcutById('palette')
  const lock = shortcutById('focus-lock')
  if (palette === undefined || lock === undefined) return null
  const conflict = SHORTCUT_CONFLICTS.find((item) => item.chord === palette.chord)
  if (conflict === undefined) return null
  return {
    text: `${palette.chord} is also used by claude to clear the screen. The canvas takes it unless a panel is in focus lock (${lock.chord}).`,
    changeId: palette.id
  }
}
