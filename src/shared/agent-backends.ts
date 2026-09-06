/**
 * M99. THE BACKEND REGISTRY — one row per headless CLI, and the ONE table
 * every consumer reads. M90 landed the second backend as a set of
 * is-it-codex switches spread over the manager, the composer, the panel
 * chrome, the palette row, the copy sites and main's create; each was
 * correct, and each was a place a third backend would have to be threaded
 * through by hand, with `tsc` saying nothing about the one that was missed
 * (a boolean on a switch defaults to claude's behaviour, silently).
 *
 * A capability here is a FACT about the CLI, measured (M71's and M90's
 * recorded streams), never a preference: `interrupts` is whether the CLI has
 * an interrupt door at all, `asksPermission` whether its stream carries a
 * permission request the host answers, `oneProcessPerTurn` whether the prompt
 * is an argument (so the process exits when the turn does), `closeStdin`
 * whether an open pipe blocks it, `adoptsThreadId` whether the CLI mints the
 * conversation id (so the first stream is where the session learns what a
 * resume must name). Every named reason lives beside the capability it
 * explains, so a control disabled by the capability names the fix in the
 * vendor's own words.
 *
 * `verify:agent-session registry.1` greps `src/` and fails the build if any
 * file but the layout parser compares `backend` to a literal member: the
 * parser needs the literal (absent-vs-malformed), nothing else does.
 * `registry.2` pins the rows' shape and that `AGENT_CAPABILITIES.headless`
 * is derived from here rather than written twice.
 *
 * Pure: no `electron`, no `node:fs`, no import of a value from `cost.ts`
 * (cost.ts imports THIS, for `headless`; a value the other way is a cycle
 * esbuild resolves to `undefined` at module scope, with no error).
 */

/** M90. Which headless CLI answers. Absent on a record is claude — every pre-M90 file. */
export type AgentBackend = 'claude' | 'codex' | 'copilot' | 'acp'

/** Registry order — the spawn sheet's row order, and the union's, so a new backend is one row here. */
export const BACKEND_IDS: readonly AgentBackend[] = ['claude', 'codex', 'copilot', 'acp']

/** What an absent `backend` means, named once: every pre-M90 record. */
export const DEFAULT_BACKEND: AgentBackend = 'claude'

export interface BackendDef {
  id: AgentBackend
  /** The word the chrome, the sheet's row and every sentence use. */
  label: string
  /** The binary main probes for on the login PATH. */
  binary: string
  /** Whether a later spawn can name an earlier conversation (`--resume` / `exec resume`). */
  resumes: boolean
  /** Whether the CLI has an interrupt door. False means the only stop is a kill, named as such. */
  interrupts: boolean
  /** Whether a message can carry an image block. */
  images: boolean
  /** Whether the CLI reports a dollar figure of its own. False means no cost is ever claimed. */
  reportsCost: boolean
  /** Whether the stream carries permission requests the host answers. False means its own policy decides. */
  asksPermission: boolean
  /** Whether a chat can continue in a terminal (`claude --resume`). */
  terminalDoor: boolean
  /** The prompt is an ARGUMENT: one process per turn, exiting when the turn does. */
  oneProcessPerTurn: boolean
  /** An open stdin blocks the process — close it at spawn. */
  closeStdin: boolean
  /** The CLI mints the conversation id; the first stream is where the session learns it. */
  adoptsThreadId: boolean
  /** M118. The CLI has a flag for an appended system prompt. False means a supervisor, a routine or a dispatched lane would silently not be one — the three doors refuse by name. */
  appendsPrompt: boolean
  /** M119. The process speaks a handshake before its first prompt (ACP's initialize → session/new); the manager holds the first send until it answers. */
  handshake: boolean
  /** M120. The tool-denying argv for a chat with no folder. Absent means the row DECLINES chat mode by name (`reasons.noSandbox`). */
  sandboxArgs?: readonly string[]
  /** M120. A closed list of model names where the CLI has one; absent means free text. */
  models?: readonly string[]
  reasons: {
    /** The CLI was not found on the login PATH. */
    noCli: string
    /** Shown on a disabled Interrupt. */
    noInterrupt: string
    /** Shown when a message would carry an image. */
    noImages: string
    /** Shown on the disabled terminal door. */
    noTerminal: string
    /** Shown where a permission grant would go. */
    noPermissions: string
    /** M118. Shown on the supervisor row, the routine mint and the dispatch verb when the row cannot carry a prompt. */
    noPrompt: string
    /** M120. Shown on the `New chat (no folder)` door for a row with no read-only mode. */
    noSandbox: string
  }
}

/**
 * The rows. The sentences are M90's own, moved here unchanged — several
 * checks regex them, and `shared/agent-session.ts` keeps the old exported
 * names as aliases of these so no caller had to change.
 */
export const BACKENDS: Readonly<Record<AgentBackend, BackendDef>> = {
  claude: {
    id: 'claude',
    label: 'claude',
    binary: 'claude',
    resumes: true,
    interrupts: true,
    images: true,
    reportsCost: true,
    asksPermission: true,
    terminalDoor: true,
    oneProcessPerTurn: false,
    closeStdin: false,
    adoptsThreadId: false,
    appendsPrompt: true,
    handshake: false,
    // Plan mode: read-only, no edits, no shell writes — the one flag that makes a chat with no folder safe.
    sandboxArgs: ['--permission-mode', 'plan'],
    reasons: {
      noCli: 'claude was not found on the login PATH — install it, or check the environment report',
      noInterrupt: 'nothing is answering — there is no turn to interrupt',
      noImages: 'claude takes images — this message could not be decoded',
      noTerminal: 'a claude chat continues in a terminal as claude --resume',
      noPermissions: 'claude asks before a tool runs — a grant answers that question for the session',
      noPrompt: 'claude takes an appended prompt',
      noSandbox: 'claude has plan mode'
    }
  },
  codex: {
    id: 'codex',
    label: 'codex',
    binary: 'codex',
    resumes: true,
    interrupts: false,
    images: false,
    reportsCost: false,
    asksPermission: false,
    terminalDoor: false,
    oneProcessPerTurn: true,
    closeStdin: true,
    adoptsThreadId: true,
    appendsPrompt: false,
    handshake: false,
    sandboxArgs: ['--sandbox', 'read-only'],
    reasons: {
      noCli: 'codex was not found on the login PATH — install it, or check the environment report',
      noInterrupt: 'codex has no interrupt — close the panel to stop it',
      noImages: 'codex takes no images here — reference a file by its path instead',
      noTerminal: 'a codex chat continues only here — the terminal door is claude --resume',
      noPermissions: 'codex asks no permission here — its sandbox policy decides',
      noPrompt: 'codex takes no appended prompt — a supervisor, a routine or a dispatched lane would silently not be one',
      noSandbox: 'codex has a read-only sandbox'
    }
  },
  // M118. Measured 2026-09-06 against GitHub Copilot CLI 1.0.83
  // (`scripts/fixtures/agent-session/copilot/*.jsonl`): one process per turn
  // with the prompt as `-p`; the stream states NO session id (`parentId`
  // chains the previous event), so the HOST pins one with `--session-id` and
  // resumes with `--resume=` — claude's shape behind codex's process model.
  // `--allow-all-tools` is "required for non-interactive mode", so no
  // permission ever reaches the host. Usage is credits, never dollars.
  copilot: {
    id: 'copilot',
    label: 'copilot',
    binary: 'copilot',
    resumes: true,
    interrupts: false,
    images: false,
    reportsCost: false,
    asksPermission: false,
    terminalDoor: false,
    oneProcessPerTurn: true,
    closeStdin: true,
    adoptsThreadId: false,
    appendsPrompt: false,
    handshake: false,
    // Denial rules outrank --allow-all-tools (`copilot help permissions`).
    sandboxArgs: ['--deny-tool', 'shell', '--deny-tool', 'write'],
    // The fixtures' own `availableModels`, plus `auto` (the CLI's router).
    models: ['auto', 'claude-haiku-4.5', 'gpt-5-mini', 'mai-code-1.1-flash'],
    reasons: {
      noCli: 'copilot was not found on the login PATH — install it, or check the environment report',
      noInterrupt: 'copilot has no interrupt — close the panel to stop it',
      noImages: 'copilot takes an image only as a file path — reference it by its path instead',
      noTerminal: 'a copilot chat continues only here — the terminal door is claude --resume',
      noPermissions: 'copilot asks no permission here — every tool runs on its own policy (--allow-all-tools is required headless)',
      noPrompt: 'copilot takes no appended prompt — a supervisor, a routine or a dispatched lane would silently not be one',
      noSandbox: 'copilot can deny its shell and write tools'
    }
  },
  // M119. Measured 2026-09-06 against `copilot --acp`
  // (`scripts/fixtures/agent-session/acp/*.log`): a RESIDENT process speaking
  // JSON-RPC over stdio; `session/new` mints the id (adopted), `session/load`
  // resumes (`loadSession: true` in initialize's answer), `session/cancel`
  // interrupts, `session/request_permission` asks with allow_once /
  // allow_always / reject_once — the first row whose vendor has M98's grant
  // word. The row is the static promise; the handshake's answer is the
  // measured fact and outranks it (`negotiated` on the snapshot).
  acp: {
    id: 'acp',
    label: 'copilot (acp)',
    binary: 'copilot',
    resumes: true,
    interrupts: true,
    images: true,
    reportsCost: false,
    asksPermission: true,
    terminalDoor: false,
    oneProcessPerTurn: false,
    closeStdin: false,
    adoptsThreadId: true,
    appendsPrompt: false,
    handshake: true,
    reasons: {
      noCli: 'copilot was not found on the login PATH — install it, or check the environment report',
      noInterrupt: 'nothing is answering — there is no turn to cancel',
      noImages: 'copilot (acp) takes images — this message could not be decoded',
      noTerminal: 'a copilot (acp) chat continues only here — the terminal door is claude --resume',
      noPermissions: 'copilot (acp) asks before a command runs — a grant answers allow_always for the session',
      noPrompt: 'copilot (acp) takes no appended prompt — a supervisor, a routine or a dispatched lane would silently not be one',
      noSandbox: 'copilot (acp) has no read-only mode to run a chat with no folder in'
    }
  }
}

/** The backend a spec or record names; absent is claude (every pre-M90 record). */
export function backendOf(spec: { backend?: AgentBackend }): AgentBackend {
  return spec.backend ?? DEFAULT_BACKEND
}

/**
 * The by-name copy sites' one rule for `backend`: absent stays absent, and
 * claude — the default — is never written, so a claude record never grows a
 * key (`verify:panels codex.1` reads the file). Every site that rebuilds a
 * `ChatSource` field-by-field spreads this rather than spelling the test.
 */
export function carryBackend(chat: { backend?: AgentBackend }): { backend?: AgentBackend } {
  const backend = chat.backend
  if (backend === undefined || backend === DEFAULT_BACKEND) return {}
  return { backend }
}
