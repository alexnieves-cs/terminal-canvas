/* `npm run supabase:probe` — the LIVE Supabase project, read from outside, as
   the app's anon key sees it. Hand-run: it reaches the network, so it is not a
   `verify:*` suite (verify:meta 19 pins the two hand-run exclusions by name,
   and this is not a third — it is a probe of a deployment, not of the repo).

   What it proves, with nothing but TC_SUPABASE_URL and TC_SUPABASE_ANON_KEY:
     schema.*   every table and RPC the three migrations create EXISTS on the
                project (a missing one answers PGRST205/PGRST202, "not in the
                schema cache", which is a different answer from a refusal);
     anon.*     the anon key — which ships inside the app — reads, writes and
                calls NOTHING: every table refuses select and insert, every RPC
                refuses execute. That is the boundary M330 says RLS and the
                grants are, exercised on the real Postgres rather than PGlite;
     auth.1     the GitHub provider is enabled, the one sign-in the app offers.

   With TC_PROBE_ACCESS_TOKEN (a signed-in person's access token — the app never
   prints one; a person copies it from a session they own), it also reads as
   that person (member.*): their own organization row comes back, and another
   organization's does not. Nothing here ever writes successfully: the only
   writes it attempts are empty inserts the grants must refuse, because a probe
   of a live project must not leave rows behind.

   Exit status: 0 when every check passed, 1 otherwise, 2 when unconfigured. */
'use strict'

const url = (process.env.TC_SUPABASE_URL || '').replace(/\/+$/, '')
const anon = process.env.TC_SUPABASE_ANON_KEY || ''
const person = process.env.TC_PROBE_ACCESS_TOKEN || ''
if (url === '' || anon === '') {
  console.log('supabase:probe — set TC_SUPABASE_URL and TC_SUPABASE_ANON_KEY (the app\'s own variables)')
  process.exit(2)
}

const TABLES = ['users', 'organizations', 'organization_members', 'invites', 'presence', 'activity_log', 'workspace_shares', 'workspace_members']
// Arguments with the right NAMES and harmless values: a refusal must come
// from the grant, not from PostgREST failing to find the overload.
const RPCS = {
  ensure_personal_org: {},
  invite_preview: { p_code_hash: '0'.repeat(64) },
  accept_invite: { p_code_hash: '0'.repeat(64) },
  create_workspace_share: { p_org: '00000000-0000-4000-8000-000000000000', p_name: 'probe' },
  workspace_role: { p_share: '00000000-0000-4000-8000-000000000000' },
  set_workspace_member: { p_share: '00000000-0000-4000-8000-000000000000', p_user: '00000000-0000-4000-8000-000000000000', p_role: 'viewer' }
}

const results = []
const ok = (id, pass, detail) => { results.push({ id, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${id}${detail ? ` — ${detail}` : ''}`) }

async function call(method, path, token, body) {
  const res = await fetch(`${url}${path}`, {
    method,
    headers: { apikey: anon, authorization: `Bearer ${token}`, 'content-type': 'application/json', prefer: 'return=minimal' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* an empty or plain body */ }
  return { status: res.status, code: json && typeof json === 'object' ? json.code ?? null : null, message: json && typeof json === 'object' ? String(json.message ?? '').slice(0, 120) : text.slice(0, 120), json }
}

/** PostgREST's "not in the schema cache" codes: the object does not exist on this project. */
const MISSING = new Set(['PGRST205', 'PGRST202', '42P01', '42883'])
const refused = (r) => (r.status === 401 || r.status === 403) && (r.code === '42501' || r.code === 'PGRST301' || /permission denied/i.test(r.message))

;(async () => {
  console.log(`supabase:probe — ${url} (anon${person ? ' + a person\'s token' : ''})`)

  for (const t of TABLES) {
    const read = await call('GET', `/rest/v1/${t}?select=*&limit=1`, anon)
    ok(`schema.${t} exists`, !MISSING.has(read.code) && read.status !== 404, `${read.status} ${read.code ?? ''}`)
    ok(`anon.read.${t} the anon key reads nothing`, refused(read), `${read.status} ${read.code ?? ''} ${read.message}`)
    // An EMPTY insert: refused by the grant before any row could be built,
    // and harmless if it somehow were not (it names no column).
    const write = await call('POST', `/rest/v1/${t}`, anon, {})
    ok(`anon.write.${t} the anon key writes nothing`, refused(write), `${write.status} ${write.code ?? ''} ${write.message}`)
  }
  for (const [fn, args] of Object.entries(RPCS)) {
    const r = await call('POST', `/rest/v1/rpc/${fn}`, anon, args)
    ok(`schema.rpc.${fn} exists with these argument names`, !MISSING.has(r.code) && r.status !== 404, `${r.status} ${r.code ?? ''}`)
    ok(`anon.rpc.${fn} the anon key cannot call it`, refused(r), `${r.status} ${r.code ?? ''} ${r.message}`)
  }

  const settings = await call('GET', '/auth/v1/settings', anon)
  ok('auth.1 the GitHub provider is enabled (the app\'s one sign-in)', settings.status === 200 && settings.json?.external?.github === true, `${settings.status}`)

  if (person !== '') {
    const me = await call('GET', '/auth/v1/user', person)
    ok('member.1 the token is a live session', me.status === 200 && typeof me.json?.id === 'string', `${me.status}`)
    const orgs = await call('GET', '/rest/v1/organizations?select=id,name&limit=50', person)
    ok('member.2 a person reads their organizations (at least the personal one)', orgs.status === 200 && Array.isArray(orgs.json) && orgs.json.length >= 1, `${orgs.status} ${Array.isArray(orgs.json) ? orgs.json.length : ''}`)
    const stranger = await call('GET', '/rest/v1/organizations?select=id&id=eq.00000000-0000-4000-8000-000000000000', person)
    ok('member.3 an organization they are not in reads as nothing (RLS, not an error)', stranger.status === 200 && Array.isArray(stranger.json) && stranger.json.length === 0, `${stranger.status}`)
    const role = await call('POST', '/rest/v1/rpc/workspace_role', person, RPCS.workspace_role)
    ok('member.4 workspace_role for a share they are not in answers null, not a role', role.status === 200 && (role.json === null || role.json === undefined), `${role.status} ${JSON.stringify(role.json)}`)
  }

  const failed = results.filter((r) => !r.pass)
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
  process.exitCode = failed.length ? 1 : 0
})().catch((e) => { console.log(`supabase:probe threw: ${e && e.stack}`); process.exitCode = 1 })
