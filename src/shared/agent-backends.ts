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
export type AgentBackend = 'claude' | 'codex'

/** Registry order — the spawn sheet's row order, and the union's, so a new backend is one row here. */
export const BACKEND_IDS: readonly AgentBackend[] = ['claude', 'codex']

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
    reasons: {
      noCli: 'claude was not found on the login PATH — install it, or check the environment report',
      noInterrupt: 'nothing is answering — there is no turn to interrupt',
      noImages: 'claude takes images — this message could not be decoded',
      noTerminal: 'a claude chat continues in a terminal as claude --resume',
      noPermissions: 'claude asks before a tool runs — a grant answers that question for the session'
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
    reasons: {
      noCli: 'codex was not found on the login PATH — install it, or check the environment report',
      noInterrupt: 'codex has no interrupt — close the panel to stop it',
      noImages: 'codex takes no images here — reference a file by its path instead',
      noTerminal: 'a codex chat continues only here — the terminal door is claude --resume',
      noPermissions: 'codex asks no permission here — its sandbox policy decides'
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
