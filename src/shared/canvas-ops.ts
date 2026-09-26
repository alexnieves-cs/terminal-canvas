/**
 * The shared canvas's operations and who may perform them. Pure, and free of
 * yjs on purpose: the renderer imports this to decide whether a gesture may
 * START (a viewer's drag never lifts the panel), main imports it to gate every
 * write it makes into the workspace Y.Doc, and the collab server imports it to
 * gate every update a client sends. ONE table, three enforcers — a rule
 * written twice is a rule that drifts, and the server's copy is the one that
 * cannot be bypassed by a modified client.
 *
 * The doc-side half (reading a Y.Doc, turning a raw update back into these
 * ops) is canvas-doc.ts, which main and the server import and the renderer
 * never does.
 */

/**
 * A person's role in ONE shared workspace (supabase workspace_members), not
 * their org role: an org admin may be a viewer of someone's canvas.
 */
export type WorkspaceRole = 'owner' | 'editor' | 'viewer'
export const WORKSPACE_ROLES: readonly WorkspaceRole[] = ['owner', 'editor', 'viewer']
export const parseWorkspaceRole = (v: unknown): WorkspaceRole | undefined =>
  typeof v === 'string' && (WORKSPACE_ROLES as readonly string[]).includes(v) ? v as WorkspaceRole : undefined

/** The four geometry fields, each its own key so two people's concurrent move and resize both survive. */
export const RECT_FIELDS = ['x', 'y', 'w', 'h'] as const
export type RectField = (typeof RECT_FIELDS)[number]

/**
 * One panel as the shared doc records it: geometry, the words a placeholder
 * shows, and whose it is. Everything else about a panel — command, cwd,
 * transcript — stays on the machine that runs it; a placeholder elsewhere is
 * inert (CLAUDE.md: what arrives from outside is inert until a person looks).
 */
export interface SharedPanel {
  id: string
  kind: string
  title: string
  /** The Supabase user id who created it — the colour, and the delete right. */
  owner: string
  /** The install that runs it. Not the user: one person on two Macs sees their other Mac's panels as placeholders. */
  host: string
  x: number
  y: number
  w: number
  h: number
  z: number
  /**
   * M343. A relay panel's session on the team relay, so a teammate's
   * placeholder can offer Attach. Only the id and the program's NAME cross:
   * an id grants nothing — the relay admits an attach by the share's role,
   * checked on its own side against the person's token.
   */
  relay?: SharedRelay
}

/** M343. A relay session as the shared doc carries it (`relaySession` / `relayProgram` fields). */
export interface SharedRelay { session: string; program: string }

export interface SharedGroup {
  id: string
  label: string
  colour: string
  panelIds: string[]
  collapsed?: boolean
}

export type CanvasOp =
  /** A move or resize: only the fields that changed. */
  | { kind: 'rect'; panelId: string; fields: Partial<Record<RectField | 'z', number>> }
  | { kind: 'create'; panel: SharedPanel }
  | { kind: 'retitle'; panelId: string; title: string }
  /** A TOMBSTONE, never a map delete — see canvas-doc.ts's header. */
  | { kind: 'delete'; panelId: string }
  | { kind: 'group-set'; group: SharedGroup }
  | { kind: 'group-delete'; groupId: string }
  /** M343. A relay panel's session bound (or unbound, null) after the panel was created: the relay minted it later. */
  | { kind: 'relay-bind'; panelId: string; relay: SharedRelay | null }
  /**
   * A shared file's text appearing in `canvas:files` (canvas-doc.ts), keyed by
   * its file panel's doc key. Written only by the machine that runs the panel
   * — it seeds the text from its own draft — so only the panel's owner.
   */
  | { kind: 'file-create'; fileKey: string }
  /** Any insert or delete in an existing shared file's Y.Text. */
  | { kind: 'text-edit'; fileKey: string }
  /** Server-side only: the Team view's snapshot key in the `team` map. */
  | { kind: 'team-snapshot'; key: string }
  /** Server-side only: anything an update does that none of the above names. Always refused. */
  | { kind: 'unknown'; detail: string }

export interface OpContext {
  /** Who is acting. */
  userId: string
  /** The target panel's owner as the doc stood BEFORE this op, or null when it names no live panel. */
  panelOwner: string | null
  /** The target panel is already a tombstone. */
  panelDeleted?: boolean
  /** For file-create / text-edit: the file's Y.Text already existed before this op. */
  fileExists?: boolean
}

export type Verdict = { ok: true } | { ok: false; reason: string }

const refuse = (reason: string): Verdict => ({ ok: false, reason })
const OK: Verdict = { ok: true }

/**
 * The role table. `null` role is a doc with no share row — the legacy
 * `tc:workspace:<local id>` presence room — where only a person's OWN Team
 * view snapshot may be written and the canvas maps are nobody's.
 *
 *              rect  create  retitle  delete        groups  own snapshot
 *   owner       yes   yes     own      any           yes     yes
 *   editor      yes   yes     own      own           yes     yes
 *   viewer      -     -       -        -             -       -
 *   (no share)  -     -       -        -             -       yes
 *
 *              file-create   text-edit   relay-bind
 *   owner       own panel     yes         own panel
 *   editor      own panel     yes         own panel
 *   viewer      -             -           -
 *   (no share)  -             -           -
 *
 * Moving someone else's panel is allowed to an editor: arranging the shared
 * canvas IS the point of editing it. Deleting it is not — a tombstone is
 * permanent for everyone — and retitling it is not, because the title is
 * written by the machine that runs the panel and a second author would fight
 * it on every save.
 */
export function authorizeCanvasOp(role: WorkspaceRole | null, op: CanvasOp, ctx: OpContext): Verdict {
  if (op.kind === 'unknown') return refuse(`unrecognised change: ${op.detail}`)
  if (op.kind === 'team-snapshot') {
    return op.key === `snapshot:${ctx.userId}` ? OK : refuse('a Team view snapshot may only be written by the person it shows')
  }
  if (role === null) return refuse('this workspace is not shared — its canvas is not written to the room')
  if (role === 'viewer') return refuse('you are a viewer of this workspace')
  switch (op.kind) {
    case 'rect':
      if (ctx.panelOwner === null) return refuse(`panel ${op.panelId} is not on the shared canvas`)
      return OK
    case 'create':
      if (op.panel.owner !== ctx.userId) return refuse('a panel is created in its creator\'s name only')
      if (ctx.panelOwner !== null || ctx.panelDeleted === true) return refuse(`panel ${op.panel.id} already exists`)
      return OK
    case 'retitle':
      if (ctx.panelOwner === null) return refuse(`panel ${op.panelId} is not on the shared canvas`)
      return ctx.panelOwner === ctx.userId ? OK : refuse('only the person whose panel it is renames it')
    case 'delete':
      if (ctx.panelOwner === null) return ctx.panelDeleted === true ? OK : refuse(`panel ${op.panelId} is not on the shared canvas`)
      if (role === 'owner' || ctx.panelOwner === ctx.userId) return OK
      return refuse('an editor removes only their own panels — ask the workspace owner')
    case 'group-set':
    case 'group-delete':
      return OK
    // A file's text is seeded by the machine that has the file, so creating
    // it is the panel owner's; typing into it is anyone who may edit the
    // canvas. The file on DISK stays the owner's alone: a peer's edit lands
    // in the owner's draft as unsaved text, and only the owner saves it
    // (CLAUDE.md: what arrives from outside is inert until a person looks).
    case 'file-create':
      if (ctx.panelOwner === null) return refuse(`panel ${op.fileKey} is not on the shared canvas`)
      if (ctx.panelOwner !== ctx.userId) return refuse('a file is shared by the person whose panel it is')
      if (ctx.fileExists === true) return refuse(`file ${op.fileKey} is already shared`)
      return OK
    case 'text-edit':
      if (ctx.panelOwner === null) return refuse(`panel ${op.fileKey} is not on the shared canvas`)
      if (ctx.fileExists !== true) return refuse(`file ${op.fileKey} is not shared`)
      return OK
    // M343. The session is minted by the relay for the machine that runs the
    // panel, so only that panel's owner names it — a second author could
    // point everyone's Attach at a session of their choosing.
    case 'relay-bind':
      if (ctx.panelOwner === null) return refuse(`panel ${op.panelId} is not on the shared canvas`)
      return ctx.panelOwner === ctx.userId ? OK : refuse('a relay session is bound by the person whose panel it is')
  }
}

/**
 * The doc's root map of shared file texts (canvas-doc.ts). Declared here, not
 * there, because the renderer's replica needs the name and must not import
 * canvas-doc.
 */
export const CANVAS_FILES = 'canvas:files'

/** A shared file's text, in UTF-16 code units — past this an update is refused (canvas-doc.ts inspectUpdate). */
export const SHARED_TEXT_MAX = 1_000_000

/** `text:open`'s answer: this install's host id (a local panel's file key is `<host>_<panelId>`), the doc's state, and the role. Null when the workspace has no bound shared doc. */
export interface SharedTextOpen { host: string; state: Uint8Array; role: WorkspaceRole | null }

/**
 * `text:remote`: a doc update the renderer's replica has not seen, or `reset`
 * — the room closed or reopened, so the replica is discarded and re-opened.
 */
export type SharedTextPush =
  | { workspaceId: string; kind: 'update'; update: Uint8Array }
  | { workspaceId: string; kind: 'reset' }

/** Whether a role may start a move/resize gesture at all — the renderer's early answer, before any op exists. */
export const canArrange = (role: WorkspaceRole | null): boolean => role === 'owner' || role === 'editor'

/**
 * What main pushes to the renderer for the ACTIVE workspace while it is shared
 * (`canvas:shared`). `seq` counts remote changes; the renderer echoes the last
 * one it applied on every layout:save (`sharedAck`), which is how main tells a
 * stale save from a local edit.
 */
export interface CanvasSharedView {
  shareId: string
  role: WorkspaceRole | null
  seq: number
  /** Doc geometry for panels hosted HERE whose rect a peer changed since the renderer's ack. */
  rects: Array<{ id: string; x: number; y: number; w: number; h: number; z: number }>
  /** Live panels hosted elsewhere — drawn as inert placeholders. */
  placeholders: SharedPanel[]
  /** The placeholders whose file text is shared (canvas:files): their draft opens here, bound live. */
  files: string[]
  /** Present when a peer changed the groups since the renderer's ack: the whole live list, to replace the local one. */
  groups?: SharedGroup[]
}

/** layout:save's second argument while shared. */
export interface SharedSaveMeta { sharedAck: number }

const ID = /^[A-Za-z0-9_-]{1,128}$/

/**
 * `canvas:op`'s body. The renderer may send only the two gesture ops — a
 * rect and a placeholder's removal; everything else reaches the doc through
 * layout:save's diff, where main builds the op itself. Undefined refuses.
 */
export function parseRendererOp(raw: unknown): Extract<CanvasOp, { kind: 'rect' | 'delete' }> | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const r = raw as Record<string, unknown>
  const panelId = r['panelId']
  if (typeof panelId !== 'string' || !ID.test(panelId)) return undefined
  if (r['kind'] === 'delete') return { kind: 'delete', panelId }
  if (r['kind'] !== 'rect' || typeof r['fields'] !== 'object' || r['fields'] === null) return undefined
  const fields: Partial<Record<RectField | 'z', number>> = {}
  for (const [k, v] of Object.entries(r['fields'] as Record<string, unknown>)) {
    if (!((RECT_FIELDS as readonly string[]).includes(k) || k === 'z')) return undefined
    if (typeof v !== 'number' || !Number.isFinite(v)) return undefined
    fields[k as RectField] = v
  }
  return Object.keys(fields).length === 0 ? undefined : { kind: 'rect', panelId, fields }
}
