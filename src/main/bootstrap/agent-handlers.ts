import { join } from 'node:path'
import { statSync, readFileSync } from 'node:fs'
import { app, clipboard } from 'electron'
import { expandTilde, resolveCwd } from '../pty-manager'
import { resolveSandboxCwd, disposeSandbox, realSandboxFs } from '../sandbox'
import { fsRealpath, sandboxTeammateRefusal } from '../places'
import { skillsForBrief, skillsBriefLine, repoRootForBrief } from '../skill-assign'
import { resolveAttachment, ATTACHMENT_MAX_BYTES } from '../attachments'
import { writeClipboardImage } from '../clipboard-file'
import { importClaudeTranscript } from '../claude-transcript-import'
import { resolveTranscript } from '../transcript-reader'
import { RATE_LIMIT_NONE, windowUtilization } from '../../shared/rate-limit'
import { BACKENDS, backendOf, type AgentBackend } from '../../shared/agent-backends'
import { type AgentCreateResult, type AgentSessionSpec } from '../../shared/agent-session'
import type { AgentHandlers } from '../ipc'
import type { Places } from './places'
import type { Stores } from './stores'
import type { MainState } from './context'

/**
 * M73. The chat panel's verbs over the runtime and the transcript log.
 *
 * `create` refuses BY NAME before any process exists: a directory that is not
 * there (a file is refused too, spawn-request.ts's rule) and a CLI the probe
 * did not find — the two facts a first send would otherwise discover as an
 * `exited` session with an ENOENT in its stderr.
 *
 * Every arm reads `state.agents` at CALL time rather than closing over the
 * manager: these handlers are built before `app.whenReady()` has constructed
 * it, and "the agent runtime has not started yet" is the refusal for the
 * window in between — not a permanent state to be captured.
 */
export function createAgentHandlers(state: MainState, stores: Stores, places: Places): AgentHandlers {
  const { layoutStore, agentTranscripts, ptyManager, captureBaseline, dropBaseline } = stores

  return {
    create: (spec: AgentSessionSpec): AgentCreateResult => {
      const manager = state.agents
      if (manager === null) return { kind: 'refused', reason: 'the agent runtime has not started yet' }
      // M99. Refused by the backend's ROW: the probe's path for that binary,
      // and the row's own `noCli` sentence. A lookup, never a switch.
      const backend = backendOf(spec)
      const cliPath: Record<AgentBackend, string | null> = { claude: state.claudePath, codex: state.codexPath, copilot: state.copilotPath, acp: state.copilotPath }
      if (cliPath[backend] === null) return { kind: 'refused', reason: BACKENDS[backend].reasons.noCli }
      // M120. A chat with NO place: the app's own folder, made here; the Places
      // gate is bypassed BY CONSTRUCTION (the folder is the app's), and a
      // teammate beside it is refused first — a teammate has places.
      const sandboxRefusal = sandboxTeammateRefusal(spec)
      if (sandboxRefusal !== null) return { kind: 'refused', reason: sandboxRefusal }
      let cwd: string
      if (spec.sandbox === true) {
        const made = resolveSandboxCwd(app.getPath('userData'), spec.id, realSandboxFs)
        if (made.kind === 'refused') return { kind: 'refused', reason: made.reason }
        cwd = made.path
      } else {
        // M100. Places first — on the EXPANDED path, before resolveCwd's fallback
        // to home could turn a refused folder into an allowed one silently.
        const place = places.gate.check(spec.teammateId, expandTilde(spec.cwd))
        if (!place.ok) return { kind: 'refused', reason: place.reason }
        cwd = resolveCwd(spec.cwd)
      }
      // M100. The brief rides EVERY spawn from the roster main holds — the
      // renderer never carries it, and a relaunch's re-create gets it again
      // (the M81 supervisor rule, reached for an identity).
      const mate = spec.teammateId === undefined ? undefined : layoutStore.teammates().find((t) => t.id === spec.teammateId)
      // M131. THE ONE APPEND SITE (M100's rule: never a second path, never a
      // renderer-side copy). A project-scoped skill outside this teammate's
      // places is dropped here — never named to the agent — because "You
      // can use X" for a skill it cannot read would be worse than silence.
      // M131 fix round 1. A teammate chat's cwd is often a worktree LANE
      // (M113's board dispatch), never the repository — the SAME
      // translation `placesGate` already applies via `worktreeRootOf`, so a
      // project skill whose repository IS in this teammate's places is not
      // silently dropped just because the chat runs in a lane of it.
      const skillsRepoRoot = repoRootForBrief(cwd, places.laneRootOf)
      const skillsLine = mate === undefined ? '' : skillsBriefLine(skillsForBrief(mate, skillsRepoRoot, fsRealpath).named)
      const mateText = mate !== undefined && (mate.brief.trim() !== '' || skillsLine !== '')
        ? `You are ${mate.name}.${mate.brief.trim() !== '' ? ` ${mate.brief.trim()}` : ''}${skillsLine}`
        : undefined
      const brief = mateText !== undefined ? { appendSystemPrompt: [spec.appendSystemPrompt, mateText].filter((x): x is string => x !== undefined && x !== '').join('\n\n') } : {}
      let isDir = false
      try { isDir = statSync(cwd).isDirectory() } catch { isDir = false }
      if (!isDir) return { kind: 'refused', reason: `no such directory: ${spec.cwd}` }
      const snapshot = manager.create({ ...spec, cwd, ...brief })
      // M77. The SAME capture PtyManager fires, keyed by the chat's panel id,
      // so review:panel / review:baseline / review:at answer for a chat with
      // no change to the engine. The store's once-only guard makes a
      // relaunch's re-create a no-op.
      captureBaseline(spec.id, cwd)
      // M76. A reloaded renderer re-creates every chat by id; a question
      // still pending must light its attention surfaces again.
      state.approvals?.resync(spec.id)
      return { kind: 'created', snapshot }
    },
    // M75. Attachments are resolved HERE (the renderer has no fs): every one
    // must decode or the send is refused whole, naming the one that could not.
    send: (id, text, attachments) => {
      const images: { mediaType: string; base64: string; name: string }[] = []
      for (const attachment of attachments) {
        const resolved = resolveAttachment(attachment)
        if (resolved.kind === 'refused') return { refused: resolved.reason }
        images.push({ mediaType: resolved.mediaType, base64: resolved.base64, name: resolved.name })
      }
      const answer = state.agents?.send(id, text, images) ?? 'no-session'
      // M118. Every refusal in the SESSION's row's words — the first cut answered codex's for every backend.
      const row = BACKENDS[state.agents?.get(id)?.backend ?? 'claude']
      if (answer === 'refused-backend') return { refused: row.reasons.noCli }
      if (answer === 'refused-sandbox') return { refused: row.reasons.noSandbox }
      if (answer === 'refused-images') return { refused: row.reasons.noImages }
      // M82. The ceiling refuses BY NAME with the fix, in dollars the user set.
      if (answer === 'refused-budget') {
        const windowPct = Number(layoutStore.getSetting('agents.budgetWindowPercent')) || 0
        const util = windowUtilization(state.agents?.rateLimit() ?? RATE_LIMIT_NONE)
        if (windowPct > 0 && util !== undefined && util >= windowPct / 100) {
          return { refused: `over the ${windowPct}% usage-window budget for this canvas — raise agents.budgetWindowPercent in settings, or wait for a window to reset` }
        }
        const limit = Number(layoutStore.getSetting('agents.budgetUsd')) || 0
        return { refused: `over the $${limit.toFixed(2)} budget for this canvas — raise it in settings, or start a new canvas` }
      }
      return answer
    },
    clipboardImage: () => {
      const image = clipboard.readImage()
      if (image.isEmpty()) return null
      const png = image.toPNG()
      // Capped BEFORE it crosses the bridge, with the cap the send would apply.
      if (png.length > ATTACHMENT_MAX_BYTES) return { refused: `the clipboard image is larger than the ${Math.round(ATTACHMENT_MAX_BYTES / (1024 * 1024))} MB attachment cap` }
      return { mediaType: 'image/png', base64: png.toString('base64'), size: png.length }
    },
    // M145. The clipboard image as a FILE, for a terminal: the read is here
    // (Electron's clipboard), the write and the cap are the module's.
    clipboardFile: () => writeClipboardImage({
      dir: join(app.getPath('userData'), 'attachments'),
      now: () => Date.now(),
      image: () => { const image = clipboard.readImage(); return image.isEmpty() ? null : image.toPNG() }
    }),
    interrupt: (id) => state.agents?.interrupt(id) ?? false,
    dispose: ({ id, drop }) => {
      state.agents?.dispose(id)
      // M120. The sandbox folder goes with the chat — on dispose, never on exit.
      if (drop) { agentTranscripts.drop(id); dropBaseline(id); disposeSandbox(app.getPath('userData'), id, realSandboxFs) }
    },
    // M98. `scope: 'session'` GRANTS the pending request's tool first, then
    // answers through the one `answerPermission` — the grant is keyed by the
    // tool name main holds in its own pending record, never by a name the
    // renderer sent. A deny never grants, whatever the scope says.
    answer: ({ id, requestId, answer, scope }) => {
      const toolName = scope === 'session' && answer.allow ? state.agents?.get(id)?.pending.find((p) => p.requestId === requestId)?.toolName : undefined
      // M119. The grant goes FIRST so the answer itself can carry the vendor's
      // word for it (ACP's allow_always — the manager reads preAnswer when it
      // writes). `toolName` is defined only when the request is really PENDING
      // in main's own record, so a grant for a question the process never heard
      // cannot be minted here (the pending lookup above is the guard).
      if (toolName !== undefined) state.approvals?.grant(id, toolName)
      return state.agents?.answerPermission(id, requestId, answer) ?? false
    },
    grants: (id) => state.approvals?.grantsOf(id) ?? [],
    revokeGrants: (id) => { state.approvals?.revoke(id) },
    // M138. The pool: refused by the runtime's own sentence before it exists.
    poolStart: (req) => state.pool?.start(req) ?? { kind: 'refused', reason: 'the agent runtime has not started yet' },
    poolStop: (req) => state.pool?.stop(req.templateId, req.key) ?? false,
    list: () => state.agents?.list() ?? [],
    transcript: (id) => {
      const read = agentTranscripts.read(id)
      return { turns: read.turns, snapshot: state.agents?.get(id) ?? null, ...(read.meta === undefined ? {} : { meta: read.meta }) }
    },
    // M74. Open a terminal's session as a chat. Three refusals, each named
    // for its fix; the live check is the one-front-end-at-a-time rule.
    // M97. Main counts, main stops: the request carries a mode and an optional
    // task; the limit is the mode's unless the caller lowers it.
    autoStart: (req) => state.agents?.startAuto(req.id, { mode: req.mode, task: req.task, limit: req.limit }) ?? { kind: 'refused', reason: 'the agent runtime is not available' },
    autoStop: (id) => state.agents?.stopAuto(id) ?? false,
    importSession: ({ fromPanelId, toPanelId }) => {
      const sessionId = layoutStore.session(fromPanelId)
      if (sessionId === undefined) return { kind: 'refused', reason: 'that terminal was not started as a claude session — start one from the Claude preset' }
      if (ptyManager.list().some((s) => s.panelId === fromPanelId)) return { kind: 'refused', reason: 'stop the terminal first — one front-end at a time' }
      const path = resolveTranscript(sessionId)
      if (path === undefined) return { kind: 'refused', reason: 'claude has not written a transcript for that session yet' }
      let text: string
      try { text = readFileSync(path, 'utf8') } catch { return { kind: 'refused', reason: 'that session\'s transcript could not be read' } }
      const imported = importClaudeTranscript(text)
      agentTranscripts.drop(toPanelId)
      for (const turn of imported.turns) agentTranscripts.appendTurn(toPanelId, turn)
      agentTranscripts.appendMeta(toPanelId, imported.meta)
      return { kind: 'imported', sessionId, turns: imported.meta.turns }
    }
  }
}
