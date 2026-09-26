/**
 * M54 — the request both doors share.
 *
 * ONE parser feeds the socket (`parseControlLine`) and the URL scheme
 * (`parseControlUrl`), and both yield the same `ControlRequest`, so a verb
 * or a field accepted at one door is accepted at the other. That is why
 * `command` is refused HERE rather than at a door: a URL can arrive from a
 * web page or another app, a socket client is an agent already running
 * arbitrary commands, and a parser that took a command from the socket
 * would be one edit away from taking it from the URL. The preset system
 * answers "what to run"; the doors answer only "where, and which".
 *
 * Pure: no fs, no net, no electron. `resolveOpen` takes `exists` as a
 * function for the same reason presets.ts takes `which`.
 */
import type { Preset } from '../shared/layout-schema'

export type ControlRequest =
  | { verb: 'open'; preset?: string; cwd?: string }
  | { verb: 'list' }
  | { verb: 'focus'; id: string }
  | { verb: 'ping' }
  | { verb: 'plan'; line: string; token?: string }
  /** M81. READ-ONLY: the canvas model, for a supervisor that answers about it. */
  | { verb: 'status' }
  /**
   * M369. READ-ONLY: the decision audit, newest first — what a person decided,
   * scrubbed on its way to disk. Socket only, like `status`.
   */
  | { verb: 'audit'; limit?: number }
  /**
   * M83. The project memory. `add` is the first control verb that WRITES,
   * and it writes only into that store — it cannot spawn, focus or run.
   */
  | { verb: 'memory'; op: 'list'; root?: string; limit?: number }
  | { verb: 'memory'; op: 'add'; root: string; kind: string; text: string; panelId?: string }
  /**
   * M87. The broker: a request to a service this app holds a credential for,
   * performed by main with the credential attached and never returned. The
   * verb that can SPEND a credential — refused at the URL door outright.
   */
  | { verb: 'api'; service: string; method: string; path: string; body?: string; panelId?: string; cost?: string; token?: string }
  /**
   * M113. The board: READ-WRITE (it adds a record, or marks one done), so the
   * URL door refuses it like `status`. It writes nothing itself — main asks
   * the renderer, which owns the workspace it is rendering.
   */
  | { verb: 'board'; op: 'add'; title: string }
  | { verb: 'board'; op: 'done'; id: string }
  /**
   * M313. BRING A TASK INTO THE CANVAS — from a terminal (`tc task`) or a link
   * (`terminal-canvas://task?…`). It PROPOSES: the renderer opens Start work
   * filled in, and a person presses Start. Nothing is added, dispatched or run
   * by the request itself, which is why this — unlike `board add` — may come
   * through the URL door: a web page can pre-fill a form, never act.
   */
  | { verb: 'task'; title: string; brief?: string; criteria?: string[]; cwd?: string; recipe?: string }
  /**
   * The Terminal Canvas account. SOCKET ONLY — the URL door's host list is
   * `open` and `task`, so a web page can never sign someone in, out, or into
   * an organization. `login` and `join` PROPOSE: main puts a dialog in front
   * of a person before either acts, because any agent in any terminal can
   * reach this socket. `invite` and `logout` act, and answer with metadata.
   */
  | { verb: 'login' }
  | { verb: 'logout'; githubId?: string }
  | { verb: 'invite'; role: 'member' | 'admin'; orgId?: string }
  | { verb: 'join'; code: string }
  /**
   * M336–M337. The account picker and sharing (share-control.ts). SOCKET ONLY,
   * like the account verbs above. The lists answer at once; `use`, `share`,
   * `open-share` and `share-role` PROPOSE — a dialog asks a person first.
   * `who` is a GitHub login or id (an account) or a login or user id (a member).
   */
  | { verb: 'accounts' }
  | { verb: 'use'; who: string }
  | { verb: 'shares' }
  | { verb: 'share'; orgId?: string }
  | { verb: 'open-share'; shareId: string }
  | { verb: 'share-role'; shareId: string; who: string; role: 'editor' | 'viewer' | null }

export type ParsedControl =
  | { kind: 'ok'; req: ControlRequest }
  | { kind: 'bad'; error: string }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const CONTROL_SCHEME = 'terminal-canvas'

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

const optionalString = (v: unknown): string | undefined | null => {
  if (v === undefined) return undefined
  if (typeof v === 'string' && v.length > 0) return v
  return null
}

/** Builds the request from already-decoded fields; both doors end here. */
function fromFields(fields: Record<string, unknown>): ParsedControl {
  if ('command' in fields || 'args' in fields) {
    return { kind: 'bad', error: 'a command is never accepted here — pick a preset; presets decide what runs' }
  }
  const verb = fields['verb']
  switch (verb) {
    case 'plan': {
      const line = fields['line']
      if (typeof line !== 'string' || line.trim() === '') return { kind: 'bad', error: 'a plan needs a nonempty line' }
      if (Buffer.byteLength(line, 'utf8') > 8192 || /[\x00-\x1f\x7f]/.test(line)) return { kind: 'bad', error: 'the plan line exceeds its size or control-character limit' }
      if (line.split(';').filter((part) => part.trim() !== '').length > 16) return { kind: 'bad', error: 'a plan may contain at most 16 operations' }
      // M180. The caller's own token, as `api` carries it: main maps it to the
      // panel that really asked, so a teammate's chat is bounded at this door too.
      const token = optionalString(fields['token'])
      if (token === null) return { kind: 'bad', error: 'token must be a non-empty string' }
      return { kind: 'ok', req: { verb: 'plan', line, ...(token === undefined ? {} : { token: token.slice(0, 128) }) } }
    }
    case 'open': {
      const preset = optionalString(fields['preset'])
      const cwd = optionalString(fields['cwd'])
      if (preset === null) return { kind: 'bad', error: 'preset must be a non-empty string' }
      if (cwd === null) return { kind: 'bad', error: 'cwd must be a non-empty string' }
      const req: ControlRequest = { verb: 'open' }
      // Absent stays absent: a `preset: undefined` would survive JSON in
      // neither direction, but it would survive a spread into the reply.
      if (preset !== undefined) req.preset = preset
      if (cwd !== undefined) req.cwd = cwd
      return { kind: 'ok', req }
    }
    case 'list':
      return { kind: 'ok', req: { verb: 'list' } }
    case 'ping':
      return { kind: 'ok', req: { verb: 'ping' } }
    case 'status':
      return { kind: 'ok', req: { verb: 'status' } }
    case 'audit': {
      const limitRaw = fields['limit']
      if (limitRaw === undefined) return { kind: 'ok', req: { verb: 'audit' } }
      if (typeof limitRaw !== 'number' || !Number.isInteger(limitRaw) || limitRaw < 1 || limitRaw > 1000) return { kind: 'bad', error: 'limit must be a whole number from 1 to 1000' }
      return { kind: 'ok', req: { verb: 'audit', limit: limitRaw } }
    }
    case 'memory': {
      const op = fields['op']
      if (op === 'list') {
        const root = optionalString(fields['root'])
        if (root === null) return { kind: 'bad', error: 'root must be a non-empty string' }
        const limitRaw = fields['limit']
        const limit = typeof limitRaw === 'number' && Number.isFinite(limitRaw) ? limitRaw : undefined
        const req: ControlRequest = { verb: 'memory', op: 'list' }
        if (root !== undefined) req.root = root
        if (limit !== undefined) req.limit = limit
        return { kind: 'ok', req }
      }
      if (op === 'add') {
        const root = optionalString(fields['root'])
        const kind = optionalString(fields['kind'])
        const text = optionalString(fields['text'])
        const panelId = optionalString(fields['panelId'])
        if (root === null || root === undefined) return { kind: 'bad', error: 'memory add needs a root' }
        if (kind === null || kind === undefined) return { kind: 'bad', error: 'memory add needs a kind — decided, tried, failed or note' }
        if (text === null || text === undefined) return { kind: 'bad', error: 'memory add needs text' }
        if (panelId === null) return { kind: 'bad', error: 'panelId must be a non-empty string' }
        const req: ControlRequest = { verb: 'memory', op: 'add', root, kind, text }
        if (panelId !== undefined) req.panelId = panelId
        return { kind: 'ok', req }
      }
      return { kind: 'bad', error: `unknown memory op ${JSON.stringify(op)} — use list or add` }
    }
    case 'task': {
      const title = optionalString(fields['title'])
      if (title === null || title === undefined || title.trim() === '') return { kind: 'bad', error: 'a task needs a title' }
      const brief = optionalString(fields['brief'])
      const cwd = optionalString(fields['cwd'])
      const recipe = optionalString(fields['recipe'])
      if (brief === null || cwd === null || recipe === null) return { kind: 'bad', error: 'brief, cwd and recipe must be non-empty strings when given' }
      if (cwd !== undefined && !cwd.startsWith('/')) return { kind: 'bad', error: 'cwd must be an absolute path' }
      // A list from the socket; one-per-line text from a URL's single value.
      const raw = fields['criteria']
      const criteria = Array.isArray(raw) ? raw.filter((c): c is string => typeof c === 'string') : typeof raw === 'string' ? raw.split('\n') : undefined
      const clean = criteria?.map((c) => c.trim()).filter((c) => c !== '' && !/[\x00-\x1f\x7f]/.test(c)).map((c) => c.slice(0, 400)).slice(0, 20)
      return {
        kind: 'ok',
        req: {
          verb: 'task',
          title: title.trim().replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, 200),
          ...(brief === undefined ? {} : { brief: brief.slice(0, 4000) }),
          ...(clean === undefined || clean.length === 0 ? {} : { criteria: clean }),
          ...(cwd === undefined ? {} : { cwd }),
          ...(recipe === undefined ? {} : { recipe: recipe.slice(0, 80) })
        }
      }
    }
    case 'login':
      return { kind: 'ok', req: { verb: 'login' } }
    case 'logout': {
      const githubId = optionalString(fields['githubId'])
      if (githubId === null || (githubId !== undefined && !/^[1-9][0-9]{0,19}$/.test(githubId))) return { kind: 'bad', error: 'githubId must be a numeric GitHub user id' }
      return { kind: 'ok', req: githubId === undefined ? { verb: 'logout' } : { verb: 'logout', githubId } }
    }
    case 'invite': {
      const role = fields['role']
      if (role !== 'member' && role !== 'admin') return { kind: 'bad', error: 'invite needs a role — member or admin' }
      const orgId = optionalString(fields['orgId'])
      if (orgId === null || (orgId !== undefined && !/^[0-9a-f-]{36}$/i.test(orgId))) return { kind: 'bad', error: 'orgId must be an organization id (a uuid)' }
      return { kind: 'ok', req: orgId === undefined ? { verb: 'invite', role } : { verb: 'invite', role, orgId } }
    }
    case 'join': {
      const code = optionalString(fields['code'])
      if (code === null || code === undefined) return { kind: 'bad', error: 'join needs an invite code' }
      if (code.length > 128) return { kind: 'bad', error: 'that invite code is too long' }
      return { kind: 'ok', req: { verb: 'join', code } }
    }
    case 'accounts':
    case 'shares':
      return { kind: 'ok', req: { verb } }
    case 'use': {
      const who = optionalString(fields['who'])
      if (who === null || who === undefined || !/^[A-Za-z0-9-]{1,39}$/.test(who)) return { kind: 'bad', error: 'use needs a GitHub login or user id' }
      return { kind: 'ok', req: { verb: 'use', who } }
    }
    case 'share': {
      const orgId = optionalString(fields['orgId'])
      if (orgId === null || (orgId !== undefined && !UUID_RE.test(orgId))) return { kind: 'bad', error: 'orgId must be an organization id (a uuid)' }
      return { kind: 'ok', req: orgId === undefined ? { verb: 'share' } : { verb: 'share', orgId } }
    }
    case 'open-share': {
      const shareId = optionalString(fields['shareId'])
      if (shareId === null || shareId === undefined || !UUID_RE.test(shareId)) return { kind: 'bad', error: 'open-share needs a shared workspace id (a uuid) — `tc shares` lists them' }
      return { kind: 'ok', req: { verb: 'open-share', shareId } }
    }
    case 'share-role': {
      const shareId = optionalString(fields['shareId'])
      const who = optionalString(fields['who'])
      const role = fields['role']
      if (shareId === null || shareId === undefined || !UUID_RE.test(shareId)) return { kind: 'bad', error: 'share-role needs a shared workspace id (a uuid)' }
      if (who === null || who === undefined || !/^[A-Za-z0-9-]{1,39}$|^[0-9a-f-]{36}$/i.test(who)) return { kind: 'bad', error: 'share-role needs a GitHub login or user id' }
      if (role !== 'editor' && role !== 'viewer' && role !== 'none') return { kind: 'bad', error: 'a role is editor, viewer or none' }
      return { kind: 'ok', req: { verb: 'share-role', shareId, who, role: role === 'none' ? null : role } }
    }
    case 'board': {
      const op = fields['op']
      if (op === 'add') {
        const title = optionalString(fields['title'])
        if (title === null || title === undefined || title.trim() === '') return { kind: 'bad', error: 'board add needs a title' }
        return { kind: 'ok', req: { verb: 'board', op: 'add', title: title.trim() } }
      }
      if (op === 'done') {
        const id = optionalString(fields['id'])
        if (id === null || id === undefined) return { kind: 'bad', error: 'board done needs the item id' }
        return { kind: 'ok', req: { verb: 'board', op: 'done', id } }
      }
      return { kind: 'bad', error: `unknown board op ${JSON.stringify(op)} — use add or done` }
    }
    case 'api': {
      const service = optionalString(fields['service'])
      const method = optionalString(fields['method'])
      const path = optionalString(fields['path'])
      const body = fields['body']
      const panelId = optionalString(fields['panelId'])
      if (service === null || service === undefined) return { kind: 'bad', error: 'api needs a service — github or jira' }
      if (method === null || method === undefined) return { kind: 'bad', error: 'api needs a method — GET, POST, PUT, PATCH or DELETE' }
      if (path === null || path === undefined) return { kind: 'bad', error: 'api needs a path, starting with /' }
      if (body !== undefined && typeof body !== 'string') return { kind: 'bad', error: 'body must be a string (JSON, already encoded)' }
      if (panelId === null) return { kind: 'bad', error: 'panelId must be a non-empty string' }
      const req: ControlRequest = { verb: 'api', service, method, path }
      if (typeof body === 'string') req.body = body
      if (panelId !== undefined) req.panelId = panelId
      // M102. What the caller says the call costs — shown on the card as said.
      // The TEAMMATE is never a field here: main derives it from the panel
      // that asked, so an agent cannot name an identity it is not.
      const cost = optionalString(fields['cost'])
      if (cost !== null && cost !== undefined) req.cost = cost.slice(0, 64)
      // M102. The session's own token (from its environment): main maps it to
      // the panel that really asked and IGNORES a claimed panelId beside it.
      const token = optionalString(fields['token'])
      if (token !== null && token !== undefined) req.token = token.slice(0, 128)
      return { kind: 'ok', req }
    }
    case 'focus': {
      const id = fields['id']
      if (typeof id !== 'string' || id.length === 0) return { kind: 'bad', error: 'focus needs an id' }
      return { kind: 'ok', req: { verb: 'focus', id } }
    }
    default:
      return { kind: 'bad', error: `unknown verb ${JSON.stringify(verb)}` }
  }
}

/** The socket door: one JSON object per line. */
export function parseControlLine(line: string): ParsedControl {
  let value: unknown
  try {
    value = JSON.parse(line.trim())
  } catch {
    return { kind: 'bad', error: 'not a JSON object' }
  }
  if (!isRecord(value)) return { kind: 'bad', error: 'not a JSON object' }
  return fromFields(value)
}

/**
 * The URL door: `terminal-canvas://open?preset=<name|id>&cwd=<path>`. Only
 * `open` — a URL that could focus or list is a URL that could probe, and
 * nothing outside the app needs either from a link. The host is the verb.
 */
export function parseControlUrl(url: string): ParsedControl {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { kind: 'bad', error: 'not a URL' }
  }
  if (parsed.protocol !== `${CONTROL_SCHEME}:`) return { kind: 'bad', error: `not a ${CONTROL_SCHEME}:// URL` }
  // M313. `task` is the second host: it only PROPOSES (see the request type).
  if (parsed.host !== 'open' && parsed.host !== 'task') return { kind: 'bad', error: `a URL can only open or propose a task — ${JSON.stringify(parsed.host)} is not accepted` }
  if (parsed.searchParams.has('verb')) return { kind: 'bad', error: 'a URL can only open — its query cannot replace the verb' }
  const fields: Record<string, unknown> = { verb: parsed.host }
  for (const [k, v] of parsed.searchParams) fields[k] = v
  return fromFields(fields)
}

export type OpenResolution =
  | { kind: 'ok'; preset: Preset; cwd?: string }
  | { kind: 'refused'; error: string }

/**
 * Which preset, and where. By name first (what a person types), then by id
 * (what a script copied from `list`), then the default. A cwd that is not on
 * disk is refused rather than passed on: the spawn would land in $HOME
 * silently, which #57 calls worse than spawning nothing.
 */
export function resolveOpen(input: {
  req: { verb: 'open'; preset?: string; cwd?: string }
  presets: readonly Preset[]
  defaultId: string | null
  exists: (path: string) => boolean
}): OpenResolution {
  const { req, presets, defaultId, exists } = input
  let preset: Preset | undefined
  if (req.preset !== undefined) {
    preset = presets.find((p) => p.name === req.preset) ?? presets.find((p) => p.id === req.preset)
    if (preset === undefined) return { kind: 'refused', error: `no preset named ${req.preset}` }
  } else {
    preset = defaultId === null ? undefined : presets.find((p) => p.id === defaultId)
    if (preset === undefined) return { kind: 'refused', error: 'no preset given and no default preset is set' }
  }
  if (req.cwd !== undefined && !exists(req.cwd)) return { kind: 'refused', error: `cwd ${req.cwd} does not exist` }
  const out: OpenResolution = { kind: 'ok', preset }
  if (req.cwd !== undefined) out.cwd = req.cwd
  return out
}
