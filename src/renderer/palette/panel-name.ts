import { shapeSummary } from '@shared/flowchart'
import { isShapePanel, isNotePanel, isRelayPanel, isImagePanel, isSkillPanel, isWorkflowPanel, isWorkPanel, isFilePanel, isGithubPanel, isJiraPanel, isWatcherPanel, isMemoryPanel, isReviewPanel, isToolboxPanel, isChatPanel, isBrowserPanel, type Panel } from '@renderer/panels/panels'
import { browserHost } from '@shared/browser-panel'
import { noteSummary } from '@shared/notes'

/**
 * M64. IDENTITY LEADS, PROVENANCE FOLLOWS (brief, principle 3).
 *
 * The palette's Go-to rows and the search hits used to read
 * `sh — /private/var/folders/hl/3nv4zlv11vg6kxy1rp3lm3040000gn/T/... (twin)`:
 * ninety characters of identical prefix per row, the user's own title in the
 * dim hint, the id — meaningless to a person — in brackets. `panelName` is
 * what a row LEADS with; `panelPath` is the provenance it trails, and
 * `shortPath` cuts that from the LEFT so the repository name survives.
 *
 * Pure, plain-node checked in `verify:rail` (`panelLabel` in canvas-constants
 * stays what it is: the long, unambiguous form the inspector and the older
 * checks read).
 */

/** M164. ONE shortening: the palette's cut lives in `shared/display-path.ts` now and is re-exported here for its callers. */
export { shortPath } from '@shared/display-path'

/**
 * M266. Chat display lead: `Teammate · place` when the teammate is known,
 * else the place basename. Never invent a name; never fall back to "agent".
 */
export function chatDisplayLead(placeBasename: string, teammateName?: string): string {
  const place = placeBasename.trim()
  const mate = typeof teammateName === 'string' ? teammateName.trim() : ''
  if (mate !== '') return place !== '' ? `${mate} · ${place}` : mate
  if (place !== '') return place
  return 'chat'
}

/** M403 (B8). The most of a first message a chat's name keeps. */
export const CHAT_NAME_MAX = 40

/**
 * M403 (B8). A chat with no folder is named after its FIRST MESSAGE. Its
 * folder is main's `userData/sandbox/<panelId>`, so the place-basename rule
 * above named it "c3" — a panel id — in the header, the navigator and ⌘K.
 * The first non-blank line, whitespace flattened, cut at a word near
 * `CHAT_NAME_MAX` with an ellipsis; null when there are no words.
 */
export function chatNameFromMessage(text: string): string | null {
  const line = (text.split('\n').map((l) => l.trim()).find((l) => l !== '') ?? '').replace(/\s+/g, ' ')
  if (line === '') return null
  if (line.length <= CHAT_NAME_MAX) return line
  const cut = line.slice(0, CHAT_NAME_MAX - 1)
  const space = cut.lastIndexOf(' ')
  return `${(space >= CHAT_NAME_MAX / 2 ? cut.slice(0, space) : cut).trimEnd()}…`
}

export interface PanelNameOpts {
  /** Resolved teammate display name for a chat with `chat.teammateId`. */
  teammateName?: string
}

/** What a row leads with: the user's title, else the honest name without path or id. */
export function panelName(panel: Panel, resolvedCommand?: string, opts?: PanelNameOpts): string {
  if (panel.title !== undefined) return panel.title
  if (isReviewPanel(panel)) return `review: ${panel.subject.label}`
  if (isFilePanel(panel)) return panel.source.path.slice(panel.source.path.lastIndexOf('/') + 1)
  if (isJiraPanel(panel)) return 'Jira tickets'
  if (isGithubPanel(panel)) return 'GitHub work'
  if (isToolboxPanel(panel)) {
    const cwd = panel.source.cwd.replace(/\/+$/, '')
    return `toolbox · ${cwd.slice(cwd.lastIndexOf('/') + 1) || cwd}`
  }
  // M266. Teammate · place when known; else place basename — never "agent".
  if (isChatPanel(panel)) {
    const cwd = panel.chat.cwd.replace(/\/+$/, '')
    return chatDisplayLead(cwd.slice(cwd.lastIndexOf('/') + 1) || cwd, opts?.teammateName)
  }
  // M83. `memory · <repository basename>`, the same split.
  if (isMemoryPanel(panel)) {
    const root = panel.source.root.replace(/\/+$/, '')
    return `memory · ${root.slice(root.lastIndexOf('/') + 1) || root}`
  }
  // M84. `watcher · <command>` — the name is what it runs; the trigger is
  // the row's trailing phrase, not part of its identity.
  if (isWatcherPanel(panel)) return `watcher · ${panel.watch.command.split('/').pop() ?? panel.watch.command}`
  // M103. `browser · <host>` — the rail's own label, so the Go-to row and
  // the rail agree on the name.
  if (isBrowserPanel(panel)) return `browser · ${browserHost(panel.url)}`
  // M116. `work · <title>` — the rail's own label, so the Go-to row agrees.
  if (isWorkPanel(panel)) return panel.title === undefined ? 'work' : `work · ${panel.title}`
  // M128. The title is already `skill · <name>` at mint; a retitled panel
  // keeps the user's words, and a titleless one names its kind.
  if (isSkillPanel(panel)) return panel.title ?? `skill · ${panel.skill.name}`
  // M133. The workflow panel names its template, the work card's own shape.
  if (isWorkflowPanel(panel)) return panel.title === undefined ? 'workflow' : `workflow · ${panel.title}`
  // M181. `image · <file>` — the rail's own label, so the Go-to row agrees.
  if (isImagePanel(panel)) return panel.title ?? `image · ${panel.image.path.split('/').pop() ?? 'image'}`
  // M187. A note names itself by its own first line — the rail, the Go-to row and the far view agree.
  if (isNotePanel(panel)) return panel.title ?? `${panel.note.form} · ${noteSummary(panel.note.text, panel.note.form)}`
  // M338. `relay · <program>` — the rail's own label, so the Go-to row agrees.
  if (isRelayPanel(panel)) return panel.title ?? `relay · ${panel.relay.program}`
  // M388. A shape names itself by its label's first line, like a note.
  if (isShapePanel(panel)) return shapeSummary(panel.shape.text, panel.shape.form)
  const command = resolvedCommand ?? panel.spec.command
  return command ? (command.split('/').pop() ?? command) : 'login shell'
}

/** The provenance a row trails: a directory. Absent for a review or Jira panel. */
export function panelPath(panel: Panel): string | undefined {
  if (isReviewPanel(panel) || isJiraPanel(panel) || isGithubPanel(panel)) return undefined
  if (isFilePanel(panel)) return panel.source.path.slice(0, Math.max(0, panel.source.path.lastIndexOf('/'))) || '/'
  if (isToolboxPanel(panel)) return panel.source.cwd
  if (isChatPanel(panel)) return panel.chat.cwd
  if (isMemoryPanel(panel)) return panel.source.root
  if (isWatcherPanel(panel)) return panel.watch.cwd
  // A page has no directory; the url is the inspector's identity line.
  if (isBrowserPanel(panel)) return undefined
  // M116. A card has no directory; its lane's chat has one.
  if (isWorkPanel(panel)) return undefined
  // M128. A skill panel has no directory of its own: it reads the
  // inventories of the panels that DO, and its file lives wherever the scope
  // puts it. Naming one here would be a claim about a cwd it never resolved.
  if (isSkillPanel(panel)) return undefined
  // M133. A workflow is a shape of work, not a place: its blocks carry the directories.
  if (isWorkflowPanel(panel)) return undefined
  // M181. A picture's directory is its file's — the file panel's own rule.
  if (isImagePanel(panel)) return panel.image.path.slice(0, Math.max(0, panel.image.path.lastIndexOf('/'))) || '/'
  // A note has no directory: it is text on a canvas, not a file (three-state, never a made-up path).
  if (isNotePanel(panel)) return undefined
  // M338. A relay terminal's directory is on the relay VM, not this Mac.
  if (isRelayPanel(panel)) return undefined
  // M388. A shape is a mark on a canvas, not a place.
  if (isShapePanel(panel)) return undefined
  return panel.spec.cwd
}
