/**
 * M447. What an exit code means, and the recovery state a host loss moves
 * through. Pure: no React, no tmux, no clock of its own.
 *
 * The reducer lives in this file because main has to sample it from the
 * existing `list()` tick and the renderer has to paint it, and a second
 * shared module is outside this lane's ownership. `session-backend.ts` feeds
 * samples. It does not start a timer: `pollLive` already calls `list()`.
 *
 * Twenty seconds of silence pauses the panes the last answer named. One
 * missed sample does not. A later answer keeps a pane only when its pid is
 * the same one; a missing pane, or a new pid, ended. kill-server ends every
 * pane, and the report says so.
 */

export const HOST_SILENT_MS = 20_000
export const HOST_RETRY_MS = 8_000

export const PAUSED_LINE = 'paused · output kept'
export const PAUSED_KEYS = 'nothing you type is lost or sent twice'
export const RECONNECT_LABEL = 'Reconnect now'
export const DETAILS_LABEL = 'Details'
export const CRASH_TITLE = 'This session ended unexpectedly'
export const KEPT_LINE = 'The pending edit was not applied'
export const RESTART_LABEL = 'Restart with last prompt'
export const READ_LOG_LABEL = 'Read log'

export function explainExit(code: number | null | undefined): string {
  if (code === 137) return 'killed, usually by memory pressure'
  if (code === 130) return 'stopped by an interrupt'
  if (code === 143) return 'stopped by a termination signal'
  if (code === 127) return 'the command was not found'
  if (code === null || code === undefined || !Number.isInteger(code)) return 'ended without a reported status'
  return `ended with status ${code}`
}

/**
 * Did `list-panes` answer? Exit 0 did, even with no panes. A timeout did not.
 * "no server" / "error connecting" did not. Any other non-zero is a tmux
 * complaint we still heard, so the host is not treated as gone.
 */
export function listAnswered(exitCode: number | null, stderr: string): boolean {
  if (exitCode === 0) return true
  if (exitCode === null) return false
  return !/no server running|error connecting|lost server|no such file or directory/i.test(stderr)
}

export function hostBanner(pausedCount: number): string {
  const noun = pausedCount === 1 ? 'session is' : 'sessions are'
  return `Session host stopped responding. tmux server on this Mac didn't answer for 20s. ${pausedCount} ${noun} paused, not lost — their output is buffered.`
}

export function retryLabel(retryAt: number | null, now: number): string | null {
  if (retryAt === null) return null
  const seconds = Math.max(0, Math.ceil((retryAt - now) / 1000))
  return `Retrying in ${seconds}s`
}

export function offlineLine(lastUpdated: string): string {
  return `offline · cached · last updated ${lastUpdated}`
}

export interface OfflineToast {
  sentence: string
  detail: string
  outcome: 'failed'
}

/** A finished fact: the provider dropped. Outstanding recovery is not a toast. */
export function offlineToast(source: 'GitHub' | 'Jira'): OfflineToast {
  return {
    sentence: `${source} is offline`,
    detail: 'The canvas, terminals and notes keep working. Cached data stays marked until the connection returns.',
    outcome: 'failed'
  }
}

/** The pill sentence. Empty when nothing is paused and nothing needs recovery. */
export function recoveryPillLine(need: number, paused: number): string {
  if (need <= 0 && paused <= 0) return ''
  const parts: string[] = []
  if (need === 1) parts.push('1 session needs recovery')
  else if (need > 1) parts.push(`${need} sessions need recovery`)
  if (paused === 1) parts.push('1 paused')
  else if (paused > 1) parts.push(`${paused} paused`)
  parts.push('Review')
  return parts.join(' · ')
}

export function bootIssueSentence(issues: readonly string[]): string | null {
  const sentence = issues.find((line) => line.trim() !== '')
  return sentence ?? null
}

/** Restart acts on the panel that ended. The id does not change. */
export function restartKeepsPanel(panelId: string): string {
  return panelId
}

export interface PaneSnap {
  panelId: string
  pid: number
}

export interface EndedPane {
  panelId: string
  pid: number
  code: number | null
}

export type HostPhase = 'live' | 'paused' | 'reattaching'

export interface HostState {
  phase: HostPhase
  silentSince: number | null
  lastPanes: PaneSnap[]
  paused: PaneSnap[]
  ended: EndedPane[]
  retryAt: number | null
  detailsOpen: boolean
}

export function initialHost(): HostState {
  return {
    phase: 'live',
    silentSince: null,
    lastPanes: [],
    paused: [],
    ended: [],
    retryAt: null,
    detailsOpen: false
  }
}

export type HostEvent =
  | { type: 'sample'; at: number; answered: boolean; panes: readonly PaneSnap[]; exits?: readonly { panelId: string; code: number | null }[] }
  | { type: 'reconnect'; at: number }
  | { type: 'toggle-details' }

export function reduceHost(state: HostState, event: HostEvent): HostState {
  if (event.type === 'toggle-details') return { ...state, detailsOpen: !state.detailsOpen }
  if (event.type === 'reconnect') {
    if (state.phase !== 'paused') return state
    return { ...state, phase: 'reattaching', retryAt: event.at }
  }
  if (event.answered) return answered(state, event.at, event.panes, event.exits ?? [])
  return silent(state, event.at)
}

function silent(state: HostState, at: number): HostState {
  const silentSince = state.silentSince ?? at
  if (state.phase === 'live') {
    if (at - silentSince < HOST_SILENT_MS) return { ...state, silentSince }
    return {
      ...state,
      phase: 'paused',
      silentSince,
      paused: state.lastPanes.map((pane) => ({ ...pane })),
      retryAt: at + HOST_RETRY_MS
    }
  }
  const retryAt = state.retryAt !== null && at >= state.retryAt ? at + HOST_RETRY_MS : state.retryAt
  return { ...state, silentSince, retryAt }
}

function answered(state: HostState, _at: number, panes: readonly PaneSnap[], exits: readonly { panelId: string; code: number | null }[]): HostState {
  const nextPanes = panes.map((pane) => ({ ...pane }))
  if (state.phase === 'live') {
    return { ...state, silentSince: null, lastPanes: nextPanes, retryAt: null }
  }
  const byId = new Map(nextPanes.map((pane) => [pane.panelId, pane]))
  const still: PaneSnap[] = []
  const ended: EndedPane[] = []
  for (const prev of state.paused) {
    const now = byId.get(prev.panelId)
    if (now !== undefined && now.pid === prev.pid) still.push(now)
    else ended.push({ panelId: prev.panelId, pid: prev.pid, code: exits.find((row) => row.panelId === prev.panelId)?.code ?? null })
  }
  return {
    ...state,
    phase: still.length === 0 ? 'live' : 'paused',
    silentSince: null,
    lastPanes: nextPanes,
    paused: still,
    ended: [...state.ended, ...ended],
    retryAt: still.length === 0 ? null : state.retryAt
  }
}

export type FrameVariant = 'live' | 'paused' | 'reattaching' | 'crashed'

export function frameVariant(host: HostState, panelId: string, crashedIds: readonly string[]): FrameVariant {
  if (crashedIds.includes(panelId)) return 'crashed'
  const held = host.paused.some((pane) => pane.panelId === panelId)
  if (!held) return 'live'
  if (host.phase === 'reattaching') return 'reattaching'
  if (host.phase === 'paused') return 'paused'
  return 'live'
}

export function keystrokesBlocked(variant: FrameVariant): boolean {
  return variant === 'paused'
}

export interface CrashFact {
  panelId: string
  code: number | null
  prompt: string | null
}

export interface RecoveryModel {
  host: HostState
  crashes: CrashFact[]
  offline: { github: string | null; jira: string | null }
  bootIssue: string | null
}

export function initialRecovery(): RecoveryModel {
  return { host: initialHost(), crashes: [], offline: { github: null, jira: null }, bootIssue: null }
}

export function recoveryFromHost(host: HostState): RecoveryModel {
  return { host, crashes: [], offline: { github: null, jira: null }, bootIssue: null }
}

export type RecoveryEvent =
  | HostEvent
  | { type: 'crashed'; at: number; panelId: string; code: number | null; prompt: string | null }
  | { type: 'restart'; panelId: string }
  | { type: 'offline'; source: 'github' | 'jira'; lastUpdated: string }
  | { type: 'online'; source: 'github' | 'jira' }
  | { type: 'boot-issue'; sentence: string }

export function reduceRecovery(model: RecoveryModel, event: RecoveryEvent): RecoveryModel {
  if (event.type === 'sample' || event.type === 'reconnect' || event.type === 'toggle-details') {
    const host = reduceHost(model.host, event)
    const fresh = event.type === 'sample' && event.answered ? endedCrashes(model.host, host) : []
    return { ...model, host, crashes: dedupeCrashes([...model.crashes, ...fresh]) }
  }
  if (event.type === 'crashed') {
    return { ...model, crashes: dedupeCrashes([...model.crashes, { panelId: event.panelId, code: event.code, prompt: event.prompt }]) }
  }
  if (event.type === 'restart') {
    const panelId = restartKeepsPanel(event.panelId)
    return {
      ...model,
      crashes: model.crashes.filter((crash) => crash.panelId !== panelId),
      host: { ...model.host, ended: model.host.ended.filter((pane) => pane.panelId !== panelId) }
    }
  }
  if (event.type === 'offline') {
    return { ...model, offline: { ...model.offline, [event.source]: event.lastUpdated } }
  }
  if (event.type === 'online') {
    return { ...model, offline: { ...model.offline, [event.source]: null } }
  }
  return { ...model, bootIssue: bootIssueSentence([event.sentence]) }
}

function endedCrashes(before: HostState, after: HostState): CrashFact[] {
  const seen = new Set(before.ended.map((pane) => pane.panelId))
  return after.ended.filter((pane) => !seen.has(pane.panelId)).map((pane) => ({ panelId: pane.panelId, code: pane.code, prompt: null }))
}

function dedupeCrashes(crashes: readonly CrashFact[]): CrashFact[] {
  const byId = new Map<string, CrashFact>()
  for (const crash of crashes) byId.set(crash.panelId, crash)
  return [...byId.values()]
}

export interface PausedFrame {
  panelId: string
  line: string
  keys: string
}

export interface CrashFrame {
  panelId: string
  title: string
  explain: string
  kept: string
  restart: string
  log: string
  prompt: string | null
}

export interface OfflineFrame {
  source: 'github' | 'jira'
  line: string
}

export interface RecoveryView {
  banner: string | null
  retry: string | null
  reconnect: string
  details: string
  detailsOpen: boolean
  paused: PausedFrame[]
  reattaching: { panelId: string }[]
  crashes: CrashFrame[]
  offline: OfflineFrame[]
  pill: string
  bootIssue: string | null
  showDetails: PaneSnap[]
}

export function viewOf(model: RecoveryModel, now: number): RecoveryView {
  const holding = model.host.phase === 'paused' || model.host.phase === 'reattaching'
  const paused = model.host.phase === 'paused'
    ? model.host.paused.map((pane) => ({ panelId: pane.panelId, line: PAUSED_LINE, keys: PAUSED_KEYS }))
    : []
  const reattaching = model.host.phase === 'reattaching'
    ? model.host.paused.map((pane) => ({ panelId: pane.panelId }))
    : []
  return {
    banner: holding ? hostBanner(model.host.paused.length) : null,
    retry: holding ? retryLabel(model.host.retryAt, now) : null,
    reconnect: RECONNECT_LABEL,
    details: DETAILS_LABEL,
    detailsOpen: model.host.detailsOpen,
    paused,
    reattaching,
    crashes: model.crashes.map(crashFrame),
    offline: offlineFrames(model.offline),
    pill: recoveryPillLine(model.crashes.length, holding ? model.host.paused.length : 0),
    bootIssue: model.bootIssue,
    showDetails: holding ? model.host.paused.map((pane) => ({ ...pane })) : []
  }
}

function crashFrame(crash: CrashFact): CrashFrame {
  return {
    panelId: crash.panelId,
    title: CRASH_TITLE,
    explain: explainExit(crash.code),
    kept: KEPT_LINE,
    restart: RESTART_LABEL,
    log: READ_LOG_LABEL,
    prompt: crash.prompt
  }
}

function offlineFrames(offline: RecoveryModel['offline']): OfflineFrame[] {
  const frames: OfflineFrame[] = []
  if (offline.github !== null) frames.push({ source: 'github', line: offlineLine(offline.github) })
  if (offline.jira !== null) frames.push({ source: 'jira', line: offlineLine(offline.jira) })
  return frames
}

export function viewOn(view: RecoveryView): boolean {
  return view.banner !== null || view.crashes.length > 0 || view.offline.length > 0 || view.bootIssue !== null || view.reattaching.length > 0
}

export interface CatalogInput {
  paused: readonly PaneSnap[]
  reattaching: readonly { panelId: string }[]
  crashes: readonly { panelId: string; code: number | null; prompt: string | null }[]
  offline: readonly { source: 'github' | 'jira'; lastUpdated: string }[]
  bootIssue: string | null
  retryInMs: number
}

/**
 * The mockup is a catalog: host loss, a crash and a skeleton are on screen
 * together. One reducer phase is paused or reattaching, not both. The shot
 * paints this view. The transitions stay in `reduceHost`.
 */
export function catalogView(input: CatalogInput): RecoveryView {
  return {
    banner: hostBanner(input.paused.length),
    retry: retryLabel(input.retryInMs, 0),
    reconnect: RECONNECT_LABEL,
    details: DETAILS_LABEL,
    detailsOpen: false,
    paused: input.paused.map((pane) => ({ panelId: pane.panelId, line: PAUSED_LINE, keys: PAUSED_KEYS })),
    reattaching: input.reattaching.map((pane) => ({ panelId: pane.panelId })),
    crashes: input.crashes.map((crash) => crashFrame(crash)),
    offline: input.offline.map((row) => ({ source: row.source, line: offlineLine(row.lastUpdated) })),
    pill: recoveryPillLine(input.crashes.length, input.paused.length),
    bootIssue: bootIssueSentence(input.bootIssue === null ? [] : [input.bootIssue]),
    showDetails: input.paused.map((pane) => ({ ...pane }))
  }
}
