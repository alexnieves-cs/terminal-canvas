import type { AgentEvent, AgentStatus } from '@shared/world-events'
import type { AgentState } from '@shared/types'
import type { SimAgent } from '../main/world-sim'
import type { Cast, CastPanel } from './demo-layout'

/**
 * Lane N (M566, M567). What the demo's agents do, and what their terminals show.
 *
 * Each agent on the cast gets a `world-sim` script under its PANEL's id, so
 * the World room, the rail and the panel's own state word all read one
 * stream, the way they read the real feed. Every script opens on the frame
 * the cast was drawn in (3 waiting, 1 failed, 4 working) and holds it long
 * enough to be seen, then works, waits for you, and finishes, and loops.
 *
 * There is no shell in a browser, so a terminal plays a RECORDING: a short
 * opening per engine, then one line per event of its own agent's script.
 * The text is invented, like world-sim's, and stays in this file.
 */

type Step = SimAgent['script'][number]

const status = (after: number, s: AgentStatus): Step => ({ after, body: { type: 'status', payload: s } })
const thought = (after: number, text: string): Step => ({ after, body: { type: 'thought', payload: { text } } })
const message = (after: number, text: string): Step => ({ after, body: { type: 'message', payload: { text } } })
const call = (after: number, key: string, tool: string, summary: string, detail?: string): Step => ({ after, call: key, tool, summary, detail })
const result = (after: number, key: string, opts: { failed?: boolean; detail?: string } = {}): Step => ({ after, result: key, ...opts })

/** How long the cast's own frame holds before anyone moves. */
export const OPENING_HOLD_MS = 6000

function opener(panel: CastPanel): Step[] {
  const world = (panel.world ?? 'idle') as AgentStatus
  const line = panel.line ?? panel.name
  return [status(200, world), message(150, line)]
}

function claudeScript(panel: CastPanel): Step[] {
  const dir = panel.folder ?? 'src'
  return [
    ...opener(panel),
    status(OPENING_HOLD_MS, 'thinking'),
    thought(1400, `Start from what ${dir} already does before changing it.`),
    status(500, 'working'),
    call(300, 'read', 'Read', `Read ${dir}/src/index.ts`),
    result(900, 'read'),
    call(400, 'grep', 'Grep', `Search "export function" in ${dir}/src`, '9 matches in 4 files'),
    result(800, 'grep'),
    call(500, 'edit', 'Edit', `Edit ${dir}/src/index.ts`, '+18 −4'),
    result(1700, 'edit'),
    call(400, 'test', 'Bash', 'npm test'),
    result(3200, 'test', { detail: '24 passed' }),
    message(500, 'Tests pass. The change is ready for review.'),
    status(400, 'waiting_approval'),
    message(150, 'Commit these changes?'),
    status(7000, 'working'),
    call(300, 'commit', 'Bash', 'git commit -am "wip"'),
    result(900, 'commit', { detail: '1 commit' }),
    status(500, 'idle'),
    message(150, 'Done.'),
    status(8000, 'working')
  ]
}

function codexScript(panel: CastPanel): Step[] {
  const dir = panel.folder ?? 'src'
  if (panel.world === 'error') {
    return [
      ...opener(panel),
      status(OPENING_HOLD_MS + 4000, 'working'),
      message(300, 'Retrying with the build cache cleared.'),
      call(400, 'build', 'shell', 'npm run build'),
      result(3600, 'build', { detail: 'built in 3.4s' }),
      status(500, 'idle'),
      message(150, 'The build passes now.'),
      status(9000, 'error'),
      message(150, panel.line ?? 'exited 1')
    ]
  }
  return [
    ...opener(panel),
    status(OPENING_HOLD_MS, 'working'),
    call(400, 'read', 'shell', `sed -n 1,80p ${dir}/src/main.ts`),
    result(700, 'read'),
    call(500, 'patch', 'apply_patch', `Update ${dir}/src/main.ts`, '+9 −2'),
    result(1500, 'patch'),
    call(400, 'test', 'shell', 'npm test -- --run'),
    result(2800, 'test', { detail: '17 passed' }),
    status(400, 'waiting_approval'),
    message(150, `Allow edits to ${dir}/src/main.ts?`),
    status(6500, 'working'),
    message(800, 'Applied. Nothing else to change.'),
    status(500, 'idle'),
    status(9000, 'working')
  ]
}

function shellScript(panel: CastPanel): Step[] {
  if (panel.world === 'waiting_approval') {
    return [
      ...opener(panel),
      status(OPENING_HOLD_MS + 2000, 'working'),
      call(300, 'apply', 'shell', 'terraform apply -auto-approve'),
      result(4200, 'apply', { detail: 'Apply complete! Resources: 2 added, 1 changed, 0 destroyed.' }),
      status(500, 'idle'),
      status(9000, 'waiting_approval'),
      message(150, panel.line ?? 'Do you want to perform these actions?')
    ]
  }
  return [
    ...opener(panel),
    status(OPENING_HOLD_MS, 'working'),
    call(300, 'watch', 'shell', 'vitest related changes'),
    result(2400, 'watch', { detail: '24 passed (3 files)' }),
    status(300, 'idle'),
    message(150, 'passed'),
    status(9000, 'idle')
  ]
}

/** One script per agent on the cast, keyed by the panel it lives in. */
export function demoAgents(cast: Cast): SimAgent[] {
  const agents: SimAgent[] = []
  for (const task of cast.tasks) {
    for (const panel of task.panels) {
      if (panel.agent !== true) continue
      const script = panel.engine === 'claude' ? claudeScript(panel)
        : panel.engine === 'codex' ? codexScript(panel)
        : shellScript(panel)
      agents.push({ agentId: panel.id, name: panel.name, script })
    }
  }
  return agents
}

/** The panel's state word, from its agent's status. */
export function panelStateOf(status: AgentStatus): AgentState {
  if (status === 'waiting_approval') return 'wants-you'
  if (status === 'error') return 'exited'
  if (status === 'idle') return 'idle'
  return 'busy'
}

const DIM = '\x1b[2m'
const RESET = '\x1b[0m'
const RED = '\x1b[31m'
const GREEN = '\x1b[32m'
const YELLOW = '\x1b[33m'
const CYAN = '\x1b[36m'

/** The recording's opening, before the agent's first event. */
export function recordingOpener(panel: CastPanel): string {
  const where = panel.folder ? `~/${panel.folder}` : '~'
  const lines = panel.engine === 'claude'
    ? [`${CYAN}✻${RESET} Welcome to Claude Code`, `${DIM}  cwd: ${where}${RESET}`, '']
    : panel.engine === 'codex'
      ? [`${CYAN}>_${RESET} OpenAI Codex`, `${DIM}  workdir: ${where}${RESET}`, '']
      : panel.engine === 'review'
        ? [`${DIM}${where}${RESET} $ git diff --stat`, panel.line ?? '']
        : [`${DIM}${where}${RESET} $ ${panel.name}`]
  return lines.map((l) => `${l}\r\n`).join('')
}

/** One event as the terminal would have printed it. Empty when the event has no line. */
export function terminalLine(event: AgentEvent): string {
  switch (event.type) {
    case 'status':
      return event.payload === 'waiting_approval' ? `${YELLOW}?${RESET} ` : ''
    case 'thought':
      return `${DIM}✻ ${event.payload.text}${RESET}\r\n`
    case 'message':
      return `${event.payload.text}\r\n`
    case 'error':
      return `${RED}${event.payload.message}${RESET}\r\n`
    case 'tool_call':
      return event.payload.status === 'started' ? `${GREEN}●${RESET} ${event.payload.summary}\r\n` : ''
    case 'tool_result': {
      const detail = event.payload.detail ?? (event.payload.status === 'failed' ? 'failed' : 'done')
      return `${DIM}  ⎿${RESET} ${event.payload.status === 'failed' ? RED : ''}${detail}${RESET}\r\n`
    }
    default:
      return ''
  }
}
