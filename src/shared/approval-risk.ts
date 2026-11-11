/**
 * M670. HOW RISKY A PERMISSION REQUEST IS — the one judgment every approval
 * door reads, and main reads before it lets a session grant answer.
 *
 * Adopted from Creance's ApprovalPrompt (MIT, © 2026 Amit Shrivastava; see
 * `src/renderer/supervision/NOTICE.md`): a prompt carries a risk, and a
 * HIGH-risk action is confirmed every time, so it never offers "Always
 * allow". Here the broadest grant is M98's `Allow for session`, keyed by
 * session and TOOL — so a grant given to a harmless `Bash ls` would quietly
 * answer `Bash rm -rf ~` later. That is why the rule is enforced twice: the
 * card hides the session verb, and main (`approvals.ts` via `preAnswer`, and
 * the grant in `agent-handlers.ts`) neither mints a grant from a high-risk
 * request nor lets an existing grant pre-answer one.
 *
 * The judgment is deliberately coarse and errs upward. `low` is a tool that
 * only reads; `high` is a command or tool name that destroys, publishes,
 * escalates or pipes the network into a shell; everything else, including
 * every tool this table has never seen, is `medium`. A false `high` costs a
 * person one extra press; a false `low` or `medium` costs a grant. Pure and
 * import-free, so it runs in the plain-node tier and in both processes.
 */

export type ApprovalRisk = 'low' | 'medium' | 'high'

/** Tools that only read. Claude's names, and the generic ones other backends use. */
const READ_ONLY = new Set([
  'Read', 'NotebookRead', 'Glob', 'Grep', 'LS', 'WebSearch', 'TodoWrite', 'TodoRead',
  'read', 'read_file', 'list_files', 'list_directory', 'search', 'grep', 'glob', 'view'
])

/** Tools whose argument is a shell command. */
const SHELL = new Set(['Bash', 'Shell', 'Run', 'bash', 'shell', 'exec', 'exec_command', 'run_command', 'execute', 'terminal', 'BashOutput'])

/**
 * Shell patterns that destroy, escalate, publish or execute the network. Each
 * is matched against the whole command, so `cd x && rm -rf y` is caught by
 * its tail — the part a row-sized cut would hide.
 */
const HIGH_COMMANDS: readonly RegExp[] = [
  /\brm\s+(-[a-zA-Z]*[rRf][a-zA-Z]*\s+)+/, // rm -rf, rm -r, rm -f …
  /\brm\s+--(recursive|force)\b/,
  /\bsudo\b|\bdoas\b|\bsu\s+-/,
  /\bgit\s+push\b[^\n;&|]*(\s--force\b|\s-f\b|\s--force-with-lease\b|\s--delete\b|\s:\S)/,
  /\bgit\s+reset\s+--hard\b/,
  /\bgit\s+clean\s+-[a-zA-Z]*f/,
  /\bgit\s+branch\s+-D\b/,
  /\bgit\s+(checkout|restore)\s+(--\s+)?\.(\s|$)/,
  /\b(curl|wget)\b[^|\n]*\|\s*(sudo\s+)?(ba|z|da)?sh\b/,
  /\bmkfs(\.\w+)?\b|\bdd\s+if=|>\s*\/dev\/(sd|disk|nvme)/,
  /\bchmod\s+(-R\s+)?[0-7]*777\b|\bchown\s+-R\b/,
  /\b(DROP|TRUNCATE)\s+(TABLE|DATABASE|SCHEMA)\b/i,
  /\bDELETE\s+FROM\s+\w+\s*(;|$)/i,
  /\b(npm|pnpm|yarn|cargo|gem|twine)\s+publish\b/,
  /\bkubectl\s+delete\b|\bterraform\s+(destroy|apply)\b|\bhelm\s+uninstall\b/,
  /\bdocker\s+(system\s+prune|rm\s+-f|rmi\s+-f)\b/,
  /\b(shutdown|reboot|halt|killall|launchctl\s+(unload|remove))\b/,
  /\bdiskutil\s+(erase|partition)/,
  /:\(\)\s*\{\s*:\|:&\s*\};:/,
  /\bgh\s+(repo\s+delete|release\s+delete|pr\s+merge)\b/
]

/** A tool NAME that says what it does: an MCP tool that deletes, deploys or pays is high whatever its input. */
const HIGH_TOOL_NAME = /(delete|destroy|drop|remove|purge|wipe|deploy|publish|release|transfer|payment|charge|refund|merge)/i

function commandOf(input: Record<string, unknown> | undefined): string | undefined {
  if (input === undefined) return undefined
  const c = input['command'] ?? input['cmd'] ?? input['script']
  if (typeof c === 'string') return c
  if (Array.isArray(c) && c.every((p) => typeof p === 'string')) return (c as string[]).join(' ')
  return undefined
}

/**
 * The risk of one request. `input` is the request's own input as main holds
 * it; absent (a caller that has only the name) judges the name alone, so a
 * shell tool with no command to read is `medium`, never `low`.
 */
export function approvalRisk(toolName: string, input?: Record<string, unknown>): ApprovalRisk {
  const command = commandOf(input)
  if (command !== undefined && HIGH_COMMANDS.some((re) => re.test(command))) return 'high'
  if (SHELL.has(toolName)) return 'medium'
  if (READ_ONLY.has(toolName)) return 'low'
  if (HIGH_TOOL_NAME.test(toolName)) return 'high'
  return 'medium'
}

/** M670. Whether a request of this risk may be granted for the session (the card's third verb, main's grant). */
export function offersSessionGrant(risk: ApprovalRisk): boolean {
  return risk !== 'high'
}

/** The label's words. Sentence case, the risk first. */
export function riskWords(risk: ApprovalRisk): string {
  return risk === 'high' ? 'High risk' : risk === 'medium' ? 'Medium risk' : 'Low risk'
}

/** Said under a high-risk request, so the missing session verb is explained rather than just absent. */
export const HIGH_RISK_NOTE = 'High risk: this asks every time, so there is no session grant for it.'
