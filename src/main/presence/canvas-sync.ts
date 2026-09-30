/**
 * The shared canvas's binding between a workspace's Y.Doc (the presence room's
 * doc, presence-hub.ts) and the two things main already owns: the LAYOUT STORE,
 * which stays the one persistence choke point, and the renderer's view.
 *
 * Three directions, one rule each:
 *
 *   renderer gesture → op()       A move or resize, written through as it
 *                                 happens (usePanelDrag's write-through), after
 *                                 authorizeCanvasOp. The renderer already moved
 *                                 the panel; a refusal snaps it back.
 *   layout:save      → saved()    Everything else a person does (spawn, close,
 *                                 tidy, undo, a group) reaches main only as a
 *                                 whole CanvasState. diffLocal turns the store's
 *                                 copy into ops, each authorised the same way.
 *   peer update      → observe    Applied to the layout store FIRST (so a closed
 *                                 window or an inactive workspace still keeps
 *                                 it), then pushed to the renderer as a view.
 *
 * The write-back trap, and `seq`/`ack`: a peer's edit lands in the doc before
 * the renderer has applied it, and a layout:save sent in between carries the
 * OLD value. Every remote field change is stamped with a rising seq; every
 * save carries the last seq the renderer applied (`sharedAck`); a field whose
 * remote seq is ahead of the ack is skipped by diffLocal. Without it, the
 * renderer's lag would undo every peer's move roughly one frame in three.
 *
 * The doc's own bytes are stored IN the layout store too (Workspace.crdt), in
 * the same file and the same atomic write as the panels they describe — so
 * the doc can never be older than the layout it was diffed against, and on the
 * next launch the doc is the truth for geometry and groups.
 *
 * SHARED TEXT (text:open / text:update / text:remote) is the one place the
 * renderer holds yjs: y-monaco binds a Monaco model to a Y.Text, and that Y.Text
 * has to live in a doc in the renderer's process. So the renderer keeps a
 * REPLICA of the workspace doc — only while a shared editor is open — and main
 * stays the authority for it exactly as the server is for main: every update
 * the replica sends is read back through inspectUpdate and each op through
 * authorizeCanvasOp before it is applied, and anything but file-create /
 * text-edit is refused (a replica does not get a second road to the canvas
 * maps that canvas:op and layout:save already gate). Every doc update not from
 * the renderer is forwarded to it — ALL of them, not just the text's: Yjs holds
 * an update back until it has every earlier clock from the same client, and
 * main's client writes panel geometry and text on one clock.
 *
 * No electron, no socket: verify:canvas-sync drives two of these over a relay.
 */
import * as Y from 'yjs'
import { redactSecrets } from '../../shared/redact'
import {
  applyCanvasOp, diffLocal, docKey, groupToLocal, inspectUpdate, localIdOf, opContext, panelToLocal, readSharedAsks, readSharedGroups, readSharedPanels,
  CANVAS_FILES, CANVAS_GROUPS, CANVAS_PANELS, type LocalGroupLike, type LocalPanelLike
} from '../../shared/canvas-doc'
import {
  authorizeCanvasOp, CANVAS_ASKS, RECT_FIELDS,
  type CanvasOp, type CanvasSharedView, type SharedGroup, type SharedTextOpen, type SharedTextPush, type Verdict, type WorkspaceRole
} from '../../shared/canvas-ops'
import { teammateAskRows, type TeamAskRow } from '../../shared/team-asks'

export interface WorkspaceShareRecord { id: string; orgId: string; role: WorkspaceRole }

export interface CanvasSyncDeps {
  /** This install's id (HOST_PATTERN) — the prefix on every doc key minted here. */
  host: () => string
  /** The signed-in person, or null — then nothing is written. */
  userId: () => string | null
  share: (workspaceId: string) => WorkspaceShareRecord | undefined
  activeWorkspaceId: () => string
  /** The store's copy of one workspace's panels and groups. */
  local: (workspaceId: string) => { panels: LocalPanelLike[]; groups: LocalGroupLike[] } | null
  loadState: (workspaceId: string) => Uint8Array | null
  saveState: (workspaceId: string, state: Uint8Array) => void
  /** Peer geometry for panels hosted HERE, and (when present) the whole group list, into the store. */
  applyToStore: (workspaceId: string, change: { rects: Array<{ id: string; x: number; y: number; w: number; h: number; z: number }>; groups?: SharedGroup[] }) => void
  /** The active workspace's view, or null when it is not shared. */
  emit: (view: CanvasSharedView | null) => void
  /** Supabase's answer for this person's role now; null keeps the cached one. */
  refreshRole?: (shareId: string) => Promise<WorkspaceRole | null>
  setRole?: (workspaceId: string, role: WorkspaceRole) => void
  /** text:remote — to the renderer's replica of a workspace it has open (see the header). */
  emitText?: (push: SharedTextPush) => void
  /** M376. A workspace's team asks changed by anything but this machine's own write (a peer's answer, the doc loaded). */
  onAsks?: (workspaceId: string) => void
  /** M392. Main's log, for a content field left unwritten (past its cap). Default console.warn. */
  log?: (message: string) => void
}

export interface CanvasSync {
  /** presence-hub's `bindCanvas`: a room just opened for this workspace. Returns the unbind. */
  bind(workspaceId: string, doc: Y.Doc): () => void
  /** A renderer write-through op for the ACTIVE workspace. Ids are the renderer's: local ids, or a placeholder's doc key. */
  op(op: CanvasOp): Verdict
  /** After layout:save stored the active workspace: diff it into the doc. */
  saved(sharedAck: number | undefined): void
  /** The active workspace's view now — for a renderer that just loaded. */
  view(): CanvasSharedView | null
  /** The active workspace changed (or its share did): push the new view. */
  activated(): void
  /** The renderer opens a replica of a shared workspace's doc: its state now, then every update by emitText. Null when unbound or unshared. */
  textOpen(workspaceId: string): SharedTextOpen | null
  /** The renderer's last shared editor on that workspace closed. */
  textClose(workspaceId: string): void
  /** An update from the renderer's replica, gated like the server gates ours. A refusal means the replica has diverged and must re-open. */
  textUpdate(workspaceId: string, update: Uint8Array): Verdict
  /** M376. The shared workspace whose bound doc holds this LOCAL panel, or null. */
  workspaceOfPanel(panelId: string): string | null
  /** M376. A bound workspace's team asks as its doc stands now, or null when it is not bound and shared. */
  asks(workspaceId: string): ReturnType<typeof readSharedAsks> | null
  /** M376. One team-ask op, as this person, through the same authorisation as every write. */
  writeAsk(workspaceId: string, op: Extract<CanvasOp, { kind: 'ask-open' | 'ask-answer' | 'ask-close' }>): Verdict
  /**
   * M377. What this person's Needs you lists from the team: every bound shared
   * workspace they may EDIT (a viewer cannot answer, so nothing is asked of
   * them), each open ask of someone else's they have not answered.
   */
  teammateAsks(nameOf: (workspaceId: string, userId: string) => string | null): TeamAskRow[]
}

/** Writes this machine made — everything else observed on the doc is a peer's. */
export const LOCAL_ORIGIN = Symbol('canvas-sync:local')
const PERSIST_ORIGIN = Symbol('canvas-sync:persisted')
/** Writes the renderer's replica made — applied here, and never echoed back to it. */
export const RENDERER_ORIGIN = Symbol('canvas-sync:renderer')

interface Binding {
  workspaceId: string
  doc: Y.Doc
  seq: number
  /** The last seq the renderer said it applied. Meaningful for the active workspace only. */
  ack: number
  /** `p:<key>:<field>` / `g:<key>` → the seq of the last PEER change to it. */
  remoteSeq: Map<string, number>
  /** Here-hosted panels a peer moved (or a refusal must snap back), by doc key → seq. */
  pendingRects: Map<string, number>
  groupsSeq: number
  emitQueued: boolean
  off: () => void
}

export function createCanvasSync(deps: CanvasSyncDeps): CanvasSync {
  const bindings = new Map<string, Binding>()
  /** Workspaces whose doc the renderer holds a replica of. Survives a rebind: the renderer is told `reset` and re-opens. */
  const textOpen = new Set<string>()

  // A title leaves this machine here, so it is scrubbed here (the outward
  // gate's scrubber, verify:verbs gate.2) — and so, since M392, do a shape's
  // label and an arrow's, through this same one door (diffLocal caps the
  // title itself). Memoised: saved() runs on every layout:save — sixty a
  // second during a drag — and diffs every panel's words each time, while
  // the words themselves almost never change.
  const scrubbed = new Map<string, string>()
  const scrub = (text: string): string => {
    const hit = scrubbed.get(text)
    if (hit !== undefined) return hit
    if (scrubbed.size >= 2000) scrubbed.clear()
    const out = redactSecrets(text).text
    scrubbed.set(text, out)
    return out
  }
  // M392. A content field past its cap is not written, and said once in
  // main's log — not sixty times a second while a drag re-diffs the panel.
  const warned = new Set<string>()
  const warn = (message: string): void => {
    if (warned.has(message)) return
    if (warned.size >= 200) warned.clear()
    warned.add(message)
    if (deps.log !== undefined) deps.log(`[canvas-sync] ${message}`)
    else console.warn(`[canvas-sync] ${message}`)
  }

  const viewOf = (b: Binding): CanvasSharedView | null => {
    const share = deps.share(b.workspaceId)
    if (share === undefined) return null
    const host = deps.host()
    const { live } = readSharedPanels(b.doc)
    const byKey = new Map(live.map((p) => [p.id, p]))
    const rects: CanvasSharedView['rects'] = []
    for (const [key, seq] of b.pendingRects) {
      if (seq <= b.ack) continue
      const p = byKey.get(key)
      const id = localIdOf(host, key)
      if (p !== undefined && id !== null) rects.push({ id, x: p.x, y: p.y, w: p.w, h: p.h, z: p.z })
    }
    return {
      shareId: share.id,
      role: share.role,
      seq: b.seq,
      rects,
      // M392. With each placeholder's arrows aimed at the renderer's own ids.
      placeholders: live.filter((p) => p.host !== host).map((p) => panelToLocal(host, p)),
      files: [...b.doc.getMap(CANVAS_FILES).keys()].filter((k) => localIdOf(host, k) === null && byKey.has(k)),
      ...(b.groupsSeq > b.ack ? { groups: readSharedGroups(b.doc).map((g) => groupToLocal(host, g)) } : {})
    }
  }

  const emitSoon = (b: Binding): void => {
    if (b.emitQueued) return
    b.emitQueued = true
    // One view per burst: a Hocuspocus message can carry a whole drag's worth
    // of field changes, and each would otherwise be its own IPC push.
    queueMicrotask(() => {
      b.emitQueued = false
      if (bindings.get(b.workspaceId) !== b || deps.activeWorkspaceId() !== b.workspaceId) return
      deps.emit(viewOf(b))
    })
  }

  const persist = (b: Binding): void => { deps.saveState(b.workspaceId, Y.encodeStateAsUpdate(b.doc)) }

  /** Doc → store for the given here-hosted keys (and the groups when asked). */
  const toStore = (b: Binding, keys: Iterable<string>, withGroups: boolean): void => {
    const host = deps.host()
    const { live } = readSharedPanels(b.doc)
    const byKey = new Map(live.map((p) => [p.id, p]))
    const rects: Array<{ id: string; x: number; y: number; w: number; h: number; z: number }> = []
    for (const key of keys) {
      const p = byKey.get(key)
      const id = localIdOf(host, key)
      if (p !== undefined && id !== null) rects.push({ id, x: p.x, y: p.y, w: p.w, h: p.h, z: p.z })
    }
    if (rects.length === 0 && !withGroups) return
    deps.applyToStore(b.workspaceId, { rects, ...(withGroups ? { groups: readSharedGroups(b.doc).map((g) => groupToLocal(host, g)) } : {}) })
  }

  /** Authorise and apply, as this person. A refused rect is queued to snap back. */
  const write = (b: Binding, op: CanvasOp): Verdict => {
    const userId = deps.userId()
    if (userId === null) return { ok: false, reason: 'sign in to edit a shared canvas' }
    const role = deps.share(b.workspaceId)?.role ?? null
    const verdict = authorizeCanvasOp(role, op, opContext(b.doc, op, userId))
    if (!verdict.ok) {
      if (op.kind === 'rect' && localIdOf(deps.host(), op.panelId) !== null) {
        b.pendingRects.set(op.panelId, ++b.seq)
        toStore(b, [op.panelId], false)
        emitSoon(b)
      }
      return verdict
    }
    applyCanvasOp(b.doc, op, LOCAL_ORIGIN)
    return verdict
  }

  const diffInto = (b: Binding, stale: (key: string) => boolean): void => {
    const userId = deps.userId()
    const local = deps.local(b.workspaceId)
    if (userId === null || local === null || deps.share(b.workspaceId) === undefined) return
    for (const op of diffLocal(b.doc, local, { userId, host: deps.host() }, stale, scrub, warn)) write(b, op)
  }

  const onRemote = (b: Binding, events: Array<Y.YEvent<Y.AbstractType<unknown>>>, tr: Y.Transaction): void => {
    if (tr.origin === LOCAL_ORIGIN) return
    const host = deps.host()
    const panels = b.doc.getMap(CANVAS_PANELS)
    const groups = b.doc.getMap(CANVAS_GROUPS)
    const moved = new Set<string>()
    let groupsTouched = false
    for (const e of events) {
      const target = e.target
      if (target === panels) {
        // A panel appeared (or a root key changed): placeholders re-read on emit.
        for (const key of e.keys.keys()) {
          const s = ++b.seq
          for (const f of [...RECT_FIELDS, 'z', 'title', 'shape', 'connectors']) b.remoteSeq.set(`p:${key}:${f}`, s)
          if (localIdOf(host, key) !== null) { b.pendingRects.set(key, s); moved.add(key) }
        }
      } else if (target.parent === panels && target._item !== null && typeof target._item.parentSub === 'string') {
        const key = target._item.parentSub
        for (const field of e.keys.keys()) {
          const s = ++b.seq
          b.remoteSeq.set(`p:${key}:${field}`, s)
          if (localIdOf(host, key) !== null && ((RECT_FIELDS as readonly string[]).includes(field) || field === 'z')) {
            b.pendingRects.set(key, s)
            moved.add(key)
          }
        }
      } else if (target === groups || target.parent === groups) {
        const key = target === groups ? null : target._item?.parentSub
        const s = ++b.seq
        b.groupsSeq = s
        if (typeof key === 'string') b.remoteSeq.set(`g:${key}`, s)
        else for (const k of e.keys.keys()) b.remoteSeq.set(`g:${k}`, s)
        groupsTouched = true
      }
    }
    if (tr.origin !== PERSIST_ORIGIN) persist(b)
    toStore(b, moved, groupsTouched)
    emitSoon(b)
  }

  const activeBinding = (): Binding | undefined => bindings.get(deps.activeWorkspaceId())

  return {
    bind(workspaceId, doc) {
      const b: Binding = {
        workspaceId, doc, seq: 0, ack: 0, remoteSeq: new Map(), pendingRects: new Map(),
        groupsSeq: 0, emitQueued: false, off: () => {}
      }
      bindings.set(workspaceId, b)
      const panels = doc.getMap(CANVAS_PANELS)
      const groups = doc.getMap(CANVAS_GROUPS)
      const onPanels = (events: Array<Y.YEvent<Y.AbstractType<unknown>>>, tr: Y.Transaction): void => { if (bindings.get(workspaceId) === b) onRemote(b, events, tr) }
      panels.observeDeep(onPanels)
      groups.observeDeep(onPanels)
      const files = doc.getMap(CANVAS_FILES)
      const onUpdate = (u: Uint8Array, origin: unknown): void => {
        if (bindings.get(workspaceId) !== b) return
        // Our own writes persist too; a peer's canvas change persists in onRemote.
        if (origin === LOCAL_ORIGIN || origin === RENDERER_ORIGIN) persist(b)
        if (origin !== RENDERER_ORIGIN && textOpen.has(workspaceId)) deps.emitText?.({ workspaceId, kind: 'update', update: u })
      }
      // A peer's typing touches no panel or group, so onRemote never sees it;
      // it persists here, or a relaunch would forget every unsaved shared edit.
      const onFiles = (events: Array<Y.YEvent<Y.AbstractType<unknown>>>, tr: Y.Transaction): void => {
        if (bindings.get(workspaceId) !== b) return
        if (tr.origin !== LOCAL_ORIGIN && tr.origin !== RENDERER_ORIGIN && tr.origin !== PERSIST_ORIGIN) persist(b)
        // A file newly shared: a placeholder's draft door appears (view.files).
        if (events.some((e) => e.target === files)) emitSoon(b)
      }
      // M376. A peer's answer to a team ask touches no panel either: it
      // persists here, and the router is told so it can decide. Our own
      // writes are the router's own; it needs no echo of them.
      const asks = doc.getMap(CANVAS_ASKS)
      const onAsks = (_events: Array<Y.YEvent<Y.AbstractType<unknown>>>, tr: Y.Transaction): void => {
        if (bindings.get(workspaceId) !== b || tr.origin === LOCAL_ORIGIN) return
        if (tr.origin !== PERSIST_ORIGIN && tr.origin !== RENDERER_ORIGIN) persist(b)
        deps.onAsks?.(workspaceId)
      }
      doc.on('update', onUpdate)
      files.observeDeep(onFiles)
      asks.observeDeep(onAsks)
      b.off = () => { panels.unobserveDeep(onPanels); groups.unobserveDeep(onPanels); files.unobserveDeep(onFiles); asks.unobserveDeep(onAsks); doc.off('update', onUpdate) }
      // A replica opened on the doc this one replaces holds the wrong history.
      if (textOpen.has(workspaceId)) deps.emitText?.({ workspaceId, kind: 'reset' })

      if (deps.share(workspaceId) !== undefined) {
        // The doc as last written, in the same file as the layout: on a
        // relaunch it is the truth for geometry and groups (see header).
        // Loaded under PERSIST_ORIGIN, so it lands as remote — marked, stored,
        // and stale to a renderer that has not yet acked it.
        const saved = deps.loadState(workspaceId)
        if (saved !== null) {
          try { Y.applyUpdate(doc, saved, PERSIST_ORIGIN) } catch { /* a corrupt blob: start the doc empty, the layout re-seeds it */ }
        }
        // Then what this machine has that the doc does not — a first share, a
        // panel opened while this was unbound, a panel closed.
        diffInto(b, (key) => (b.remoteSeq.get(key) ?? 0) > b.ack)
        const share = deps.share(workspaceId)
        if (share !== undefined && deps.refreshRole !== undefined) {
          void deps.refreshRole(share.id).then((role) => {
            if (role === null || bindings.get(workspaceId) !== b || deps.share(workspaceId)?.role === role) return
            deps.setRole?.(workspaceId, role)
            emitSoon(b)
          }).catch(() => {})
        }
      }
      emitSoon(b)
      return () => {
        b.off()
        if (bindings.get(workspaceId) === b) bindings.delete(workspaceId)
        if (deps.activeWorkspaceId() === workspaceId) deps.emit(null)
        if (textOpen.has(workspaceId)) deps.emitText?.({ workspaceId, kind: 'reset' })
      }
    },

    workspaceOfPanel(panelId) {
      for (const b of bindings.values()) {
        if (deps.share(b.workspaceId) === undefined) continue
        if ((deps.local(b.workspaceId)?.panels ?? []).some((p) => p.id === panelId)) return b.workspaceId
      }
      return null
    },

    asks(workspaceId) {
      const b = bindings.get(workspaceId)
      return b === undefined || deps.share(workspaceId) === undefined ? null : readSharedAsks(b.doc)
    },

    teammateAsks(nameOf) {
      const me = deps.userId()
      if (me === null) return []
      const out: TeamAskRow[] = []
      for (const b of bindings.values()) {
        const role = deps.share(b.workspaceId)?.role
        if (role !== 'owner' && role !== 'editor') continue
        out.push(...teammateAskRows(b.workspaceId, readSharedAsks(b.doc), readSharedPanels(b.doc).live, me, (u) => nameOf(b.workspaceId, u)))
      }
      return out.sort((a, b) => a.at - b.at)
    },

    writeAsk(workspaceId, op) {
      const b = bindings.get(workspaceId)
      if (b === undefined || deps.share(workspaceId) === undefined) return { ok: false, reason: 'this workspace is not shared' }
      return write(b, op)
    },

    op(op) {
      const b = activeBinding()
      if (b === undefined || deps.share(b.workspaceId) === undefined) return { ok: true }
      const host = deps.host()
      const local = new Set((deps.local(b.workspaceId)?.panels ?? []).map((p) => p.id))
      const key = (id: string): string => (local.has(id) ? docKey(host, id) : id)
      const translated: CanvasOp =
        op.kind === 'rect' ? { ...op, panelId: key(op.panelId) }
          : op.kind === 'delete' || op.kind === 'retitle' ? { ...op, panelId: key(op.panelId) }
            : op
      const verdict = write(b, translated)
      // A placeholder moved here goes nowhere near the store (it is not a
      // local panel), so the renderer is told the doc's answer at once.
      if (verdict.ok && localIdOf(host, 'panelId' in translated ? translated.panelId : '') === null) emitSoon(b)
      return verdict
    },

    saved(sharedAck) {
      const b = activeBinding()
      if (b === undefined) return
      if (sharedAck !== undefined && sharedAck > b.ack) {
        b.ack = Math.min(sharedAck, b.seq)
        for (const [key, seq] of b.pendingRects) if (seq <= b.ack) b.pendingRects.delete(key)
      }
      diffInto(b, (key) => (b.remoteSeq.get(key) ?? 0) > b.ack)
    },

    view() {
      const b = activeBinding()
      return b === undefined ? null : viewOf(b)
    },

    activated() {
      const b = activeBinding()
      if (b === undefined) { deps.emit(null); return }
      // A workspace switch reloads the renderer's canvas from the store, which
      // already holds every peer change (toStore): the new renderer state has
      // seen everything, except groups and placeholders, which ride the view.
      b.ack = b.seq
      b.pendingRects.clear()
      b.groupsSeq = b.seq + 1
      b.seq += 1
      deps.emit(viewOf(b))
    },

    textOpen(workspaceId) {
      const b = bindings.get(workspaceId)
      const share = deps.share(workspaceId)
      if (b === undefined || share === undefined) return null
      textOpen.add(workspaceId)
      return { host: deps.host(), state: Y.encodeStateAsUpdate(b.doc), role: share.role }
    },

    textClose(workspaceId) { textOpen.delete(workspaceId) },

    textUpdate(workspaceId, update) {
      const b = bindings.get(workspaceId)
      if (b === undefined || !textOpen.has(workspaceId)) return { ok: false, reason: 'this workspace has no shared doc open' }
      const userId = deps.userId()
      if (userId === null) return { ok: false, reason: 'sign in to edit a shared file' }
      const role = deps.share(workspaceId)?.role ?? null
      // Any refusal ends this replica: it holds history main does not, and
      // its next update may build on the refused one. It re-opens from here.
      const refuse = (reason: string): Verdict => { textOpen.delete(workspaceId); return { ok: false, reason } }
      let judged: ReturnType<typeof inspectUpdate>
      try {
        // An update that builds on history this doc lacks would apply as
        // PENDING — invisible to inspectUpdate (nothing changes yet) and
        // integrated later, unjudged, when its missing half arrives.
        const have = Y.decodeStateVector(Y.encodeStateVector(b.doc))
        for (const [client, clock] of Y.parseUpdateMeta(update).from) {
          if ((have.get(client) ?? 0) < clock) return refuse('that update builds on history this doc does not have')
        }
        judged = inspectUpdate(b.doc, update)
      } catch { return refuse('not a document update') }
      for (const { op, ctx } of judged) {
        if (op.kind !== 'file-create' && op.kind !== 'text-edit') return refuse('the renderer writes shared text only')
        const verdict = authorizeCanvasOp(role, op, { userId, ...ctx })
        if (!verdict.ok) return refuse(verdict.reason)
      }
      Y.applyUpdate(b.doc, update, RENDERER_ORIGIN)
      return { ok: true }
    }
  }
}
