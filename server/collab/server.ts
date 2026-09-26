/**
 * The Terminal Canvas collab server: Hocuspocus with the two checks the app's
 * own gates cannot replace, because a modified client skips its own gates.
 *
 *   onAuthenticate  who you are and your role in THIS room (auth.ts). A viewer's
 *                   connection is READ-ONLY: Hocuspocus drops every doc update
 *                   it sends, and awareness (cursors, the roster) still flows.
 *   beforeSync      every sync step 2 and update from an editor or owner is
 *                   applied to a throwaway copy of the doc and read back as ops
 *                   (canvas-doc.ts inspectUpdate); each op goes through the SAME
 *                   table the app uses (canvas-ops.ts authorizeCanvasOp). One
 *                   refusal closes the connection before the update applies —
 *                   Hocuspocus's own contract for a throwing hook.
 *
 * Closing rather than dropping the one update: a dropped update leaves that
 * client's doc diverged for good (its state vector says the server has it),
 * and an honest client never sends one — the app refuses the op before it is
 * written — so the only client that reaches this is one to stop talking to.
 */
import { Server } from '@hocuspocus/server'
import * as Y from 'yjs'
import { inspectUpdate } from '../../src/shared/canvas-doc'
import { authorizeCanvasOp } from '../../src/shared/canvas-ops'
import { TEAM_DOC_MAP } from '../../src/shared/team'
import type { CollabContext } from './auth'
import { Refused } from './auth'
import { PERSISTED_ROOM, type DocStore } from './persistence'

/** y-protocols/sync message types: 1 sync step 2, 2 update. Step 1 is a state vector and writes nothing. */
const WRITES = new Set([1, 2])

export interface CollabServerOptions {
  authenticate: (token: string, documentName: string) => Promise<CollabContext>
  port?: number
  address?: string
  quiet?: boolean
  /** A refusal, for the operator's log. The update's content is never logged. */
  onRefused?: (e: { documentName: string; userId: string; reason: string }) => void
  /**
   * M346. Where a SHARED room's state is kept (persistence.ts). Absent, rooms
   * live only in memory, as before M346 — the verify harness's default.
   */
  store?: DocStore
  /** M346. The shortest time between two snapshots of one room. Default one hour. */
  snapshotEveryMs?: number
  /** M346. Structured events for the operator's log (log.ts): never a room's content. */
  log?: (event: string, fields: Record<string, unknown>) => void
  /** Overridable for the checks: Hocuspocus's store debounce, ms. */
  debounceMs?: number
}

/** The first line of `GET /healthz`: what an uptime check needs, nothing about any room's content. */
export interface CollabHealth { ok: true; rooms: number; connections: number; uptimeS: number; persisted: boolean }

export function createCollabServer(opts: CollabServerOptions): Server<CollabContext> {
  const store = opts.store
  const every = opts.snapshotEveryMs ?? 60 * 60 * 1000
  const log = opts.log ?? (() => {})
  const started = Date.now()
  // When each room last took a snapshot, cached so a store does not have to
  // ask the database first; seeded from the store on a room's first save.
  const lastSnapshot = new Map<string, number>()
  return new Server<CollabContext>({
    port: opts.port ?? 1234,
    ...(opts.address === undefined ? {} : { address: opts.address }),
    quiet: opts.quiet ?? true,
    stopOnSignals: false,
    ...(opts.debounceMs === undefined ? {} : { debounce: opts.debounceMs, maxDebounce: opts.debounceMs * 5 }),
    // M346. `GET /healthz` for the uptime timer (deploy/collab-health.sh):
    // counts and uptime only. Everything else keeps Hocuspocus's own answer.
    async onRequest({ request, response, instance }) {
      if (request.method !== 'GET' || (request.url ?? '').split('?')[0] !== '/healthz') return
      const body: CollabHealth = { ok: true, rooms: instance.getDocumentsCount(), connections: instance.getConnectionsCount(), uptimeS: Math.round((Date.now() - started) / 1000), persisted: store !== undefined }
      response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
      response.end(JSON.stringify(body))
      // Hocuspocus's contract: a falsy rejection means "answered, stop here".
      throw null
    },
    // M346. A shared room is loaded from the store before anyone syncs. Its
    // state was written by this server (onStoreDocument), so it is applied
    // directly — beforeSync judges CLIENT writes. The Team view's snapshots
    // are cleared: they are published only while someone watches, and after
    // a restart nobody does.
    async onLoadDocument({ document, documentName }) {
      if (store === undefined || !PERSISTED_ROOM.test(documentName)) return
      const t0 = Date.now()
      const state = await store.load(documentName)
      if (state === null) { log('room.new', { room: documentName }); return }
      Y.applyUpdate(document, state, 'collab:load')
      const team = document.getMap(TEAM_DOC_MAP)
      if (team.size > 0) document.transact(() => { for (const k of [...team.keys()]) team.delete(k) }, 'collab:load')
      log('room.loaded', { room: documentName, bytes: state.byteLength, ms: Date.now() - t0 })
    },
    // Debounced by Hocuspocus (default 2 s, at most 10 s), and once more as a
    // room unloads, so the last change is kept even when everyone leaves at once.
    async onStoreDocument({ document, documentName }) {
      if (store === undefined || !PERSISTED_ROOM.test(documentName)) return
      const state = Y.encodeStateAsUpdate(document)
      try {
        await store.store(documentName, state)
        let last = lastSnapshot.get(documentName)
        if (last === undefined) { last = (await store.lastSnapshotAt(documentName)) ?? 0; lastSnapshot.set(documentName, last) }
        if (Date.now() - last >= every) {
          await store.snapshot(documentName, state, 'interval')
          lastSnapshot.set(documentName, Date.now())
          log('room.snapshot', { room: documentName, bytes: state.byteLength })
        }
      } catch (error) {
        // Logged, never thrown into Hocuspocus: a failed save must not close
        // a room people are working in. The next change stores it again.
        log('room.store_failed', { room: documentName, error: String(error instanceof Error ? error.message : error) })
      }
    },
    async onAuthenticate({ token, documentName, connectionConfig }) {
      const ctx = await opts.authenticate(token, documentName)
      if (ctx.role === 'viewer') connectionConfig.readOnly = true
      return ctx
    },
    async beforeSync({ type, payload, document, documentName, context, connection }) {
      // A read-only connection's write is DROPPED by Hocuspocus after this
      // hook (readSyncMessage checks readOnly after calling it) — so a viewer
      // is left to that, and keeps its awareness, rather than being cut off
      // here for a write that was never going to apply.
      if (!WRITES.has(type) || context === undefined || connection.readOnly) return
      const ctx = context as CollabContext
      for (const { op, ctx: before } of inspectUpdate(document, payload)) {
        const verdict = authorizeCanvasOp(ctx.role, op, { userId: ctx.userId, ...before })
        if (!verdict.ok) {
          opts.onRefused?.({ documentName, userId: ctx.userId, reason: verdict.reason })
          throw Object.assign(new Refused(verdict.reason), { code: 4403 })
        }
      }
    }
  })
}
