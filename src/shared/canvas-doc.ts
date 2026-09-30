/**
 * The shared canvas inside the workspace Y.Doc — the same doc presence rides
 * (presence-hub.ts), so the canvas needs no second transport.
 *
 *   canvas:panels  Y.Map< docKey, Y.Map<field, value> >   one FIELD MAP per panel
 *   canvas:groups  Y.Map< docKey, Y.Map<field, value> >   one field map per group
 *   canvas:files   Y.Map< docKey, Y.Text >                 one TEXT per shared file panel
 *   canvas:asks    Y.Map< docKey, Y.Map<field, value> >   one field map per team ask (M375)
 *
 * An ask's answers are one field PER PERSON (`answer:<user id>`), for the
 * panels' reason: two people answering at once are two registers, and both
 * survive. An answer and an ask's `closed` are each written once and never
 * rewritten, so the owner decides over answers that cannot move under it.
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
 * M392. A flowchart's content rides two more fields of the panel's map,
 * `shape` (a shape panel's record) and `connectors` (the arrows any panel
 * holds), each a JSON STRING rather than a nested Y type: both are written by
 * ONE author, the machine that runs the panel (the role table's
 * panel-content row), so there is nothing to merge and a string is one
 * last-writer-wins register like `title` — and a nested type would be a new
 * shape of change for inspectUpdate to judge, where a string is a value it
 * can cap. See `contentOf` for what a reader keeps of them.
 *
 * Imported by main and the collab server; NEVER by the renderer (its one yjs
 * door is renderer/shared-text/, a replica main gates with inspectUpdate —
 * src/renderer/CLAUDE.md). The renderer speaks canvas-ops.ts.
 */
import * as Y from 'yjs'
import { TEAM_DOC_MAP } from './team'
import {
  ASK_OUTCOMES, CANVAS_ASKS, CANVAS_FILES, RECT_FIELDS, SHARED_CONNECTORS_MAX, SHARED_SHAPE_MAX, SHARED_TEXT_MAX,
  type AskAnswer, type AskOutcome, type CanvasOp, type OpContext, type PanelContentField, type SharedAsk, type SharedGroup, type SharedPanel, type SharedRelay
} from './canvas-ops'
import { parseConnectors, parseShapeRecord, shapeSummary, type Connector, type ShapeRecord } from './flowchart'
import { RELAY_PROGRAM, RELAY_SESSION_ID } from './relay-protocol'

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
const asksOf = (doc: Y.Doc): Y.Map<Y.Map<unknown>> => doc.getMap(CANVAS_ASKS)

/** M375. An answer's field in an ask's map: one per person, so concurrent answers both survive. */
export const ANSWER_PREFIX = 'answer:'
const ASK_FIELDS = new Set(['panel', 'owner', 'tool', 'summary', 'scrubbed', 'at', 'need', 'spentUsd'])

/** A field map as a SharedAsk, or undefined when it is malformed. */
function askOf(key: string, fm: unknown): SharedAsk | undefined {
  if (!(fm instanceof Y.Map)) return undefined
  const panel = str(fm.get('panel')), owner = str(fm.get('owner')), tool = str(fm.get('tool')), summary = str(fm.get('summary'))
  const scrubbed = num(fm.get('scrubbed')), at = num(fm.get('at')), need = fm.get('need'), spent = fm.get('spentUsd')
  if (panel === undefined || owner === undefined || tool === undefined || summary === undefined || scrubbed === undefined || at === undefined) return undefined
  if (need !== 1 && need !== 2) return undefined
  if (spent !== undefined && num(spent) === undefined) return undefined
  return { id: key, panel, owner, tool, summary, scrubbed, at, need, ...(spent === undefined ? {} : { spentUsd: spent as number }) }
}

const isAnswer = (v: unknown): v is AskAnswer => v === 'allow' || v === 'deny'
const isOutcome = (v: unknown): v is AskOutcome => typeof v === 'string' && (ASK_OUTCOMES as readonly string[]).includes(v)

/** M375. Every well-formed ask with its answers (by user id) and, once decided, how it ended. */
export function readSharedAsks(doc: Y.Doc): Array<{ ask: SharedAsk; answers: Record<string, AskAnswer>; closed?: AskOutcome }> {
  const out: Array<{ ask: SharedAsk; answers: Record<string, AskAnswer>; closed?: AskOutcome }> = []
  asksOf(doc).forEach((fm, key) => {
    const ask = askOf(key, fm)
    if (ask === undefined) return
    const answers: Record<string, AskAnswer> = {}
    for (const [k, v] of fm.entries()) if (k.startsWith(ANSWER_PREFIX) && isAnswer(v)) answers[k.slice(ANSWER_PREFIX.length)] = v
    const closed = fm.get('closed')
    out.push({ ask, answers, ...(isOutcome(closed) ? { closed } : {}) })
  })
  return out
}

/** One shared file's text, or undefined when that file is not shared (or the key holds something malformed). */
export function sharedText(doc: Y.Doc, fileKey: string): Y.Text | undefined {
  const t = filesOf(doc).get(fileKey)
  return t instanceof Y.Text ? t : undefined
}

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)

/**
 * M343. A relay panel's two session fields as one value: both present and
 * well-formed on a `relay` panel, or both absent (null). Anything else —
 * half a pair, a bad id, a session on a terminal — is malformed (undefined).
 */
function relayOf(fm: Y.Map<unknown>, kind: string): SharedRelay | null | undefined {
  const session = fm.get('relaySession'), program = fm.get('relayProgram')
  if (session === undefined && program === undefined) return null
  if (kind !== 'relay' || typeof session !== 'string' || typeof program !== 'string') return undefined
  return RELAY_SESSION_ID.test(session) && RELAY_PROGRAM.test(program) ? { session, program } : undefined
}

/** A content field's JSON, or undefined when it is absent, not text, past its cap, or not JSON. */
function jsonField(v: unknown, cap: number): unknown {
  if (typeof v !== 'string' || v.length > cap) return undefined
  try { return JSON.parse(v) } catch { return undefined }
}

/**
 * M392. A panel's diagram content off the doc — the reading half of the wire.
 *
 * INERT BY CONSTRUCTION. What a peer wrote here is read through the same
 * per-field readers the layout file uses (parseShapeRecord, parseConnectors),
 * and they keep ONLY the named fields: a shape is a form, words and three
 * style words; a connector is a line between two panels with a label. No field
 * either can carry names a command, a path, a URL or anything that runs, so a
 * teammate's diagram can draw here and do nothing else (CLAUDE.md: what
 * arrives from outside is inert until a person looks — and looking at a line
 * starts nothing).
 *
 * Absent is not malformed (every panel before M392 has neither field). A value
 * that is not text, is past its cap, is not JSON or parses to nothing drawable
 * costs THAT FIELD, never the panel: the placeholder still stands, named by
 * its title. A shape record on a panel that is not a shape means nothing and
 * is dropped the same way. Targets are pruned by readSharedPanels, which knows
 * every live key.
 */
function contentOf(fm: Y.Map<unknown>, kind: string, key: string): Pick<SharedPanel, 'shape' | 'connectors'> {
  const out: Pick<SharedPanel, 'shape' | 'connectors'> = {}
  const rawShape = kind === 'shape' ? jsonField(fm.get('shape'), SHARED_SHAPE_MAX) : undefined
  if (rawShape !== undefined) {
    const shape = parseShapeRecord(rawShape, [], key)
    if (shape !== null) out.shape = shape
  }
  const rawConnectors = jsonField(fm.get('connectors'), SHARED_CONNECTORS_MAX)
  if (rawConnectors !== undefined) {
    const list = parseConnectors(rawConnectors, [], key)
    if (list !== undefined && list.length > 0) out.connectors = list
  }
  return out
}

/** A field map as a SharedPanel, or undefined when it is malformed. Tombstones are read by `isTombstone`. */
function panelOf(key: string, fm: unknown): SharedPanel | undefined {
  if (!(fm instanceof Y.Map)) return undefined
  const kind = str(fm.get('kind')), title = str(fm.get('title')), owner = str(fm.get('owner')), host = str(fm.get('host'))
  const x = num(fm.get('x')), y = num(fm.get('y')), w = num(fm.get('w')), h = num(fm.get('h')), z = num(fm.get('z'))
  if (kind === undefined || title === undefined || owner === undefined || host === undefined ||
      x === undefined || y === undefined || w === undefined || h === undefined || z === undefined) return undefined
  const relay = relayOf(fm, kind)
  if (relay === undefined) return undefined
  return { id: key, kind, title, owner, host, x, y, w, h, z, ...(relay === null ? {} : { relay }), ...contentOf(fm, kind, key) }
}

/** M392. A shape record as the doc stores it: fields in one fixed order, so an unchanged record is the same string and writes nothing. */
export function shapeJson(s: ShapeRecord): string {
  return JSON.stringify({
    form: s.form, text: s.text,
    ...(s.fill === undefined ? {} : { fill: s.fill }), ...(s.stroke === undefined ? {} : { stroke: s.stroke }), ...(s.ink === undefined ? {} : { ink: s.ink })
  })
}

/** M392. A panel's arrows as the doc stores them — the named fields only, in one fixed order (shapeJson's reason). */
export function connectorsJson(list: readonly Connector[]): string {
  return JSON.stringify(list.map((c) => ({
    id: c.id, to: c.to,
    ...(c.from === undefined ? {} : { from: c.from }), ...(c.toPort === undefined ? {} : { toPort: c.toPort }),
    ...(c.route === undefined ? {} : { route: c.route }), ...(c.ends === undefined ? {} : { ends: c.ends }),
    ...(c.label === undefined ? {} : { label: c.label }), ...(c.stroke === undefined ? {} : { stroke: c.stroke }),
    ...(c.dashed === true ? { dashed: true } : {})
  })))
}

const CONTENT_CAP: Record<PanelContentField, number> = { shape: SHARED_SHAPE_MAX, connectors: SHARED_CONNECTORS_MAX }

/**
 * M392. Why a content field's new value is refused at the gate, or null when
 * it may be written. The gate judges the ENVELOPE — text, within its cap, a
 * shape record only on a shape — and never the JSON inside: a newer client's
 * new form or port would otherwise close an older server's connections, where
 * the reader simply drops a field it cannot draw (contentOf). Removing the
 * field (undefined) is allowed: a panel whose last arrow went.
 */
function contentProblem(field: PanelContentField, v: unknown, kind: string): string | null {
  if (v === undefined) return null
  if (typeof v !== 'string') return 'is not text'
  if (v.length > CONTENT_CAP[field]) return 'is past its shared cap'
  if (field === 'shape' && kind !== 'shape') return 'is a shape record on a panel that is not a shape'
  return null
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
  // M392. An arrow names a live panel IN THIS DOC or it is not drawn — pruned
  // here, where every live key is known (the layout file's own second pass,
  // layout-schema/workspaces.ts). A tombstoned target is no target.
  const keys = new Set(live.map((p) => p.id))
  for (const p of live) {
    if (p.connectors === undefined) continue
    const kept = p.connectors.filter((c) => keys.has(c.to))
    if (kept.length === 0) delete p.connectors
    else if (kept.length !== p.connectors.length) p.connectors = kept
  }
  return { live, tombstones }
}

export function readSharedGroups(doc: Y.Doc): SharedGroup[] {
  const out: SharedGroup[] = []
  groupsOf(doc).forEach((fm, key) => { const g = groupOf(key, fm); if (g !== undefined) out.push(g) })
  return out
}

/** The context authorizeCanvasOp needs, read from the doc as it stands now. */
export function opContext(doc: Y.Doc, op: CanvasOp, userId: string): OpContext {
  if (op.kind === 'ask-answer' || op.kind === 'ask-close') {
    const fm = asksOf(doc).get(op.askId)
    return { userId, panelOwner: null, askOwner: fm === undefined ? null : str(fm.get('owner')) ?? null, askClosed: fm?.has('closed') === true }
  }
  if (op.kind === 'ask-open') {
    const fm = panelsOf(doc).get(op.ask.panel)
    const owner = fm === undefined || isTombstone(fm) ? null : str(fm.get('owner')) ?? null
    return { userId, panelOwner: owner, askOwner: asksOf(doc).has(op.ask.id) ? str(asksOf(doc).get(op.ask.id)?.get('owner')) ?? null : null }
  }
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
        const { id: _id, relay, shape, connectors, ...fields } = op.panel
        for (const [k, v] of Object.entries(fields)) fm.set(k, v)
        // M343. Flat fields, so each is its own last-writer-wins register.
        if (relay !== undefined) { fm.set('relaySession', relay.session); fm.set('relayProgram', relay.program) }
        // M392. As the doc's JSON strings (the header). diffLocal leaves a
        // value past its cap out of the op, and says so; this never writes one.
        const sj = shape === undefined ? undefined : shapeJson(shape)
        if (sj !== undefined && sj.length <= SHARED_SHAPE_MAX) fm.set('shape', sj)
        const cj = connectors === undefined || connectors.length === 0 ? undefined : connectorsJson(connectors)
        if (cj !== undefined && cj.length <= SHARED_CONNECTORS_MAX) fm.set('connectors', cj)
        panels.set(op.panel.id, fm)
        return
      }
      case 'panel-content': {
        const fm = panels.get(op.panelId)
        if (fm === undefined || isTombstone(fm)) return
        if (op.value === null) { if (fm.has(op.field)) fm.delete(op.field); return }
        if (op.value.length <= CONTENT_CAP[op.field]) setIf(fm, op.field, op.value)
        return
      }
      case 'relay-bind': {
        const fm = panels.get(op.panelId)
        if (fm === undefined || isTombstone(fm)) return
        if (op.relay === null) { fm.delete('relaySession'); fm.delete('relayProgram'); return }
        setIf(fm, 'relaySession', op.relay.session)
        setIf(fm, 'relayProgram', op.relay.program)
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
      case 'ask-open': {
        const asks = asksOf(doc)
        if (asks.has(op.ask.id)) return
        const fm = new Y.Map<unknown>()
        const { id: _id, spentUsd, ...fields } = op.ask
        for (const [k, v] of Object.entries(fields)) fm.set(k, v)
        if (spentUsd !== undefined) fm.set('spentUsd', spentUsd)
        asks.set(op.ask.id, fm)
        return
      }
      // Written once: a second answer from the same person, or any answer
      // after the ask closed, is the server's to refuse and never ours to make.
      case 'ask-answer': {
        const fm = asksOf(doc).get(op.askId)
        if (fm === undefined || fm.has('closed') || fm.has(ANSWER_PREFIX + op.by)) return
        fm.set(ANSWER_PREFIX + op.by, op.answer)
        return
      }
      case 'ask-close': {
        const fm = asksOf(doc).get(op.askId)
        if (fm !== undefined && !fm.has('closed')) fm.set('closed', op.outcome)
        return
      }
      default:
        return
    }
  }, origin)
}

// M392 adds `shape` and `connectors` — judged by contentProblem, so every
// OTHER field a panel's map gains is still refused by name.
const PANEL_FIELDS = new Set(['kind', 'title', 'owner', 'host', 'x', 'y', 'w', 'h', 'z', 'relaySession', 'relayProgram', 'shape', 'connectors'])
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
  const panels = panelsOf(copy), groups = groupsOf(copy), files = filesOf(copy), asks = asksOf(copy), team = copy.getMap(TEAM_DOC_MAP)
  const before = (key: string): Omit<OpContext, 'userId'> => {
    const fm = panels.get(key)
    if (fm === undefined) return { panelOwner: null }
    if (isTombstone(fm)) return { panelOwner: null, panelDeleted: true }
    return { panelOwner: str(fm.get('owner')) ?? null }
  }
  const existed = { panels: new Set(panels.keys()), groups: new Set(groups.keys()), files: new Set(files.keys()), asks: new Set(asks.keys()) }
  // M375. Each ask's owner and the fields it held BEFORE the update: an
  // answer or a close is judged against the ask as it stood, and a field that
  // already existed is being rewritten (refused), never written.
  const askBefore = new Map<string, { owner: string | null; fields: Set<string> }>()
  asks.forEach((fm, key) => { askBefore.set(key, { owner: str(fm.get('owner')) ?? null, fields: new Set(fm.keys()) }) })
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
          // M392. A panel created WITH its content is judged as its create
          // (the creator is its owner); the content's envelope still is.
          const bad = (['shape', 'connectors'] as const).find((f) => contentProblem(f, fm?.get(f), p.kind) !== null)
          if (bad !== undefined) { unknown(`panel ${key}.${bad} ${contentProblem(bad, fm?.get(bad), p.kind) ?? ''}`); continue }
          out.push({ op: { kind: 'create', panel: p }, ctx: { panelOwner: null } })
        }
      } else if (parent === panels && item !== null && typeof item.parentSub === 'string') {
        const key = item.parentSub
        const fm = changed as unknown as Y.Map<unknown>
        const fields: Partial<Record<'x' | 'y' | 'w' | 'h' | 'z', number>> = {}
        let relayTouched = false
        for (const k of keys) {
          if (k === null) { unknown(`panel ${key} changed as a list`); continue }
          if (k === 'relaySession' || k === 'relayProgram') { relayTouched = true; continue }
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
          } else if (k === 'shape' || k === 'connectors') {
            // M392. The owner's content; contentProblem says what the gate judges and why not more.
            const why = contentProblem(k, v, str(fm.get('kind')) ?? '')
            if (why !== null) unknown(`panel ${key}.${k} ${why}`)
            else out.push({ op: { kind: 'panel-content', panelId: key, field: k, value: typeof v === 'string' ? v : null }, ctx: ctxOf(key) })
          } else unknown(`panel ${key}.${k} rewritten`)
        }
        if (Object.keys(fields).length > 0) out.push({ op: { kind: 'rect', panelId: key, fields }, ctx: ctxOf(key) })
        // M343. The pair is judged as it stands AFTER the change: both fields
        // well-formed on a relay panel, or both gone — never half, never on a
        // panel of another kind.
        if (relayTouched) {
          const relay = relayOf(fm, str(fm.get('kind')) ?? '')
          if (relay === undefined) unknown(`panel ${key} relay session malformed`)
          else out.push({ op: { kind: 'relay-bind', panelId: key, relay }, ctx: ctxOf(key) })
        }
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
      } else if (type === asks) {
        for (const key of keys) {
          if (key === null) { unknown('canvas:asks changed as a list'); continue }
          if (existed.asks.has(key)) { unknown(`ask ${key} replaced or removed`); continue }
          const fm = asks.get(key)
          const a = askOf(key, fm)
          if (a === undefined || [...(fm?.keys() ?? [])].some((k) => !ASK_FIELDS.has(k))) { unknown(`ask ${key} created malformed`); continue }
          out.push({ op: { kind: 'ask-open', ask: a }, ctx: { ...ctxOf(a.panel), askOwner: null } })
        }
      } else if (parent === asks && item !== null && typeof item.parentSub === 'string') {
        const key = item.parentSub
        // An ask created by this same update is judged as its ask-open.
        const was = askBefore.get(key)
        if (was === undefined) continue
        const fm = changed as unknown as Y.Map<unknown>
        const ctx = { panelOwner: null, askOwner: was.owner, askClosed: was.fields.has('closed') }
        for (const k of keys) {
          if (k === null) { unknown(`ask ${key} changed as a list`); continue }
          if (was.fields.has(k)) { unknown(`ask ${key}.${k} rewritten`); continue }
          const v = fm.get(k)
          if (k.startsWith(ANSWER_PREFIX) && isAnswer(v)) out.push({ op: { kind: 'ask-answer', askId: key, by: k.slice(ANSWER_PREFIX.length), answer: v }, ctx })
          else if (k === 'closed' && isOutcome(v)) out.push({ op: { kind: 'ask-close', askId: key, outcome: v }, ctx })
          else unknown(`ask ${key}.${k} is not an answer or an outcome`)
        }
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
export interface LocalPanelLike {
  id: string; kind?: string; title?: string; x: number; y: number; w: number; h: number; z: number; relay?: SharedRelay
  /** M392. A shape panel's record, as the layout holds it (unscrubbed). */
  shape?: ShapeRecord
  /** M392. The panel's arrows, targets as LOCAL ids (the layout's own). */
  connectors?: readonly Connector[]
}

/** A title as the doc holds it: the scrubbed title, capped. */
const TITLE_MAX = 120

/** M392. A local panel's diagram content, ready for the doc (wireContent). */
interface WireContent {
  /** A shape's shared title: its label's summary. Absent for any other kind. */
  title?: string
  shape?: ShapeRecord
  shapeJson?: string
  connectors?: Connector[]
  connectorsJson?: string
  /** A field left out because it is past its cap — not written, so the doc keeps the last value that fit. */
  over: PanelContentField[]
}

/**
 * M392. A local panel's diagram content as it LEAVES this machine: a shape's
 * words and every arrow's label passed through `scrub` here (the title's
 * rule — what a teammate's machine receives is already scrubbed), each
 * arrow's target turned into its doc key, and each field as the doc's JSON.
 * An arrow to anything that is not one of this machine's panels is left out:
 * the layout never holds one (its load prunes dangling targets), and the doc
 * would drop it on read anyway.
 */
function wireContent(p: LocalPanelLike, host: string, isLocal: (id: string) => boolean, scrub: (text: string) => string): WireContent {
  const out: WireContent = { over: [] }
  if (p.kind === 'shape' && p.shape !== undefined) {
    const s = p.shape
    const shape: ShapeRecord = {
      form: s.form, text: scrub(s.text),
      ...(s.fill === undefined ? {} : { fill: s.fill }), ...(s.stroke === undefined ? {} : { stroke: s.stroke }), ...(s.ink === undefined ? {} : { ink: s.ink })
    }
    // Summarised AFTER the scrub: a secret cut short by the summary's length
    // would no longer match its own pattern, and would leave whole.
    out.title = shapeSummary(shape.text, shape.form).slice(0, TITLE_MAX)
    const json = shapeJson(shape)
    if (json.length <= SHARED_SHAPE_MAX) { out.shape = shape; out.shapeJson = json } else out.over.push('shape')
  }
  const list: Connector[] = []
  for (const c of p.connectors ?? []) {
    if (!isLocal(c.to)) continue
    list.push({ ...c, to: docKey(host, c.to), ...(c.label === undefined ? {} : { label: scrub(c.label) }) })
  }
  if (list.length > 0) {
    const json = connectorsJson(list)
    if (json.length <= SHARED_CONNECTORS_MAX) { out.connectors = list; out.connectorsJson = json } else out.over.push('connectors')
  }
  return out
}
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
 * Every word that leaves this machine — `title`, and (M392) a shape's label
 * and an arrow's — is passed through `scrub` here, where it leaves. `warn`
 * hears about a content field left out for being past its cap (main logs it).
 */
export function diffLocal(
  doc: Y.Doc,
  local: { panels: LocalPanelLike[]; groups: LocalGroupLike[] },
  me: { userId: string; host: string },
  stale: (key: string) => boolean,
  scrub: (text: string) => string,
  warn?: (message: string) => void
): CanvasOp[] {
  const ops: CanvasOp[] = []
  const panels = panelsOf(doc)
  const groups = groupsOf(doc)
  const localKeys = new Set<string>()
  // Translated by what is KNOWN, never by the shape of the id: ID_PATTERN
  // allows `_`, so an imported local id could look like a doc key.
  const localPanelIds = new Set(local.panels.map((p) => p.id))
  for (const p of local.panels) {
    const key = docKey(me.host, p.id)
    localKeys.add(key)
    const fm = panels.get(key)
    const content = wireContent(p, me.host, (id) => localPanelIds.has(id), scrub)
    for (const f of content.over) {
      warn?.(`panel ${key}: its ${f === 'shape' ? 'shape record is' : 'arrows are'} past the shared cap of ${f === 'shape' ? SHARED_SHAPE_MAX : SHARED_CONNECTORS_MAX} characters — not written; teammates keep the last version that fit`)
    }
    const title = content.title ?? scrub(p.title ?? '').slice(0, TITLE_MAX)
    if (fm === undefined) {
      ops.push({ kind: 'create', panel: {
        id: key, kind: p.kind ?? 'terminal', title, owner: me.userId, host: me.host, x: p.x, y: p.y, w: p.w, h: p.h, z: p.z,
        ...(p.relay === undefined ? {} : { relay: p.relay }),
        ...(content.shape === undefined ? {} : { shape: content.shape }),
        ...(content.connectors === undefined ? {} : { connectors: content.connectors })
      } })
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
    // M343. The relay minted the session after the panel was shared (or it ended).
    if (p.kind === 'relay' && (fm.get('relaySession') !== p.relay?.session || fm.get('relayProgram') !== p.relay?.program)) {
      ops.push({ kind: 'relay-bind', panelId: key, relay: p.relay ?? null })
    }
    // M392. The diagram's content, the title's way: only what differs, never
    // a field a peer changed that the renderer has not acked, and never a
    // value past its cap (left out above, so the doc keeps the last that fit).
    const want: Record<PanelContentField, string | null> = { shape: content.shapeJson ?? null, connectors: content.connectorsJson ?? null }
    for (const f of ['shape', 'connectors'] as const) {
      if (content.over.includes(f) || (fm.get(f) ?? null) === want[f] || stale(`p:${key}:${f}`)) continue
      ops.push({ kind: 'panel-content', panelId: key, field: f, value: want[f] })
    }
  }
  // Ours in the doc, gone from the layout: closed here.
  panels.forEach((fm, key) => {
    if (localKeys.has(key) || isTombstone(fm) || localIdOf(me.host, key) === null) return
    ops.push({ kind: 'delete', panelId: key })
  })

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
    // The label is scrubbed like a title (the boundary critic's finding 3): a
    // group's name is words a teammate's machine receives, and since M391 an
    // imported Mermaid subgraph names one — text a person did not type here.
    // The doc holds the scrubbed form, so comparing against it does not churn.
    const want: SharedGroup = { id: key, label: scrub(g.label), colour: g.colour, panelIds: g.panelIds.map(panelToDoc), ...(g.collapsed === true ? { collapsed: true } : {}) }
    const have = groupOf(key, fm)
    if (have === undefined || JSON.stringify(have) !== JSON.stringify(want)) ops.push({ kind: 'group-set', group: want })
  }
  groups.forEach((fm, key) => {
    if (localGroups.has(key) || isTombstone(fm) || stale(`g:${key}`)) return
    ops.push({ kind: 'group-delete', groupId: key })
  })
  return ops
}

/**
 * M392. Doc panel → the renderer's placeholder: an arrow's target that is one
 * of OUR panels loses its prefix (the renderer knows it by its local id), and
 * everyone else's keeps it — which is that placeholder's id there — the rule
 * groupToLocal applies to a group's members.
 */
export function panelToLocal(host: string, p: SharedPanel): SharedPanel {
  if (p.connectors === undefined) return p
  return { ...p, connectors: p.connectors.map((c) => ({ ...c, to: localIdOf(host, c.to) ?? c.to })) }
}

/** Doc group → the renderer's group: our own ids lose their prefix, everyone else's keep theirs. */
export function groupToLocal(host: string, g: SharedGroup): SharedGroup {
  const loc = (key: string): string => localIdOf(host, key) ?? key
  return { ...g, id: loc(g.id), panelIds: g.panelIds.map(loc) }
}
