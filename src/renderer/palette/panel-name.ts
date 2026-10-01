import { shapeSummary } from '@shared/flowchart'
import { isTerminalPanel, isShapePanel, isNotePanel, isRelayPanel, isImagePanel, isSkillPanel, isWorkflowPanel, isWorkPanel, isFilePanel, isGithubPanel, isJiraPanel, isWatcherPanel, isMemoryPanel, isReviewPanel, isToolboxPanel, isChatPanel, isBrowserPanel, type Panel } from '@renderer/panels/panels'
import { browserHost } from '@shared/browser-panel'
import { noteSummary } from '@shared/notes'
import { displayPath } from '@shared/display-path'

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

/**
 * M405 (D2). AN UNTITLED TERMINAL IS NAMED BY WHERE IT STARTED. Eight shells
 * used to be eight rows reading `/bin/zsh` — the resolved login shell, the
 * one fact every default terminal shares. The name is now the place: the
 * spawn cwd's basename through the path rule's helper (`displayPath(cwd,
 * cwd)`, the root-is-its-basename arm), `home` for `~` (main's `autoName`
 * spelling, for its reason: a bare `~` reads as a typo), and a command a
 * person or preset NAMED rides in front as the far card's kicker
 * (`claude — api`, `FAR_TITLE_SEPARATOR`). A login shell has no command in
 * its spec, and its program is not what tells it apart, so it is the place
 * alone. The full path goes on the title's tooltip, never in the name.
 *
 * The SPAWN cwd, not the live one (M12's `getLiveSession`): a name that
 * followed every `cd` would change under the person's eyes and reorder a
 * search, and `panelLabel`'s note already declines a present-tense claim in
 * a label. Undefined when there is no cwd to name — the old chain answers.
 */
export function terminalBaseName(spec: { command?: string; cwd: string }): string | undefined {
  const cwd = spec.cwd.trim()
  if (cwd === '') return undefined
  // `/` strips to nothing and has no basename: the root names itself.
  const place = cwd === '~' ? 'home' : displayPath(cwd, cwd).short || cwd
  const command = spec.command === undefined || spec.command === '' ? undefined : spec.command.split('/').pop()
  return command === undefined || command === '' ? place : `${command} — ${place}`
}

/**
 * M407. One ordinal as a panel holds it: the NAME it numbers (`api`, or
 * `a/api` once the parent is added) and its number, keyed by the name AND the
 * id. One book per SCOPE (`ordinalBook`), never one for every list.
 */
export type TerminalOrdinals = Map<string, number>

/**
 * M407. THE SESSION'S ORDINALS. M405 numbered twins in array order, so
 * closing `home` renamed `home 2` to `home` under the person's eyes — and a
 * name that changes is a name nobody can use to find anything. A number, once
 * given, is kept for the life of the renderer; nothing is persisted (the
 * layout format does not move, and a relaunch numbers afresh, in array order).
 */
const SESSION_ORDINALS: TerminalOrdinals = new Map()
/**
 * M407 follow-up. THE MERGED VIEW KEEPS ITS OWN BOOK. With one book, a lone
 * `home` in workspace B met workspace A's `home` in the merged view, was
 * given 2 there, and kept that 2 back in B where nothing else is called
 * `home` — the merged view renumbered it for the session. A workspace needs
 * no book of its own: panel ids are global (a panel is in one workspace), so
 * the session's book already holds each workspace's numbers apart, and a
 * book per workspace id would be read a render early or late across a switch
 * (Canvas learns the active id after the panels). The merged view's numbers
 * stay in its book and never reach a workspace's.
 */
const MERGED_ORDINALS: TerminalOrdinals = new Map()
export function ordinalBook(scope: 'workspace' | 'merged'): TerminalOrdinals {
  return scope === 'merged' ? MERGED_ORDINALS : SESSION_ORDINALS
}

/**
 * M407 follow-up. `~/x/api` and `/Users/<me>/x/api` are ONE place: a spec's
 * cwd is what the person or preset typed, and main expands the tilde at
 * spawn, so the two spellings were two folders here, lengthened apart into
 * `~/x/api` and `<me>/x/api` where they should have been `api` and `api 2`.
 * The home prefix is written back as `~` (the spelling
 * `terminalBaseName` already reads as `home`). No home, nothing changes.
 */
function homeFolded(cwd: string, home: string | undefined): string {
  // `/` keeps its slash: stripped, the root would be no place at all.
  const c = cwd.trim().replace(/\/+$/, '') || cwd.trim()
  if (home === undefined || home === '') return c
  const h = home.replace(/\/+$/, '')
  if (h === '') return c
  if (c === h) return '~'
  return c.startsWith(h + '/') ? `~/${c.slice(h.length + 1)}` : c
}

/** `/a/b/api/` → `['a', 'b', 'api']`; `~/x` keeps its `~` (it reads as home, not a typo, INSIDE a path). */
function segments(cwd: string): string[] {
  return cwd.trim().split('/').filter((s) => s !== '')
}

/**
 * M405 (D2), M407. Every untitled terminal's DEFAULT name, with an ordinal
 * where two would read alike — `api`, `api 2`, `autoName`'s de-duplication.
 *
 * M407: two shells whose folders merely SHARE A BASENAME are two places, not
 * twins — `~/a/api` and `~/b/api` read `a/api` and `b/api` (the parent added,
 * and more of the path only while that still collides); an ordinal is only
 * for two shells in the SAME folder. And the ordinal is STABLE: a panel keeps
 * the number it was given (`ordinals`, the session's by default), a new
 * panel takes the lowest free one, so closing `api` leaves `api 2` as it is
 * and the next shell there is `api` again — the gap a Finder window leaves.
 * A titled terminal keeps its own words and takes no number. The caller
 * computes this ONCE per list (Canvas does, over the list the rim shows) so
 * the rim, the navigator and the palette's Go-to rows read one name.
 */
export function terminalNames(panels: readonly Panel[], ordinals: TerminalOrdinals = SESSION_ORDINALS, home?: string): ReadonlyMap<string, string> {
  type Row = { id: string; cwd: string; base: string; name: string }
  const rows: Row[] = []
  for (const p of panels) {
    if (!isTerminalPanel(p) || p.title !== undefined) continue
    const cwd = homeFolded(p.spec.cwd, home)
    const base = terminalBaseName({ ...p.spec, cwd })
    if (base === undefined) continue
    rows.push({ id: p.rect.id, cwd, base, name: base })
  }
  // Same base, different folders: lengthen the PLACE (never the command in
  // front of it) by parent segments until the folders read apart.
  const byBase = new Map<string, Row[]>()
  for (const r of rows) byBase.set(r.base, [...(byBase.get(r.base) ?? []), r])
  for (const group of byBase.values()) {
    const cwds = [...new Set(group.map((r) => r.cwd))]
    if (cwds.length < 2) continue
    const depth = Math.max(...cwds.map((c) => segments(c).length))
    let k = 2
    // A bare `~` is still `home` here (terminalBaseName's reason: `~` alone reads as a typo).
    const tail = (cwd: string, n: number): string => { const t = segments(cwd).slice(-n).join('/') || cwd; return t === '~' ? 'home' : t }
    while (k < depth && new Set(cwds.map((c) => tail(c, k))).size < cwds.length) k++
    for (const r of group) {
      const place = tail(r.cwd, k)
      const cut = r.base.lastIndexOf(' — ')
      r.name = cut === -1 ? place : `${r.base.slice(0, cut)} — ${place}`
    }
  }
  // Ordinals: kept numbers first, then the lowest free number, in array order.
  const out = new Map<string, string>()
  const byName = new Map<string, Row[]>()
  for (const r of rows) byName.set(r.name, [...(byName.get(r.name) ?? []), r])
  for (const [name, group] of byName) {
    const taken = new Set<number>()
    const fresh: Row[] = []
    for (const r of group) {
      const kept = ordinals.get(`${name}\u0000${r.id}`)
      if (kept !== undefined && !taken.has(kept)) { taken.add(kept); out.set(r.id, kept === 1 ? name : `${name} ${kept}`) }
      else fresh.push(r)
    }
    for (const r of fresh) {
      let n = 1
      while (taken.has(n)) n++
      taken.add(n)
      ordinals.set(`${name}\u0000${r.id}`, n)
      out.set(r.id, n === 1 ? name : `${name} ${n}`)
    }
  }
  return out
}

/**
 * M407. THE NAMES THE RIM SHOWS, for every label that cannot see the list.
 * About twenty `railLabel(panel, undefined)` callers (the hand-off header,
 * the activity feed, Orchestrate, the link banner, the runs' skip notes…)
 * hold one panel and nothing else, so they said `home` where the rim said
 * `home 2`. Canvas publishes the one `terminalNames` it computes each render
 * and `panelName`/`railLabel` read it when no name was handed in. A renderer
 * holds one canvas, so there is one book; in plain node nothing publishes and
 * the book is empty, which is the place without an ordinal — M405's answer.
 */
let publishedNames: ReadonlyMap<string, string> = new Map()
export function publishTerminalNames(names: ReadonlyMap<string, string>): void { publishedNames = names }
export function publishedTerminalName(id: string): string | undefined { return publishedNames.get(id) }

export interface PanelNameOpts {
  /** Resolved teammate display name for a chat with `chat.teammateId`. */
  teammateName?: string
  /** M405 (D2). This terminal's name from `terminalNames` (the ordinal needs the whole list). */
  defaultName?: string
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
  // M405 (D2). The place first; the program only when there is no place.
  // M407: the rim's published name when the caller did not hand one in.
  const named = opts?.defaultName ?? publishedTerminalName(panel.rect.id) ?? terminalBaseName(panel.spec)
  if (named !== undefined) return named
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
