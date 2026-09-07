import { useEffect, useState, type JSX, type MouseEvent as ReactMouseEvent } from 'react'
import type { SkillPanel } from '@renderer/panels/panels'
import type { DragState } from '@renderer/canvas/panel-interaction'
import { PanelFrame } from '@renderer/components/PanelFrame'
import { panelState } from '@renderer/panels/panel-state'
import type { NamedToolEntry, ToolInventoryResult } from '@shared/toolbox'
import type { PluginDetailsResult } from '@shared/skills'
import { deleteConfirmText, skillNodeSections, REASON_NO_SOURCE, type SkillPanelSighting, type SkillTextState } from './skill-node-model'
import { SkillEditor } from './SkillEditor'
import type { ReadStamp } from '@shared/skill-edit'

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
  /**
   * M128 fix. A rename LANDED on disk. The panel record's `skill.name` and
   * the shelf's `scope:name` key are both stale the instant the folder moves,
   * and both are the canvas's to write: a shelf slot that could not be
   * carried leaves the old key rendering `not installed here`, which is this
   * repo's "a row that disappears" failure wearing a rename's clothes.
   * Canvas does both in ONE history entry.
   */
  onRenamed: (panelId: string, newName: string) => void
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
  // M128. The Edit tab. `read` is the default: this panel's first job is
  // still to answer "what is this skill", and a panel that opened straight
  // into a text area would put a write one stray keystroke away.
  const [tab, setTab] = useState<'read' | 'edit'>('read')
  // The stamp the text was READ with, carried on every save. It comes from
  // the SAME `file:read` that produced the text — never a second stat, which
  // could be taken after a change the panel has not seen.
  const [stamp, setStamp] = useState<ReadStamp | undefined>(undefined)
  const [readTick, setReadTick] = useState(0)
  // The cwd whose inventory ANSWERED. Main derives the writable roots from
  // it, so a project skill must be written against the repository that holds
  // it rather than against whichever panel happens to be first in the list.
  const [entryCwd, setEntryCwd] = useState('')
  // M128 fix. The folder doors' own drafts. Local to the panel: a half-typed
  // rename is not a fact the canvas needs, and the delete is armed in two
  // steps rather than one, PanelFrame's own close rule.
  const [renameTo, setRenameTo] = useState('')
  const [arming, setArming] = useState(false)
  const [folderResult, setFolderResult] = useState<string | null>(null)

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
      const hit = sources.find((s) => found(s.cwd) !== undefined)
      setEntryCwd(hit?.cwd ?? '')
      setEntry(hit === undefined ? undefined : found(hit.cwd))
    })
    return () => { live = false }
  }, [cwdKey, id, name, scope])

  // The SKILL.md text, through the ORDINARY file door — its cap is respected
  // rather than re-implemented, and a second reader would differ from the
  // file panel's exactly in the cases nobody tests.
  const sourcePath = entry?.sourcePath
  useEffect(() => {
    if (sourcePath === undefined) { setText({ kind: 'pending' }); setStamp(undefined); return }
    let live = true
    void window.canvas.file.read({ panelId: id, path: sourcePath })
      .then((r) => {
        if (!live) return
        if (r.kind === 'text') {
          setText({ kind: 'some', text: r.content, truncated: r.truncatedLines > 0 })
          // M128. Both halves of the stamp come off this one answer — the
          // mtime is taken AFTER the read, so it describes the content in
          // hand rather than whatever was on disk before it started.
          setStamp({ mtimeMs: r.mtimeMs, size: r.bytes })
          return
        }
        setStamp(undefined)
        setText({ kind: 'unknown', why: r.kind === 'missing' ? 'the file is gone from disk' : r.kind === 'too-large' ? `the file is ${r.bytes} bytes, past the read cap` : r.kind === 'binary' ? 'the file is not text' : r.detail })
      })
      .catch(() => { if (live) { setStamp(undefined); setText({ kind: 'unknown', why: 'the file could not be read' }) } })
    return () => { live = false; void window.canvas.file.close(id) }
  }, [sourcePath, id, readTick])

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
  // Spec §5.1's line, at the tab: a plugin's skills belong to the installer.
  const editReason = readOnly ? REASON_MERGED_VIEW
    : pluginId !== undefined ? `${pluginId} owns this folder; claude plugin install will discard the edit on the next upgrade`
      : sourcePath === undefined ? REASON_NO_SOURCE
        : null
  const editWhy = text.kind === 'pending' ? 'reading the file…'
    : text.kind === 'unknown' ? text.why
      : 'there is nothing to edit yet'
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
        {/* M128. The Edit tab. It is PRESENT for every skill and disabled by
            NAME when it cannot run — a plugin's folder is owned by `claude
            plugin install` and an edit there vanishes on the next upgrade,
            which is the sentence worth saying. A removed tab would read as a
            feature that was never built. */}
        <div className="skill-node__tabs" data-skill-tabs>
          {(['read', 'edit'] as const).map((which) => {
            const reason = which === 'edit' ? editReason : null
            return (
              <button key={which} type="button" className="pf__verb pf__verb--word"
                data-skill-tab={which} data-selected={tab === which ? '' : undefined}
                disabled={reason !== null} title={reason ?? (which === 'read' ? 'Read this skill' : 'Edit this skill’s SKILL.md')}
                onMouseDown={press(() => { if (reason === null) setTab(which) })}>
                {which === 'read' ? 'Read' : 'Edit'}
              </button>
            )
          })}
        </div>
        {tab === 'edit' && (
          /* M128 fix. The rename and delete doors, wired at last: both
             channels existed with no renderer caller at all. They live BESIDE
             the editor rather than inside it because both are about the
             skill's FOLDER, which the editor never touches — it writes one
             file — and because both outlive a failed text read: a skill whose
             SKILL.md cannot be parsed is exactly one a user may want to
             delete. Each is present and disabled with its own reason. */
          <div className="skill-node__doors" data-skill-folder-doors>
            <input type="text" className="skill-editor__input" data-skill-rename-name
              value={renameTo} placeholder="new name" aria-label="New skill name"
              readOnly={editReason !== null}
              title={editReason ?? 'the folder this skill will be renamed to'}
              onMouseDown={(e) => e.stopPropagation()}
              onChange={(e) => setRenameTo(e.target.value)} />
            {door('rename', 'Rename', editReason ?? (renameTo.trim() === '' ? 'type the new name first' : null), () => {
              const to = renameTo.trim()
              if (to === '' || sourcePath === undefined) return
              setFolderResult('renaming…')
              void window.canvas.skill.rename({ cwd: entryCwd, dir: dirOf(sourcePath), name: to })
                .then((r) => {
                  setFolderResult(r.kind === 'renamed' ? `renamed to ${to}`
                    : r.kind === 'refused' ? r.why
                      : r.kind === 'failed' ? `the rename failed — ${r.why}` : r.kind)
                  // The shelf slot and the panel record follow only a rename
                  // that actually LANDED.
                  if (r.kind === 'renamed') { setRenameTo(''); props.onRenamed(id, to) }
                })
                .catch(() => setFolderResult('the rename did not answer'))
            })}
            {/* Two steps, and the second one NAMES the resource count: a
                delete trashes the whole folder, so what goes with the skill
                is the fact the user is agreeing to. */}
            {door('delete', arming ? 'Confirm delete' : 'Delete', editReason, () => {
              if (!arming) { setArming(true); return }
              if (sourcePath === undefined) return
              setArming(false)
              setFolderResult('deleting…')
              void window.canvas.skill.remove({ cwd: entryCwd, dir: dirOf(sourcePath) })
                .then((r) => {
                  if (r.kind === 'deleted') { props.onClose(id); return }
                  setFolderResult(r.kind === 'refused' ? r.why
                    : r.kind === 'failed' ? `the delete failed — ${r.why}` : r.kind)
                })
                .catch(() => setFolderResult('the delete did not answer'))
            })}
            {arming && (
              <span className="skill-node__line" data-skill-delete-confirm>{deleteConfirmText(name, entry?.resources)}</span>
            )}
            {folderResult !== null && (
              <span className="skill-node__line" data-skill-folder-result>{folderResult}</span>
            )}
          </div>
        )}
        {tab === 'edit' && sourcePath !== undefined && text.kind === 'some' ? (
          <SkillEditor
            panelId={id}
            sourcePath={sourcePath}
            cwd={entryCwd}
            text={text.text}
            stamp={stamp}
            truncated={text.truncated}
            frozen={readOnly ? REASON_MERGED_VIEW : null}
            onReload={() => setReadTick((t) => t + 1)}
          />
        ) : tab === 'edit' ? (
          <p className="skill-node__line" data-skill-edit-why>{editWhy}</p>
        ) : sections.map((section) => (
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
