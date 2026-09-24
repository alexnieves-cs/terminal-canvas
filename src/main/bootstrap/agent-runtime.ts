import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { AgentSessionManager } from '../agent-session'
import { claudeCliRunner } from '../claude-cli-runner'
import { createPoolCaller } from '../pool-caller'
import { createJobHandlers, type JobHandlers } from '../job-recovery'
import type { RepoMark } from '../../shared/job-journal'
import { createApprovalTracker } from '../approvals'
import { expandTilde } from '../pty-manager'
import { requestFromRendererWith } from '../ipc'
import { resolveTranscript } from '../transcript-reader'
import { windowUtilization } from '../../shared/rate-limit'
import { IPC_EVENTS, type PoolMintReply, type PoolMintRequest } from '../../shared/ipc-contract'
import type { PanelTokens, MainState } from './context'
import type { Stores } from './stores'

/**
 * M71/M76/M138. The agent runtime, its approval tracker and the pool caller —
 * built together because they are one cycle: the manager asks the tracker for
 * a pre-answered grant, the tracker subscribes to the manager's events, and
 * the pool folds the manager's own cumulative spend.
 *
 * Called from `app.whenReady()` AFTER the env probe, for the reason the
 * PtyManager is: the manager needs the login environment (how the CLI finds
 * its login and its config) and the CLI's resolved path. It writes all three
 * back onto `state`, which is where every handler reads them from.
 */
export function startAgentRuntime(state: MainState, stores: Stores, tokens: PanelTokens): void {
  const { layoutStore, agentTranscripts, attention, controlSocketPath, launcherDir } = stores
  const env = state.loginEnv

  // The bare name is kept when the probe found nothing: the spawn then fails
  // with ENOENT and the session reads `exited` with the reason in its stderr
  // tail, which is a named failure. M72 disables the chat verb by name before
  // it gets that far.
  const agents = new AgentSessionManager({
    runner: claudeCliRunner,
    command: state.claudePath ?? 'claude',
    // M90. Present only when found: an absent codex makes a codex send
    // `refused-backend`, never a spawn of a bare name that ENOENTs.
    ...(state.codexPath === null ? {} : { codex: { command: state.codexPath } }),
    // M118/M119. Present only when found, like codex: the copilot binary serves both its JSONL row and its ACP row.
    ...(state.copilotPath === null ? {} : { binaries: { copilot: { command: state.copilotPath }, acp: { command: state.copilotPath } } }),
    hasTurns: (id) => agentTranscripts.read(id).turns.length > 0,
    env,
    newSessionId: () => randomUUID(),
    // M73. Whether the CLI already holds a transcript for a session id —
    // M17's glob, so a restored chat panel that has had a turn resumes and
    // one that never did pins. Decided at spawn, never persisted.
    transcriptExists: (sessionId) => resolveTranscript(sessionId) !== undefined,
    // M82. Read LIVE, like every other setting the manager consults: a ceiling
    // raised in the palette must take effect on the next send.
    limits: () => ({
      maxConcurrent: Number(layoutStore.getSetting('agents.maxConcurrent')) || 0,
      budgetUsd: Number(layoutStore.getSetting('agents.budgetUsd')) || 0,
      budgetWindowPercent: Number(layoutStore.getSetting('agents.budgetWindowPercent')) || 0
    }),
    // M98. Resolved at CALL time through `state.approvals`: the tracker is
    // created after the manager (it subscribes to it), so a captured
    // reference here would be null for the life of the app.
    preAnswer: (id, toolName) => state.approvals?.granted(id, toolName) ?? false
    ,
    // M102. Each headless session gets the door and its OWN panel id and token
    // — the same block PtyManager gives a terminal — so `tc api` from a chat
    // is that chat's, never a claim.
    envFor: (id) => ({
      ...env,
      TC_CONTROL_SOCKET: controlSocketPath,
      TC_PANEL_ID: id,
      TC_PANEL_TOKEN: tokens.of(id),
      PATH: env['PATH'] === undefined || env['PATH'] === '' ? launcherDir : `${launcherDir}:${env['PATH']}`
    })
  })
  state.agents = agents

  // M138. The pool's production caller. The list is read HERE (main's, like
  // every file the app reads for an agent; absolute path only, no Places
  // gate — a pool has no teammate, and the file is the user's own), the mint
  // is the RENDERER's over an ephemeral reply (board:add's shape, with a
  // longer wait: a chat is created over IPC before it has an id), the
  // ceilings are M82's read live, and the spend is the sum of the sessions'
  // own cumulative figures, the same fold the manager's ceiling reads (M82)
  // — one rule, two readers.
  state.pool = createPoolCaller({
    agents,
    mint: (req) => {
      const wc = state.window?.webContents
      if (!wc) return Promise.resolve({ kind: 'refused' as const, reason: 'no window to mint the worker in' })
      return requestFromRendererWith<PoolMintReply, PoolMintRequest>(wc, IPC_EVENTS.POOL_MINT, req, { kind: 'refused', reason: 'the canvas did not answer in time' }, 20000)
    },
    readList: (listPath) => {
      const expanded = expandTilde(listPath)
      if (!expanded.startsWith('/')) return { kind: 'error', why: `${listPath} is not an absolute path` }
      try {
        // One item per non-empty line; a `#` line is a comment, so a list can say what it is.
        const items = readFileSync(expanded, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l !== '' && !l.startsWith('#'))
        return items.length === 0 ? { kind: 'error', why: `${listPath} holds no items` } : { kind: 'ok', items }
      } catch (error) {
        return { kind: 'error', why: error instanceof Error ? error.message : String(error) }
      }
    },
    limits: () => ({
      maxConcurrent: Number(layoutStore.getSetting('agents.maxConcurrent')) || 0,
      budgetUsd: Number(layoutStore.getSetting('agents.budgetUsd')) || 0,
      budgetWindowPercent: Number(layoutStore.getSetting('agents.budgetWindowPercent')) || 0
    }),
    spend: () => agents.list().reduce((sum, snap) => sum + (snap.costUsd ?? 0), 0),
    windowUtil: () => windowUtilization(agents.rateLimit()),
    emit: (event) => { state.window?.webContents.send(IPC_EVENTS.POOL_EVENT, event) },
    // M316. Every transition written through to userData/jobs.json, so a
    // crash, a quit or a closed window leaves a job a person can recover.
    journal: {
      get: (id) => stores.jobs.get(id),
      put: (job) => stores.jobs.put(job),
      update: (id, f) => stores.jobs.update(id, f),
      newId: () => `job-${randomUUID().slice(0, 8)}`,
      now: Date.now,
      repoMark: (cwd) => repoMarkOf(stores, cwd)
    }
  })

  // M76. A pending permission is `needs you` on the terminal's own channel,
  // decided here in main — the renderer's store is a cache of this, never a
  // second author. The label is the chat's directory name.
  const approvals = createApprovalTracker({
    sink: attention.forAgents,
    emitState: (panelId, agentState) => { state.window?.webContents.send(IPC_EVENTS.AGENT_STATE, { panelId, state: agentState }) },
    label: (id) => { const cwd = agents.get(id)?.cwd ?? id; return cwd.replace(/\/+$/, '').split('/').pop() || cwd }
  })
  state.approvals = approvals

  // M73. The durable transcript, written from the manager's own events so
  // the renderer never has to echo a turn back; and every event forwarded
  // to the renderer on ONE channel, already batched at the manager.
  agents.subscribe((event) => {
    approvals.apply(event)
    if (event.type === 'turn') agentTranscripts.appendTurn(event.id, event.turn)
    if (event.type === 'result') {
      const snap = agents.get(event.id)
      if (snap) agentTranscripts.appendMeta(event.id, { usage: snap.usage, costUsd: snap.costUsd, turns: snap.turns })
    }
    state.window?.webContents.send(IPC_EVENTS.AGENT_EVENT, event)
  })
}

/** M316. The repository under `cwd` as the job account compares it: HEAD and a count of uncommitted paths. */
async function repoMarkOf(stores: Stores, cwd: string): Promise<RepoMark | null> {
  const dir = expandTilde(cwd)
  const head = await stores.gitRunner(['-C', dir, 'rev-parse', 'HEAD'])
  if (!head.ok) return null
  const status = await stores.gitRunner(['-C', dir, 'status', '--porcelain'])
  if (!status.ok) return null
  return { head: head.stdout.trim(), dirty: status.stdout.split('\n').filter((l) => l.trim() !== '').length }
}

/**
 * M316. The recovery doors over the journal. `state.pool` is read at the point
 * of USE (bootstrap/context.ts's rule): these are built before the agent
 * runtime starts, and a captured null would refuse every recovery for ever.
 */
export function createJobDoors(state: MainState, stores: Stores): JobHandlers {
  return createJobHandlers({
    store: stores.jobs,
    pool: () => state.pool,
    transcript: (workerId) => {
      const meta = stores.agentTranscripts.read(workerId).meta
      return meta === undefined ? null : { turns: meta.turns, ...(meta.costUsd === undefined ? {} : { costUsd: meta.costUsd }) }
    },
    repoNow: (cwd) => repoMarkOf(stores, cwd)
  })
}
