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
  /** M81. READ-ONLY: the canvas model, for a supervisor that answers about it. */
  | { verb: 'status' }

export type ParsedControl =
  | { kind: 'ok'; req: ControlRequest }
  | { kind: 'bad'; error: string }

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
  if (parsed.host !== 'open') return { kind: 'bad', error: `a URL can only open — ${JSON.stringify(parsed.host)} is not accepted` }
  const fields: Record<string, unknown> = { verb: 'open' }
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
