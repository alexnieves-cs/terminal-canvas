import { useEffect, useState, type JSX, type MouseEvent as ReactMouseEvent } from 'react'
import type { SkillPanel } from '@renderer/panels/panels'
import type { DragState } from '@renderer/canvas/panel-interaction'
import { PanelFrame } from '@renderer/components/PanelFrame'
import { panelState } from '@renderer/panels/panel-state'
import type { NamedToolEntry, ToolInventoryResult } from '@shared/toolbox'
import type { PluginDetailsResult } from '@shared/skills'
import { skillNodeSections, REASON_NO_SOURCE, type SkillPanelSighting, type SkillTextState } from './skill-node-model'

/**
 * M127. THE SKILL PANEL — the thirteenth kind, sessionless like the work
 * card. The record is `{scope, name}` and nothing else, so every word on
 * screen is read LIVE: the inventories of the open panels that have a
 * directory (the cache is keyed by resolved cwd, so twelve panels in one
 * repository cost one parse), the `SKILL.md` text through the ordinary
 * `file:read` door with its own cap respected, and — for a plugin skill —
 * `claude plugin details <id>` as TEXT, rendered verbatim in a `<pre>` and
 * parsed nowhere, because that command has no `--json` and a parser here
 * would be a differential that goes wrong silently.
 *
 * Three doors, NO WRITES. `Start a chat with this skill` and `Help me write`
 * both INSERT into the new chat's composer and never send — M80's rule for a
 * template's first message, not M114's for a dispatch: this is the user's
 * next move, not a hand-off. `Open folder` reveals the skill's own directory
 * through the existing `link:open` door (there is no channel that reveals an
 * arbitrary path — `worktree:reveal` resolves a worktree RECORD by id — and
 * opening a directory is what Finder does with one). Each door that cannot
 * run keeps its place with a NAMED reason in its title, never removed.
 */
export interface SkillNodeProps {
  panel: SkillPanel
  /**
   * Every OPEN panel that has a directory, with the label the rail shows.
   * The order is the canvas's; the first inventory that holds the skill is
   * the entry the body describes.
   */
  sources: readonly { panelId: string; label: string; cwd: string }[]
  selected: boolean
  onSelect: (id: string, additive?: boolean) => void
  onFocus: (id: string) => void
  onBeginDrag: (state: DragState) => void
  onClose: (id: string) => void
  readOnly?: boolean
  onBeginLink: (panelId: string, event: ReactMouseEvent) => void
  linkTarget: boolean
  /** Mint a chat in `cwd` whose composer is seeded with `message` — inserted, never sent. */
  onChat: (cwd: string | undefined, message: string) => void
}

export const REASON_MERGED_VIEW = 'leave merged view to act on this panel'

const press = (fn: () => void) => (e: ReactMouseEvent): void => { e.stopPropagation(); e.preventDefault(); fn() }

/** The directory a `.../skills/<name>/SKILL.md` path names. */
function dirOf(path: string): string {
  const cut = path.lastIndexOf('/')
  return cut <= 0 ? path : path.slice(0, cut)
}

export function SkillNode(props: SkillNodeProps): JSX.Element {
  const { panel } = props
  const id = panel.rect.id
  const { scope, name } = panel.skill
  const readOnly = props.readOnly === true
  const [sightings, setSightings] = useState<SkillPanelSighting[] | undefined>(undefined)
  const [entry, setEntry] = useState<NamedToolEntry | undefined>(undefined)
  const [text, setText] = useState<SkillTextState>({ kind: 'pending' })
  const [details, setDetails] = useState<PluginDetailsResult | undefined>(undefined)
  const [detailsAt, setDetailsAt] = useState<number | undefined>(undefined)
  const [refreshTick, setRefreshTick] = useState(0)

  // One read per DISTINCT cwd — main's cache is keyed by resolved cwd, and
  // asking twice for one directory would spend a parse to learn nothing.
  // JSON, not a joined string: a fixture directory in this repo's own suites
  // contains a SPACE, and this repo's costliest silent bug shipped through
  // eight reviews on space-free fixtures.
  const cwdKey = JSON.stringify(props.sources.map((s) => [s.panelId, s.cwd]))
  useEffect(() => {
    let live = true
    const sources = (JSON.parse(cwdKey) as [string, string][]).map(([panelId, cwd]) => ({ panelId, cwd }))
    if (sources.length === 0) { setSightings([]); setEntry(undefined); return }
    const distinct = [...new Set(sources.map((s) => s.cwd))]
    void Promise.all(distinct.map(async (cwd) => {
      try { return [cwd, await window.canvas.toolbox.read({ panelId: id, cwd })] as const }
      // A failed invoke is `no-cwd`, never a throw that would leave every
      // section pending for ever with nothing on screen saying so.
      catch { return [cwd, { kind: 'no-cwd' } as ToolInventoryResult] as const }
    })).then((pairs) => {
      if (!live) return
      const byCwd = new Map(pairs)
      const found = (cwd: string): NamedToolEntry | undefined => {
        const r = byCwd.get(cwd)
        if (r === undefined || r.kind !== 'inventory') return undefined
        return r.inventory.entries.find((e): e is NamedToolEntry =>
          e.kind === 'skill' && e.name === name && e.scope === scope)
      }
      setSightings(sources.map((s) => ({ panelId: s.panelId, label: '', sees: found(s.cwd) !== undefined })))
      setEntry(sources.map((s) => found(s.cwd)).find((e) => e !== undefined))
    })
    return () => { live = false }
  }, [cwdKey, id, name, scope])

  // The SKILL.md text, through the ORDINARY file door — its cap is respected
  // rather than re-implemented, and a second reader would differ from the
  // file panel's exactly in the cases nobody tests.
  const sourcePath = entry?.sourcePath
  useEffect(() => {
    if (sourcePath === undefined) { setText({ kind: 'pending' }); return }
    let live = true
    void window.canvas.file.read({ panelId: id, path: sourcePath })
      .then((r) => {
        if (!live) return
        if (r.kind === 'text') { setText({ kind: 'some', text: r.content, truncated: r.truncatedLines > 0 }); return }
        setText({ kind: 'unknown', why: r.kind === 'missing' ? 'the file is gone from disk' : r.kind === 'too-large' ? `the file is ${r.bytes} bytes, past the read cap` : r.kind === 'binary' ? 'the file is not text' : r.detail })
      })
      .catch(() => { if (live) setText({ kind: 'unknown', why: 'the file could not be read' }) })
    return () => { live = false; void window.canvas.file.close(id) }
  }, [sourcePath, id])

  // Asked ONLY for a plugin skill, and only while one is on screen: a details
  // call folded into the toolbox read would spend a CLI call for every panel
  // that never opens one.
  const pluginId = entry?.pluginId
  useEffect(() => {
    if (pluginId === undefined) { setDetails(undefined); setDetailsAt(undefined); return }
    let live = true
    setDetails(undefined)
    void window.canvas.plugin.details(pluginId)
      .then((r) => { if (live) { setDetails(r); setDetailsAt(Date.now()) } })
      .catch(() => { if (live) { setDetails({ kind: 'unknown', why: 'the CLI did not answer' }); setDetailsAt(Date.now()) } })
    return () => { live = false }
  }, [pluginId, refreshTick])

  const labelled: SkillPanelSighting[] = (sightings ?? []).map((s) => ({
    ...s, label: props.sources.find((x) => x.panelId === s.panelId)?.label ?? s.panelId
  }))
  const sections = skillNodeSections({
    scope, name, entry,
    entryWhy: sightings === undefined ? 'reading the open panels’ inventories…'
      : props.sources.length === 0 ? 'no open panel has a directory, so no inventory could be read'
        : `no open panel’s inventory holds a ${scope} skill named ${name}`,
    text, panels: labelled, details
  })
  const plugin = sections.find((s) => s.id === 'plugin')

  const door = (key: string, label: string, own: string | null, run: () => void): JSX.Element => {
    const reason = readOnly ? REASON_MERGED_VIEW : own
    return (
      <button type="button" className="pf__verb pf__verb--word" data-skill-door={key} disabled={reason !== null}
        title={reason ?? label} onMouseDown={press(() => { if (reason === null) run() })}>{label}</button>
    )
  }
  const state = panelState({ kind: 'skill', status: undefined, dormant: false }, undefined)
  return (
    <PanelFrame
      id={id}
      kind="skill"
      rect={panel.rect}
      z={panel.z}
      selected={props.selected}
      linkTarget={props.linkTarget}
      readOnly={readOnly}
      className="skill-node"
      rootAttrs={{ 'data-skill-node': '', 'data-skill-scope': scope, 'data-skill-name': name }}
      title={panel.title ?? `skill · ${name}`}
      state={state}
      onSelect={props.onSelect}
      onBeginDrag={props.onBeginDrag}
      onBeginLink={props.onBeginLink}
      close={readOnly ? null : { armed: false, title: 'Close', armedText: '', onMouseDown: (e) => { e.stopPropagation(); e.preventDefault(); props.onClose(id) } }}
      chrome={<span className="pf__summary skill-node__scope" data-skill-summary>{scope}</span>}
    >
      <div className="pf__body pf__body--text skill-node__body" data-scroll-host onMouseDown={(e) => { e.stopPropagation(); props.onFocus(id) }}>
        <div className="skill-node__doors">
          {door('chat', 'Start a chat with this skill', null, () => props.onChat(undefined, name))}
          {/* `link:open` on the skill's own DIRECTORY: the one door that
              already leaves the app for a path, and a directory is what
              Finder opens. Disabled BY NAME when no inventory has answered
              yet — a removed button reads as a feature that was never built. */}
          {door('folder', 'Open folder', sourcePath === undefined ? REASON_NO_SOURCE : null,
            () => { if (sourcePath !== undefined) void window.canvas.links.open({ panelId: id, target: dirOf(sourcePath) }) })}
          {door('write', 'Help me write', sourcePath === undefined ? REASON_NO_SOURCE : null,
            () => { if (sourcePath !== undefined) props.onChat(dirOf(sourcePath), `Help me write ${sourcePath}`) })}
        </div>
        {sections.map((section) => (
          <section key={section.id} className="skill-node__section" data-skill-section={section.id} data-skill-state={section.state}>
            <h3 className="skill-node__heading">{section.heading}</h3>
            {section.id === 'plugin' && section.state === 'some' ? (
              /* VERBATIM. `claude plugin details` has no --json (measurement
                 5), so this is one string in a <pre> and nothing parses it. */
              <pre className="skill-node__verbatim" data-skill-plugin-verbatim>{section.lines[0]}</pre>
            ) : section.id === 'text' && section.state === 'some' ? (
              <pre className="skill-node__verbatim" data-skill-text>{section.lines.join('\n')}</pre>
            ) : (
              section.lines.map((line, i) => <p key={i} className="skill-node__line">{line}</p>)
            )}
          </section>
        ))}
        {/* M21's own answer to staleness, at a second surface: when it was
            read, and a way to ask again. Only where there is something to
            re-read — a non-plugin skill has no details call to refresh. */}
        {plugin !== undefined && pluginId !== undefined && (
          <p className="skill-node__read-at" data-skill-read-at>
            {detailsAt === undefined ? 'not read yet' : `read at ${new Date(detailsAt).toLocaleTimeString()}`}
            <button type="button" className="pf__verb pf__verb--word" data-skill-door="plugin-refresh"
              title="Ask claude plugin details again" onMouseDown={press(() => setRefreshTick((t) => t + 1))}>Refresh</button>
          </p>
        )}
      </div>
    </PanelFrame>
  )
}
