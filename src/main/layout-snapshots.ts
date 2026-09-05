import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseLayout, type LayoutSnapshot, type Workspace } from '@shared/layout-schema'
import type { SnapshotMeta } from '@shared/ipc-contract'
export type { SnapshotMeta }

/**
 * M93. THE LAYOUT TIME MACHINE — snapshots of SAVES.
 *
 * A snapshot is a side effect of `layout-store.ts`'s successful write: the
 * bytes it just wrote, copied under `userData/layout-snapshots/<stamp>.json`
 * with the same temp-and-rename, the newest `max` kept, oldest trimmed.
 * Nothing reads a snapshot back except the restore verb, and the restore
 * never touches the current workspace: it mints a NEW one beside it, so
 * reset stays final and a deleted workspace is never resurrected in place.
 *
 * Coalesced within `minMs` (a drag saves every gesture; twenty snapshots of
 * one afternoon of dragging is no history). The first record after launch
 * always lands. `dir` and `now` are injected: `verify:layout snap.1` drives
 * the real ring under plain node.
 */

export const SNAPSHOT_MAX = 20
export const SNAPSHOT_MIN_MS = 60_000


export interface LayoutSnapshots {
  /** True when a file landed; false when coalesced or when the write failed (warned). */
  record(bytes: string): boolean
  list(): SnapshotMeta[]
  /** The parsed layout, through the ONE parser; null when the stamp names no file. */
  read(at: number): { snapshot: LayoutSnapshot; warnings: string[] } | null
}

export function createLayoutSnapshots(deps: { dir: string; now?: () => number; max?: number; minMs?: number; onWarning?: (m: string) => void }): LayoutSnapshots {
  const now = deps.now ?? (() => Date.now())
  const max = deps.max ?? SNAPSHOT_MAX
  const minMs = deps.minMs ?? SNAPSHOT_MIN_MS
  const warn = deps.onWarning ?? ((m: string) => console.warn(`[snapshots] ${m}`))
  let lastAt: number | null = null
  // Warn ONCE for an unwritable directory: a failed write bypasses the
  // coalesce (lastAt is set only on success), and once per save is noise.
  let warnedWrite = false

  const files = (): number[] => {
    if (!existsSync(deps.dir)) return []
    return readdirSync(deps.dir)
      .filter((f) => /^\d+\.json$/.test(f))
      .map((f) => Number(f.slice(0, -5)))
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b)
  }

  return {
    record(bytes) {
      const at = now()
      if (lastAt !== null && at - lastAt < minMs) return false
      try {
        mkdirSync(deps.dir, { recursive: true })
        const target = join(deps.dir, `${at}.json`)
        const tmp = `${target}.tmp`
        writeFileSync(tmp, bytes, 'utf8')
        renameSync(tmp, target)
        lastAt = at
        const all = files()
        for (const old of all.slice(0, Math.max(0, all.length - max))) {
          try { unlinkSync(join(deps.dir, `${old}.json`)) } catch (error) { warn(`could not trim snapshot ${old}: ${String(error)}`) }
        }
        return true
      } catch (error) {
        if (!warnedWrite) { warnedWrite = true; warn(`could not write a snapshot: ${String(error)}`) }
        return false
      }
    },
    list() {
      const out: SnapshotMeta[] = []
      for (const at of files().reverse()) {
        try {
          const text = readFileSync(join(deps.dir, `${at}.json`), 'utf8')
          const raw = JSON.parse(text) as { workspaces?: unknown }
          const workspaces = Array.isArray(raw.workspaces) ? raw.workspaces : []
          const panels = workspaces.reduce((n: number, w: unknown) => n + (typeof w === 'object' && w !== null && Array.isArray((w as { panels?: unknown }).panels) ? ((w as { panels: unknown[] }).panels).length : 0), 0)
          out.push({ at, bytes: Buffer.byteLength(text, 'utf8'), workspaces: workspaces.length, panels })
        } catch (error) {
          warn(`could not read snapshot ${at}: ${String(error)}`)
        }
      }
      return out
    },
    read(at) {
      const path = join(deps.dir, `${at}.json`)
      if (!existsSync(path)) return null
      try {
        return parseLayout(readFileSync(path, 'utf8'))
      } catch (error) {
        warn(`could not parse snapshot ${at}: ${String(error)}`)
        return null
      }
    }
  }
}

export type RestoreResult = { kind: 'restored'; layout: LayoutSnapshot; workspaceId: string; /** Links, group members and run entries naming a panel outside the source workspace, dropped. */ dropped: number } | { kind: 'refused'; reason: string }

/**
 * Pure. Adds the snapshot's ACTIVE workspace beside the current layout's
 * workspaces as a NEW one, named by its source and the time, every panel id
 * re-minted through `mint` (ids are one sequence — a restored `n3` beside a
 * live `n3` would be two panels with one registry entry) with links, groups,
 * runs and annotations following the rename; activates it. The current
 * workspaces are handed back untouched, by reference.
 */
export function restoreFromSnapshot(current: LayoutSnapshot, bytes: string, at: number, mint: (n: number) => string, afterId?: number): RestoreResult {
  // parseLayout never throws — a broken file is a default layout with
  // warnings, the right answer for a boot and the wrong one here, where the
  // user asked for THIS file. JSON is checked first so a corrupt snapshot is
  // refused by name rather than restored as an empty canvas.
  try {
    JSON.parse(bytes)
  } catch (error) {
    return { kind: 'refused', reason: `the snapshot is not valid JSON: ${String(error)}` }
  }
  const parsed = parseLayout(bytes)
  if (parsed.snapshot.workspaces.length === 0) return { kind: 'refused', reason: 'the snapshot holds no workspace' }
  const source = parsed.snapshot.workspaces.find((w) => w.id === parsed.snapshot.activeWorkspaceId) ?? parsed.snapshot.workspaces[0]!
  // Ids: past every id in the current layout, so neither a live panel nor a
  // later restore of the same snapshot collides (the `taken` loop below).
  const taken = new Set<string>()
  for (const w of current.workspaces) for (const p of w.panels) taken.add(p.id)
  // Past every PERSISTED id and past the renderer's own counter when it says
  // (a panel spawned inside the store's coalesce window is not on disk yet).
  let seq = Math.max(0, Math.floor(afterId ?? 0) - 1)
  for (const id of taken) { const m = /^[a-z]+(\d+)$/.exec(id); if (m) seq = Math.max(seq, Number(m[1])) }
  const rename = new Map<string, string>()
  for (const p of source.panels) {
    let next: string
    do { next = mint(++seq) } while (taken.has(next))
    taken.add(next)
    rename.set(p.id, next)
  }
  const re = (id: string): string => rename.get(id) ?? id
  // A link, membership or run entry naming a panel OUTSIDE the source
  // workspace is dropped now rather than on the next boot (parseLayout would
  // drop it then; between restore and relaunch the renderer would hold a link
  // to nothing).
  const known = (id: string): boolean => rename.has(id)
  let dropped = 0
  const wsIds = new Set(current.workspaces.map((w) => w.id))
  let wid = `w${at}`
  let n = 0
  while (wsIds.has(wid)) wid = `w${at}-${++n}`
  const when = new Date(at)
  const hh = String(when.getHours()).padStart(2, '0'), mm = String(when.getMinutes()).padStart(2, '0')
  const restored: Workspace = {
    ...source,
    id: wid,
    name: `${source.name} @ ${hh}:${mm}`,
    panels: source.panels.map((p) => ({
      ...p,
      id: re(p.id),
      ...(p.links === undefined ? {} : { links: p.links.filter((l) => { const ok = known(l.to); if (!ok) dropped += 1; return ok }).map((l) => ({ ...l, to: re(l.to) })) })
    })),
    groups: source.groups.map((g) => ({ ...g, panelIds: g.panelIds.filter((id) => { const ok = known(id); if (!ok) dropped += 1; return ok }).map(re) })).filter((g) => g.panelIds.length > 0),
    selectedId: source.selectedId === null ? null : re(source.selectedId),
    focusedId: source.focusedId === null ? null : re(source.focusedId),
    runs: source.runs.map((r) => ({ ...r, panelIds: r.panelIds.filter(known).map(re), entries: r.entries.filter((e) => { const ok = known(e.panelId); if (!ok) dropped += 1; return ok }).map((e) => ({ ...e, panelId: re(e.panelId) })) })),
    ...(source.annotations === undefined ? {} : { annotations: source.annotations.filter((a) => a.anchor.kind === 'world' || known(a.anchor.panelId)).map((a) => (a.anchor.kind === 'panel' ? { ...a, anchor: { ...a.anchor, panelId: re(a.anchor.panelId) } } : a)) })
  }
  return { kind: 'restored', workspaceId: wid, dropped, layout: { ...current, activeWorkspaceId: wid, workspaces: [...current.workspaces, restored] } }
}
