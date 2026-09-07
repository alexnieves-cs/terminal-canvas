import { isSkillPanel, isWorkflowPanel, isWorkPanel, isFilePanel, isGithubPanel, isJiraPanel, isWatcherPanel, isMemoryPanel, isReviewPanel, isToolboxPanel, isChatPanel, isBrowserPanel, type Panel } from '@renderer/panels/panels'
import { browserHost } from '@shared/browser-panel'

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

/** The last `keep` segments with a leading `…/`; a path that short is returned whole. */
export function shortPath(path: string, keep = 2): string {
  const trimmed = path.replace(/\/+$/, '')
  const parts = trimmed.split('/').filter((s) => s !== '')
  if (parts.length <= keep) return trimmed
  // The LEFTMOST kept segment must not be a one-letter fragment: `…/T/tc
  // shot` opens on macOS's temp `T` and says nothing. Drop it rather than
  // reach past it — the segment before `T` is a 30-character hash, and the
  // repository name is what has to survive.
  let n = keep
  while (n > 1 && parts[parts.length - n].length < 2) n -= 1
  return `…/${parts.slice(-n).join('/')}`
}

/** What a row leads with: the user's title, else the honest name without path or id. */
export function panelName(panel: Panel, resolvedCommand?: string): string {
  if (panel.title !== undefined) return panel.title
  if (isReviewPanel(panel)) return `review: ${panel.subject.label}`
  if (isFilePanel(panel)) return panel.source.path.slice(panel.source.path.lastIndexOf('/') + 1)
  if (isJiraPanel(panel)) return 'Jira tickets'
  if (isGithubPanel(panel)) return 'GitHub work'
  if (isToolboxPanel(panel)) {
    const cwd = panel.source.cwd.replace(/\/+$/, '')
    return `toolbox · ${cwd.slice(cwd.lastIndexOf('/') + 1) || cwd}`
  }
  // M73. `chat · <directory basename>`, the toolbox's split for the same
  // reason: the row has room for one thing, and the path is the trailing hint.
  if (isChatPanel(panel)) {
    const cwd = panel.chat.cwd.replace(/\/+$/, '')
    return `chat · ${cwd.slice(cwd.lastIndexOf('/') + 1) || cwd}`
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
  return panel.spec.cwd
}
