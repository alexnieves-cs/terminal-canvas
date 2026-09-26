/**
 * The renderer's REPLICA of a shared workspace's Y.Doc — the one place yjs
 * lives in this process, and only while a shared editor is open.
 *
 * Why a replica at all, when main holds the doc (canvas-sync.ts): y-monaco
 * binds a Monaco model to a Y.Text, and a Y.Text is an object in a doc in the
 * SAME process as the model. The alternative — shipping Monaco's edits to main
 * as ops and main's back as deltas — is two unsynchronised copies of a text
 * with no CRDT between them, which is the bug a CRDT exists to remove.
 *
 * Main is still the authority, exactly as the collab server is main's: every
 * update this replica makes goes to main (`text:update`), which reads it back
 * through inspectUpdate and the role table and applies it or refuses it. A
 * refusal means this replica now holds history main does not, so it is
 * DISCARDED and re-opened from main's state — never patched up.
 *
 * Reached only through binding.ts, which CodeEditor `import()`s lazily: yjs
 * and y-monaco ride the shared-text chunk and never the first one.
 */
import * as Y from 'yjs'
import type { SharedTextPush, WorkspaceRole } from '@shared/canvas-ops'

/** Main's pushes and the open state: applied, never sent back. */
const FROM_MAIN = Symbol('shared-text:main')

export interface ReplicaHandle {
  doc: Y.Doc
  /** This install's host id: a local file panel's key is `<host>_<panelId>`. */
  host: string
  role: WorkspaceRole | null
  /** The replica was discarded (room reopened, an update refused): drop every binding on `doc` and acquire again. */
  onReset(listener: () => void): () => void
  release(): void
}

interface Replica {
  workspaceId: string
  doc: Y.Doc
  host: string
  role: WorkspaceRole | null
  refs: number
  resets: Set<() => void>
}

const replicas = new Map<string, Replica>()
const opening = new Map<string, Promise<Replica | null>>()
let subscribed = false

function subscribe(): void {
  if (subscribed) return
  subscribed = true
  window.canvas.sharedText.onRemote((push: SharedTextPush) => {
    const r = replicas.get(push.workspaceId)
    if (r === undefined) return
    if (push.kind === 'reset') { reset(r); return }
    try { Y.applyUpdate(r.doc, push.update, FROM_MAIN) } catch { reset(r) }
  })
}

/** Discard: the bindings are told first (they must let go of `doc`), then the doc goes. */
function reset(r: Replica): void {
  if (replicas.get(r.workspaceId) !== r) return
  replicas.delete(r.workspaceId)
  for (const l of [...r.resets]) l()
  r.doc.destroy()
  void window.canvas.sharedText.close(r.workspaceId).catch(() => {})
}

async function open(workspaceId: string): Promise<Replica | null> {
  subscribe()
  const got = await window.canvas.sharedText.open(workspaceId).catch(() => null)
  if (got === null) return null
  const doc = new Y.Doc()
  const r: Replica = { workspaceId, doc, host: got.host, role: got.role, refs: 0, resets: new Set() }
  Y.applyUpdate(doc, got.state, FROM_MAIN)
  doc.on('update', (update: Uint8Array, origin: unknown) => {
    if (origin === FROM_MAIN || replicas.get(workspaceId) !== r) return
    void window.canvas.sharedText.update(workspaceId, update).then(
      (verdict) => { if (!verdict.ok) reset(r) },
      () => { reset(r) }
    )
  })
  replicas.set(workspaceId, r)
  return r
}

/** A handle on the workspace's replica, opening it on first use; null when the workspace is not shared (or its room is not open). */
export async function acquire(workspaceId: string): Promise<ReplicaHandle | null> {
  let r = replicas.get(workspaceId)
  if (r === undefined) {
    let pending = opening.get(workspaceId)
    if (pending === undefined) {
      pending = open(workspaceId).finally(() => { opening.delete(workspaceId) })
      opening.set(workspaceId, pending)
    }
    r = (await pending) ?? undefined
    if (r === undefined || replicas.get(workspaceId) !== r) return null
  }
  const replica = r
  replica.refs += 1
  let released = false
  const mine = new Set<() => void>()
  return {
    doc: replica.doc,
    host: replica.host,
    role: replica.role,
    onReset(listener) {
      replica.resets.add(listener)
      mine.add(listener)
      return () => { replica.resets.delete(listener); mine.delete(listener) }
    },
    release() {
      if (released) return
      released = true
      for (const l of mine) replica.resets.delete(l)
      replica.refs -= 1
      if (replica.refs > 0 || replicas.get(workspaceId) !== replica) return
      replicas.delete(workspaceId)
      replica.doc.destroy()
      void window.canvas.sharedText.close(workspaceId).catch(() => {})
    }
  }
}
