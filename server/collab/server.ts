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
import { inspectUpdate } from '../../src/shared/canvas-doc'
import { authorizeCanvasOp } from '../../src/shared/canvas-ops'
import type { CollabContext } from './auth'
import { Refused } from './auth'

/** y-protocols/sync message types: 1 sync step 2, 2 update. Step 1 is a state vector and writes nothing. */
const WRITES = new Set([1, 2])

export interface CollabServerOptions {
  authenticate: (token: string, documentName: string) => Promise<CollabContext>
  port?: number
  address?: string
  quiet?: boolean
  /** A refusal, for the operator's log. The update's content is never logged. */
  onRefused?: (e: { documentName: string; userId: string; reason: string }) => void
}

export function createCollabServer(opts: CollabServerOptions): Server<CollabContext> {
  return new Server<CollabContext>({
    port: opts.port ?? 1234,
    ...(opts.address === undefined ? {} : { address: opts.address }),
    quiet: opts.quiet ?? true,
    stopOnSignals: false,
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
