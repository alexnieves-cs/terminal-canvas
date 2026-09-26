/**
 * The shared canvas inside the workspace Y.Doc — the same doc presence rides
 * (presence-hub.ts), so the canvas needs no second transport.
 *
 *   canvas:panels  Y.Map< docKey, Y.Map<field, value> >   one FIELD MAP per panel
 *   canvas:groups  Y.Map< docKey, Y.Map<field, value> >   one field map per group
 *   canvas:files   Y.Map< docKey, Y.Text >                 one TEXT per shared file panel
 *
 * A shared file's key is its file panel's key, so the text lives and dies with
 * the panel (a tombstoned panel's text refuses every edit) and two panels on
 * one path keep two drafts, as they always have (CodeEditor's model-per-editor
 * rule). Only the characters are shared: cursors and selections ride
 * AWARENESS (shared/presence.ts textCursor), never the doc — a cursor written
 * into the doc would be history every peer keeps forever.
 *
 * Why a map OF field maps rather than a map of panel records: a Y.Map key is
 * last-writer-wins as a whole value, so a record per panel would let A's move
 * and B's concurrent resize of the same panel overwrite each other. With a key
 * per field, x/y and w/h are independent registers and both survive. (Yjs
 * breaks a tie between truly concurrent writes to ONE field by client id, not
 * wall clock — deterministic on every peer, which is what convergence needs.)
 *
 * Why TOMBSTONES (`deleted: true`) and never `panels.delete(key)`: a root-level
 * delete races a concurrent write into the same field map — the write lands in
 * a map nobody can see, and a peer that re-seeds from its own layout.json puts
 * the panel straight back. A tombstone is a field like any other, so it
 * converges, and it is permanent: `deleted` never goes back to false, and the
 * server refuses an update that tries (inspectUpdate below).
 *
 * Keys are `<host>_<localId>`. Panel and group ids are minted per machine
 * (`n3`, `g2` — Canvas.tsx's nextIdRef), so two Macs WILL mint the same id;
 * the host prefix (a random install id, never a person) keeps them apart and
 * still matches ID_PATTERN, so a remote group persists through parseGroups.
 *
 * Imported by main and the collab server; NEVER by the renderer (its one yjs
 * door is renderer/shared-text/, a replica main gates with inspectUpdate —
 * src/renderer/CLAUDE.md). The renderer speaks canvas-ops.ts.
 */
import * as Y from 'yjs'
import { TEAM_DOC_MAP } from './team'
import {
  CANVAS_FILES, RECT_FIELDS, SHARED_TEXT_MAX, type CanvasOp, type OpContext, type SharedGroup, type SharedPanel
} from './canvas-ops'

export const CANVAS_PANELS = 'canvas:panels'
export const CANVAS_GROUPS = 'canvas:groups'
export { CANVAS_FILES }

/** A random install id: base36, no `_`, so a doc key splits at its first `_`. */
export const HOST_PATTERN = /^[a-z0-9]{6,32}$/

export const docKey = (host: string, localId: string): string => `${host}_${localId}`
/** The local id when `key` was minted on `host`, else null. */
export const localIdOf = (host: string, key: string): string | null =>
  key.startsWith(`${host}_`) ? key.slice(host.length + 1) : null

const panelsOf = (doc: Y.Doc): Y.Map<Y.Map<unknown>> => doc.getMap(CANVAS_PANELS)
const groupsOf = (doc: Y.Doc): Y.Map<Y.Map<unknown>> => doc.getMap(CANVAS_GROUPS)
const filesOf = (doc: Y.Doc): Y.Map<unknown> => doc.getMap(CANVAS_FILES)

/** One shared file's text, or undefined when that file is not shared (or the key holds something malformed). */
export function sharedText(doc: Y.Doc, fileKey: string): Y.Text | undefined {
  const t = filesOf(doc).get(fileKey)
  return t instanceof Y.Text ? t : undefined
}

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)

/** A field map as a SharedPanel, or undefined when it is malformed. Tombstones are read by `isTombstone`. */
function panelOf(key: string, fm: unknown): SharedPanel | undefined {
  if (!(fm instanceof Y.Map)) return undefined
  const kind = str(fm.get('kind')), title = str(fm.get('title')), owner = str(fm.get('owner')), host = str(fm.get('host'))
  const x = num(fm.get('x')), y = num(fm.get('y')), w = num(fm.get('w')), h = num(fm.get('h')), z = num(fm.get('z'))
  if (kind === undefined || title === undefined || owner === undefined || host === undefined ||
      x === undefined || y === undefined || w === undefined || h === undefined || z === undefined) return undefined
  return { id: key, kind, title, owner, host, x, y, w, h, z }
}

const isTombstone = (fm: unknown): boolean => fm instanceof Y.Map && fm.get('deleted') === true

function groupOf(key: string, fm: unknown): SharedGroup | undefined {
  if (!(fm instanceof Y.Map) || isTombstone(fm)) return undefined
  const label = str(fm.get('label')), colour = str(fm.get('colour')), ids = fm.get('panelIds')
  if (label === undefined || colour === undefined || !Array.isArray(ids) || !ids.every((i) => typeof i === 'string')) return undefined
  return { id: key, label, colour, panelIds: [...ids] as string[], ...(fm.get('collapsed') === true ? { collapsed: true } : {}) }
}

export function readSharedPanels(doc: Y.Doc): { live: SharedPanel[]; tombstones: Set<string> } {
  const live: SharedPanel[] = []
  const tombstones = new Set<string>()
  panelsOf(doc).forEach((fm, key) => {
    if (isTombstone(fm)) { tombstones.add(key); return }
    const p = panelOf(key, fm)
    if (p !== undefined) live.push(p)
  })
  return { live, tombstones }
}

export function readSharedGroups(doc: Y.Doc): SharedGroup[] {
  const out: SharedGroup[] = []
  groupsOf(doc).forEach((fm, key) => { const g = groupOf(key, fm); if (g !== undefined) out.push(g) })
  return out
}

/** The context authorizeCanvasOp needs, read from the doc as it stands now. */
export function opContext(doc: Y.Doc, op: CanvasOp, userId: string): OpContext {
  const key = op.kind === 'create' ? op.panel.id : 'panelId' in op ? op.panelId : 'fileKey' in op ? op.fileKey : null
  if (key === null) return { userId, panelOwner: null }
  const file = 'fileKey' in op ? { fileExists: filesOf(doc).has(key) } : {}
  const fm = panelsOf(doc).get(key)
  if (fm === undefined) return { userId, panelOwner: null, ...file }
  if (isTombstone(fm)) return { userId, panelOwner: null, panelDeleted: true, ...file }
  return { userId, panelOwner: str(fm.get('owner')) ?? null, ...file }
}

/** Set only what differs, so an unchanged field makes no Yjs item (and no network traffic). */
const setIf = (fm: Y.Map<unknown>, k: string, v: unknown): void => {
  const cur = fm.get(k)
  if (Array.isArray(v) ? JSON.stringify(cur) === JSON.stringify(v) : cur === v) return
  fm.set(k, v)
}

/**
 * Write one op. NOT authorised here — the caller has already asked
 * authorizeCanvasOp; this is the mechanism, not the policy.
 */
export function applyCanvasOp(doc: Y.Doc, op: CanvasOp, origin: unknown): void {
  doc.transact(() => {
    const panels = panelsOf(doc)
    const groups = groupsOf(doc)
    switch (op.kind) {
      case 'rect': {
        const fm = panels.get(op.panelId)
        if (fm === undefined || isTombstone(fm)) return
        for (const [k, v] of Object.entries(op.fields)) if (typeof v === 'number' && Number.isFinite(v)) setIf(fm, k, v)
        return
      }
      case 'create': {
        if (panels.has(op.panel.id)) return
        const fm = new Y.Map<unknown>()
        const { id: _id, ...fields } = op.panel
        for (const [k, v] of Object.entries(fields)) fm.set(k, v)
        panels.set(op.panel.id, fm)
        return
      }
      case 'retitle': {
        const fm = panels.get(op.panelId)
        if (fm !== undefined && !isTombstone(fm)) setIf(fm, 'title', op.title)
        return
      }
      case 'delete': {
        const fm = panels.get(op.panelId)
        if (fm !== undefined && !isTombstone(fm)) fm.set('deleted', true)
        return
      }
      case 'group-set': {
        let fm = groups.get(op.group.id)
        if (fm !== undefined && isTombstone(fm)) return
        if (fm === undefined) { fm = new Y.Map<unknown>(); groups.set(op.group.id, fm) }
        setIf(fm, 'label', op.group.label)
        setIf(fm, 'colour', op.group.colour)
        setIf(fm, 'panelIds', op.group.panelIds)
        if (op.group.collapsed === true) setIf(fm, 'collapsed', true)
        else if (fm.has('collapsed')) fm.delete('collapsed')
        return
      }
      case 'group-delete': {
        const fm = groups.get(op.groupId)
        if (fm !== undefined && !isTombstone(fm)) fm.set('deleted', true)
        return
      }
      default:
        return
    }
  }, origin)
}

const PANEL_FIELDS = new Set(['kind', 'title', 'owner', 'host', 'x', 'y', 'w', 'h', 'z'])
const GROUP_FIELDS = new Set(['label', 'colour', 'panelIds', 'collapsed', 'deleted'])

/**
 * What a raw update would DO to `doc`, as ops — the server's per-operation
 * check (server/collab). It is applied to a throwaway copy of the doc and the
 * copy's transaction is read back, so the answer is exactly what Yjs would
 * change, not a guess from the update's bytes: a SyncStep2 carrying a
 * client's whole state reports only the part the server does not have.
 *
 * Every change that is not one of the named ops comes back `unknown` and is
 * refused by the table: a root-level delete or replace of a panel (tombstones
 * only), un-deleting, rewriting a panel's kind/owner/host, a new root type, a
 * text or array edit anywhere but a shared file's own Y.Text, a file's text
 * replaced or removed, or a text grown past SHARED_TEXT_MAX.
 */
export function inspectUpdate(doc: Y.Doc, update: Uint8Array): Array<{ op: CanvasOp; ctx: Omit<OpContext, 'userId'> }> {
  const copy = new Y.Doc({ gc: false })
  Y.applyUpdate(copy, Y.encodeStateAsUpdate(doc))
  const panels = panelsOf(copy), groups = groupsOf(copy), files = filesOf(copy), team = copy.getMap(TEAM_DOC_MAP)
  const before = (key: string): Omit<OpContext, 'userId'> => {
    const fm = panels.get(key)
    if (fm === undefined) return { panelOwner: null }
    if (isTombstone(fm)) return { panelOwner: null, panelDeleted: true }
    return { panelOwner: str(fm.get('owner')) ?? null }
  }
  const existed = { panels: new Set(panels.keys()), groups: new Set(groups.keys()), files: new Set(files.keys()) }
  // Context is read BEFORE the update applies: "whose panel was it" must not
  // be answered by the update that is being judged.
  const ctxBefore = new Map<string, Omit<OpContext, 'userId'>>()
  for (const key of existed.panels) ctxBefore.set(key, before(key))

  const out: Array<{ op: CanvasOp; ctx: Omit<OpContext, 'userId'> }> = []
  const unknown = (detail: string): void => { out.push({ op: { kind: 'unknown', detail }, ctx: { panelOwner: null } }) }
  const ctxOf = (key: string): Omit<OpContext, 'userId'> => ctxBefore.get(key) ?? { panelOwner: null }

  copy.on('afterTransaction', (tr: Y.Transaction) => {
    for (const [changed, keys] of tr.changed) {
      // Compared by identity against the maps above, so widened to unknown first.
      const type = changed as unknown
      const item = changed._item
      const parent = item?.parent
      if (type === panels) {
        for (const key of keys) {
          if (key === null) { unknown('canvas:panels changed as a list'); continue }
          if (existed.panels.has(key)) { unknown(`panel ${key} replaced or removed (tombstones only)`); continue }
          const fm = panels.get(key)
          const p = panelOf(key, fm)
          if (p === undefined || isTombstone(fm) || [...(fm?.keys() ?? [])].some((k) => !PANEL_FIELDS.has(k))) { unknown(`panel ${key} created malformed`); continue }
          out.push({ op: { kind: 'create', panel: p }, ctx: { panelOwner: null } })
        }
      } else if (parent === panels && item !== null && typeof item.parentSub === 'string') {
        const key = item.parentSub
        const fm = changed as unknown as Y.Map<unknown>
        const fields: Partial<Record<'x' | 'y' | 'w' | 'h' | 'z', number>> = {}
        for (const k of keys) {
          if (k === null) { unknown(`panel ${key} changed as a list`); continue }
          const v = fm.get(k)
          if ((RECT_FIELDS as readonly string[]).includes(k) || k === 'z') {
            const n = num(v)
            if (n === undefined) { unknown(`panel ${key}.${k} is not a number`); continue }
            fields[k as 'x'] = n
          } else if (k === 'title') {
            const t = str(v)
            if (t === undefined) unknown(`panel ${key}.title is not text`)
            else out.push({ op: { kind: 'retitle', panelId: key, title: t }, ctx: ctxOf(key) })
          } else if (k === 'deleted') {
            if (v === true) out.push({ op: { kind: 'delete', panelId: key }, ctx: ctxOf(key) })
            else unknown(`panel ${key} un-deleted`)
          } else unknown(`panel ${key}.${k} rewritten`)
        }
        if (Object.keys(fields).length > 0) out.push({ op: { kind: 'rect', panelId: key, fields }, ctx: ctxOf(key) })
      } else if (type === groups) {
        for (const key of keys) {
          if (key === null) { unknown('canvas:groups changed as a list'); continue }
          if (existed.groups.has(key)) { unknown(`group ${key} replaced or removed (tombstones only)`); continue }
          const fm = groups.get(key)
          const g = groupOf(key, fm)
          if (g === undefined || [...(fm?.keys() ?? [])].some((k) => !GROUP_FIELDS.has(k))) { unknown(`group ${key} created malformed`); continue }
          out.push({ op: { kind: 'group-set', group: g }, ctx: { panelOwner: null } })
        }
      } else if (parent === groups && item !== null && typeof item.parentSub === 'string') {
        const key = item.parentSub
        const fm = changed as unknown as Y.Map<unknown>
        if ([...keys].some((k) => k === null || !GROUP_FIELDS.has(k))) { unknown(`group ${key} field rewritten`); continue }
        if (keys.has('deleted')) {
          if (fm.get('deleted') === true) out.push({ op: { kind: 'group-delete', groupId: key }, ctx: { panelOwner: null } })
          else unknown(`group ${key} un-deleted`)
          continue
        }
        const g = groupOf(key, fm)
        if (g === undefined) unknown(`group ${key} left malformed`)
        else out.push({ op: { kind: 'group-set', group: g }, ctx: { panelOwner: null } })
      } else if (type === files) {
        for (const key of keys) {
          if (key === null) { unknown('canvas:files changed as a list'); continue }
          if (existed.files.has(key)) { unknown(`file ${key} replaced or removed`); continue }
          const t = files.get(key)
          if (!(t instanceof Y.Text)) { unknown(`file ${key} is not text`); continue }
          if (t.length > SHARED_TEXT_MAX) { unknown(`file ${key} is past the shared text limit`); continue }
          out.push({ op: { kind: 'file-create', fileKey: key }, ctx: { ...ctxOf(key), fileExists: false } })
        }
      } else if (changed instanceof Y.Text && parent === files && item !== null && typeof item.parentSub === 'string') {
        const key = item.parentSub
        if (changed.length > SHARED_TEXT_MAX) { unknown(`file ${key} is past the shared text limit`); continue }
        // A text created by this same update is judged as its file-create;
        // its first characters are part of the seed, not an edit of a file
        // that (as of before the update) did not exist.
        if (!existed.files.has(key)) continue
        out.push({ op: { kind: 'text-edit', fileKey: key }, ctx: { ...ctxOf(key), fileExists: true } })
      } else if (type === team) {
        for (const key of keys) {
          if (key === null) unknown('team changed as a list')
          else out.push({ op: { kind: 'team-snapshot', key }, ctx: { panelOwner: null } })
        }
      } else {
        const root = [...copy.share.entries()].find(([, t]) => t === type)?.[0]
        unknown(root !== undefined ? `root type ${root}` : 'a nested type outside the canvas maps')
      }
    }
  })
  Y.applyUpdate(copy, update)
  copy.destroy()
  return out
}

/** A local panel as main's layout store holds it — just what the doc needs. */
export interface LocalPanelLike { id: string; kind?: string; title?: string; x: number; y: number; w: number; h: number; z: number }
export interface LocalGroupLike { id: string; label: string; colour: string; panelIds: string[]; collapsed?: boolean }

/**
 * The ops that bring the doc in line with THIS machine's layout, the second
 * way a local change reaches the doc (the first is the drag write-through):
 * spawn, close, tidy, nudge, undo, a group made — anything that only reaches
 * main as a layout:save.
 *
 * `stale(key)` is true for a doc field a peer changed that the renderer has
 * not yet acknowledged seeing. Such a field is SKIPPED even when it differs:
 * the renderer's value is older than the doc's, and writing it would undo the
 * peer's edit — the classic write-back of a CRDT bound to a UI that lags it.
 * Keys: `p:<docKey>:<field>`, `g:<docKey>`.
 *
 * `title` is passed through `scrub` here, where it leaves this machine.
 */
export function diffLocal(
  doc: Y.Doc,
  local: { panels: LocalPanelLike[]; groups: LocalGroupLike[] },
  me: { userId: string; host: string },
  stale: (key: string) => boolean,
  scrub: (title: string) => string
): CanvasOp[] {
  const ops: CanvasOp[] = []
  const panels = panelsOf(doc)
  const groups = groupsOf(doc)
  const localKeys = new Set<string>()
  for (const p of local.panels) {
    const key = docKey(me.host, p.id)
    localKeys.add(key)
    const fm = panels.get(key)
    const title = scrub(p.title ?? '')
    if (fm === undefined) {
      ops.push({ kind: 'create', panel: { id: key, kind: p.kind ?? 'terminal', title, owner: me.userId, host: me.host, x: p.x, y: p.y, w: p.w, h: p.h, z: p.z } })
      continue
    }
    // A tombstone stays one: a peer removed this panel from the SHARED
    // canvas. It is still ours and still runs here; it just is not shared.
    if (isTombstone(fm)) continue
    const fields: Partial<Record<'x' | 'y' | 'w' | 'h' | 'z', number>> = {}
    for (const k of [...RECT_FIELDS, 'z'] as const) {
      if (fm.get(k) !== p[k] && !stale(`p:${key}:${k}`)) fields[k] = p[k]
    }
    if (Object.keys(fields).length > 0) ops.push({ kind: 'rect', panelId: key, fields })
    if (fm.get('title') !== title && !stale(`p:${key}:title`)) ops.push({ kind: 'retitle', panelId: key, title })
  }
  // Ours in the doc, gone from the layout: closed here.
  panels.forEach((fm, key) => {
    if (localKeys.has(key) || isTombstone(fm) || localIdOf(me.host, key) === null) return
    ops.push({ kind: 'delete', panelId: key })
  })

  // Translated by what is KNOWN, never by the shape of the id: ID_PATTERN
  // allows `_`, so an imported local id could look like a doc key.
  const localPanelIds = new Set(local.panels.map((p) => p.id))
  const panelToDoc = (id: string): string => (localPanelIds.has(id) ? docKey(me.host, id) : id)
  const groupToDoc = (id: string): string => {
    const fm = groups.get(id)
    return fm !== undefined && localIdOf(me.host, id) === null ? id : docKey(me.host, id)
  }
  const localGroups = new Set<string>()
  for (const g of local.groups) {
    const key = groupToDoc(g.id)
    localGroups.add(key)
    if (stale(`g:${key}`)) continue
    const fm = groups.get(key)
    if (fm !== undefined && isTombstone(fm)) continue
    const want: SharedGroup = { id: key, label: g.label, colour: g.colour, panelIds: g.panelIds.map(panelToDoc), ...(g.collapsed === true ? { collapsed: true } : {}) }
    const have = groupOf(key, fm)
    if (have === undefined || JSON.stringify(have) !== JSON.stringify(want)) ops.push({ kind: 'group-set', group: want })
  }
  groups.forEach((fm, key) => {
    if (localGroups.has(key) || isTombstone(fm) || stale(`g:${key}`)) return
    ops.push({ kind: 'group-delete', groupId: key })
  })
  return ops
}

/** Doc group → the renderer's group: our own ids lose their prefix, everyone else's keep theirs. */
export function groupToLocal(host: string, g: SharedGroup): SharedGroup {
  const loc = (key: string): string => localIdOf(host, key) ?? key
  return { ...g, id: loc(g.id), panelIds: g.panelIds.map(loc) }
}
