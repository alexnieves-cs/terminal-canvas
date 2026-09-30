/**
 * Every refusal sentence the palette can show, and the four preset-availability
 * probes the chat doors share.
 *
 * Reasons are exported so the checks assert the same strings the user reads,
 * rather than a paraphrase that can drift away from the UI — that is the whole
 * reason this is a module and not a set of inline literals.
 */
import { notConnectedReason } from '@shared/credential-schema'
import { REASON_CHAT_NO_CLAUDE } from '@renderer/chat/chat-model'
import type { AgentBackend } from '@shared/agent-session'
import type { PresetRow } from './row-types'

export const REASON_NO_FOCUS = 'click into a panel first'
/**
 * M399 (A10). The same refusal while something IS selected: the HUD says
 * "1 selected" and these rows act on the panel the keyboard is in, so the
 * sentence says selecting is not that (commands.ts's closing pass).
 */
export const REASON_NO_FOCUS_SELECTED = 'selecting a panel is not focusing it — click into it first'
export const REASON_NO_SELECTION = 'select some text in a panel first'
export const REASON_BUILT_IN_RENAME = "built-in presets can't be renamed"
export const REASON_BUILT_IN_DELETE = "built-in presets can't be deleted"
export const REASON_PROJECT_PROMPT = 'this prompt is a file in your project'
export const REASON_NOT_ON_PATH = 'not found on PATH'
/** M253. A pack preset refused until read — the row beside it is where reading happens. */
export const REASON_UNREAD_PRESET = 'from a pack, not read yet — choose "I\'ve read this preset" first'
/** M49. A font size belongs to a terminal; the other kinds set their own text. */
export const REASON_NOT_TERMINAL = 'only a terminal panel has a font size'
/**
 * M399 (A10). The prompt-mark rows (Previous/Next prompt, Copy last command's
 * output) borrowed the font-size sentence above, so a note said it had no
 * font size when asked for its last command. Their own fact: the marks are a
 * shell's, and only a terminal has one.
 */
export const REASON_NOT_TERMINAL_MARKS = 'only a terminal panel marks its commands'
/** M50. One panel has nothing to be tidied against. */
export const REASON_TIDY_NEEDS_TWO = 'needs two panels on the canvas'
export const REASON_NOT_TERMINAL_OUTPUT = 'only a terminal panel has output to export'
/**
 * M112 (review round 1, CRITICAL 2). Renamed from REASON_SCROLLBACK_OFF: the
 * row is no longer refused just because scrollback is off — a spawned
 * panel exports from its live buffer instead (M112). What is STILL
 * genuinely refusable is a panel with `spawned !== true` AND scrollback
 * off: neither source has anything to give.
 *
 * Final review, MINOR: the sentence used to say "this panel has never
 * started", which is untrue for a DORMANT panel restored from a saved
 * layout — `registry.get(id).spawned` reads false until the panel is
 * woken, even though a real tmux session is running behind it and would
 * answer with scrollback if this row let it try. "hasn't been opened in
 * this window" is true in both the genuinely-fresh case and the
 * dormant-but-alive one, and the fix named is unchanged either way.
 */
export const REASON_NOTHING_TO_EXPORT = "this panel hasn't been opened in this window, and scrollback is off — turn on scrollback.persist in Settings, or open the panel first"
export const REASON_ALREADY_DEFAULT = 'already the default'
/** M37. Three distinct reasons, never one shared "unavailable". */
export const REASON_BUILT_IN_WORKTREE = "built-in presets can't be changed — save a panel as a preset first"
export const REASON_NO_REVIEW_TARGET_ACROSS = 'select a panel inside a repository first'
export const REASON_NO_GITHUB = notConnectedReason('github')
export const REASON_NO_WORKTREES = 'no worktrees yet — spawn a panel from a preset that asks for one'
export const REASON_WORKTREE_ATTACHED = 'a panel is still running in it — close that panel first'
/** M42. Search's two failure states, distinct so the user gets the right fix. */
export const REASON_SEARCH_OFF = 'terminal output is not being kept — turn on Keep recent output on disk; chats still answer'
export const REASON_SEARCH_NO_MATCHES = 'try another word'
export const REASON_NO_PROMPTS = 'no prompts saved yet'
export const REASON_ALREADY_ACTIVE = 'already the active workspace'
export const REASON_NOT_STARTED = 'that panel has not started'
/**
 * M20. A THIRD distinct blocked situation for the mode rows, beside
 * REASON_NO_FOCUS and REASON_NOT_STARTED. Its fix is different from both:
 * not "click a panel" and not "start this one", but "this panel is not
 * running an agent CLI this app knows the flags for". agentArgs is gated on
 * spec.agent, so offering the verb here would promise a flag that is never
 * emitted — a row that appears to work and silently does nothing.
 */
export const REASON_NOT_AN_AGENT = 'that panel is not running a known agent'
// Deliberately NOT REASON_NO_SELECTION, which is about a TEXT selection inside
// a panel (the save-prompt row). Two different selections with two different
// gestures: collapsing them would tell a user who has selected text that they
// need to select text, which sends them to do the thing they already did.
export const REASON_NO_PANELS_SELECTED = 'select panels with a rubber-band drag first'
export const REASON_GROUP_NEEDS_TWO = 'select at least two panels to make a group'
/**
 * M61. Its own reason, not REASON_NO_FOCUS: the fix is "put this panel in a
 * group", which is a different gesture from "click a panel".
 */
export const REASON_NOT_IN_GROUP = 'the focused panel is not in a group'
/**
 * The merged view is read-only, so the move rows refuse there.
 *
 * An EXPORTED constant, like every reason above it, so that a check CAN
 * compare against the constant rather than against the literal — the rule
 * verify:palette 66b records, where a reason asserted as a string literal
 * keeps passing while the text the user actually reads says something else
 * entirely. Be honest about the tense: nothing imports this one yet. No check
 * asserts this reason today, and the export is what makes writing one a
 * one-line import rather than a temptation to paste the sentence.
 */
export const REASON_MERGED_READ_ONLY = 'the merged view is read-only — leave it to move panels'
export const REASON_NOTHING_TO_LINK = 'this canvas has only one panel'
export const REASON_BROADCAST_NEEDS_TWO = 'select at least two live terminal panels'
/**
 * Its OWN reason rather than REASON_NO_FOCUS, because the fix is different:
 * a note is rooted on the SELECTED panel, and selecting one is not the same
 * gesture as focusing one — a rail click does the first and never the second.
 * Telling a user to click into a panel when what they need is to select one
 * sends them to the wrong gesture.
 */
export const REASON_NO_NOTE_ROOT = 'select a panel first — a note is saved in its directory'
/** M73. One sentence for the palette row, the launcher line and the composer. */
export const REASON_NO_CLAUDE = REASON_CHAT_NO_CLAUDE
/** M74. The two front-end verbs' refusals, each naming its fix. */
export const REASON_TERMINAL_LIVE = 'stop the terminal first — one front-end at a time'
export const REASON_NOT_CLAUDE_SESSION = 'only a terminal started as a claude session can open as chat'
export const REASON_CHAT_BUSY = 'the chat is still answering — interrupt it first'
export const REASON_CHAT_EMPTY = 'send a message first — an empty chat has nothing to move'
export const REASON_NOT_CHAT = 'only a chat panel can open in a terminal'
/** M77. A chat with no baseline yet: the review row's own reason. */
export const REASON_NO_SELECTION_TEMPLATE = 'select the panels to save first'
/** M80. No template is saved yet — the row still says so rather than vanishing. */
/** M83. Outside a repository there is nothing to remember about. */
export const REASON_NO_WATCH_ROOT = 'select a panel first — a watcher runs its command in that panel\'s directory'
export const REASON_NO_REPO_MEMORY = 'open a panel inside a repository first — memory is kept per repository'
/** M80. No template is saved yet — the row still says so rather than vanishing. */
export const REASON_NO_TEMPLATES = 'no templates yet — select some panels and save them as one'
/** M77. A chat with no baseline yet: the review row's own reason. */
export const REASON_CHAT_NO_BASELINE = 'send a message first — a chat has no baseline until its agent runs'
/** M76. The one disabled row when nothing pends. */
export const REASON_NO_APPROVALS = 'no agent is asking for permission'
/** M73. Whether a claude preset is available — the one fact the three chat doors share. */
export function claudeAvailable(presets: readonly PresetRow[]): boolean {
  return presets.some((p) => p.agent === 'claude-code' && p.available)
}

/** M90. The same fact for codex — the built-in codex preset's probe. */
export function codexAvailable(presets: readonly PresetRow[]): boolean {
  return presets.some((p) => p.agent === 'codex' && p.available)
}

/** M118. The same fact for copilot — the built-in copilot preset's probe; the acp row shares the binary. */
export function copilotAvailable(presets: readonly PresetRow[]): boolean {
  return presets.some((p) => p.agent === 'copilot' && p.available)
}

/** M99. The fact by ROW: a panel asks for its own backend's availability without naming one. */
export function backendAvailable(presets: readonly PresetRow[], backend: AgentBackend): boolean {
  const probes: Record<AgentBackend, (rows: readonly PresetRow[]) => boolean> = { claude: claudeAvailable, codex: codexAvailable, copilot: copilotAvailable, acp: copilotAvailable }
  return probes[backend](presets)
}