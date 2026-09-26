/**
 * `npm run collab` — the collab server from the environment:
 *
 *   TC_SUPABASE_URL       https://<project>.supabase.co  (the app's own variable)
 *   TC_SUPABASE_ANON_KEY  the project's anon key          (the app's own variable)
 *   TC_COLLAB_PORT        default 1234
 *   TC_COLLAB_ADDRESS     default 127.0.0.1 — put TLS in front before binding wider:
 *                         the app refuses a non-local ws:// (presence-hub.ts
 *                         readPresenceConfig), and so should this.
 */
import { createCollabAuth } from './auth'
import { createCollabServer } from './server'

const url = process.env['TC_SUPABASE_URL']
const anonKey = process.env['TC_SUPABASE_ANON_KEY']
if (url === undefined || anonKey === undefined || url === '' || anonKey === '') {
  console.error('collab: set TC_SUPABASE_URL and TC_SUPABASE_ANON_KEY')
  process.exit(2)
}
const port = Number(process.env['TC_COLLAB_PORT'] ?? '1234')
const address = process.env['TC_COLLAB_ADDRESS'] ?? '127.0.0.1'

const server = createCollabServer({
  authenticate: createCollabAuth({ supabaseUrl: url, anonKey, fetch: (u, init) => fetch(u, init) }),
  port,
  address,
  quiet: false,
  onRefused: ({ documentName, userId, reason }) => console.warn(`collab: refused ${userId} in ${documentName}: ${reason}`)
})
void server.listen().then(() => console.log(`collab: listening on ws://${address}:${port}`))
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => { void server.destroy().then(() => process.exit(0)) })
