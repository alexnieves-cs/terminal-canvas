import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { isChatPanel, isSkillPanel, isTerminalPanel, isToolboxPanel, type Panel } from '@renderer/panels/panels'
import type { PaletteActions } from '@renderer/palette/commands'
import type { Point } from './viewport'
import { inspectionDirectory } from './inspection-directory'
import type { useRailModels } from './useRailModels'
import { displayPath } from '@shared/display-path'
import { laneOfPath } from '@shared/work-scope'
import { parseSkillKey, renameInShelf, skillKey, UNGROUPED_COLUMN_ID, type Shelf, type ShelfColumn, type SkillKey } from '@shared/skills'
import type { NamedToolEntry, ToolInventoryResult, ToolScope } from '@shared/toolbox'
import type { PersistedTeammate } from '@shared/teammates'
import type { WorktreeListRow } from '@shared/ipc-contract'
import { buildSkillColumns, type SkillPaneKind } from '@renderer/shell/skills-pane-model'
import type { ShelfState, SkillsInventoryState } from '@renderer/shell/SkillsPane'
import { recentSkillUses } from '@renderer/skills/skill-trail-store'

/**
 * M499 (E4, the Canvas.tsx split). The Skills pane's state and props, lifted
 * out of Canvas VERBATIM as one contiguous run: it sat between `boardPaneProps`
 * and `teammatesPaneProps`, and the call stays at exactly that position. Every
 * value it reads from Canvas is a dependency named here; every value Canvas
 * reads back (the shelf for the canvas's skill cards, the "Available in"
 * sources, the one rename door, the pane's props) is returned.
 */

// M137. Moved below the import block, where a module-scope constant belongs.
const EMPTY_SHELF: Shelf = { columns: [] }
/** Field by field, never a spread — a spread writes `key: undefined`. */
const carryOneColumn = (c: ShelfColumn): ShelfColumn => ({ id: c.id, title: c.title, keys: [...c.keys] })

export interface SkillsPaneDeps {
  panels: Panel[]
  panelsRef: { readonly current: Panel[] }
  setPanels: (update: (current: Panel[]) => Panel[]) => void
  commitHistory: (next: Panel[]) => void
  selectedId: string | null
  railRows: ReturnType<typeof useRailModels>['railRows']
  teammates: PersistedTeammate[] | null
  reloadTeammates: () => void
  toggleNavigator: () => void
  worktreeRows: WorktreeListRow[]
  paletteActionsRef: { readonly current: PaletteActions | null }
  worldCentre: () => Point
}

export function useSkillsPane(deps: SkillsPaneDeps) {
  const {
    panels, panelsRef, setPanels, commitHistory, selectedId, railRows, teammates, reloadTeammates,
    toggleNavigator, worktreeRows, paletteActionsRef, worldCentre
  } = deps
  /* ---------------------------------------------------------- M127: skills --
   * The Skills pane's state: the shelf (a TOP-LEVEL record, read and written
   * through its own pair of invokes — never through the undo history, which
   * is layout's, and never through `layout:save`, which carries one
   * workspace's CanvasState), the inventory for the SELECTED panel's cwd (the
   * inspector's Toolbox section's own rule, its `no-cwd` arm included), and
   * the three filters.
   */
  const [shelf, setShelf] = useState<Shelf>(EMPTY_SHELF)
  // The shelf's own three states, kept apart from the inventory's: an
  // unread shelf and an empty shelf paint the same columns, and only one of
  // them means "a card you move now will not be saved". A rejected invoke
  // used to be an unhandled rejection with an empty pane and nothing on
  // screen saying why — this is that failure, named.
  const [shelfState, setShelfState] = useState<ShelfState>({ kind: 'pending' })
  // The shelf as a ref, for the same reason panelsRef exists: a rename has
  // to read the CURRENT shelf outside a state updater.
  const shelfRef = useRef(shelf)
  shelfRef.current = shelf
  useEffect(() => {
    void window.canvas.shelf.list()
      .then((s) => { setShelf(s); setShelfState({ kind: 'loaded' }) })
      .catch((e) => setShelfState({ kind: 'unavailable', why: String(e && (e as Error).message ? (e as Error).message : e) }))
  }, [])
  const writeShelf = useCallback((next: Shelf): void => {
    setShelf(next)
    void window.canvas.shelf.save(next)
      .then((s) => { setShelf(s); setShelfState({ kind: 'loaded' }) })
      .catch((e) => setShelfState({ kind: 'unavailable', why: String(e && (e as Error).message ? (e as Error).message : e) }))
  }, [])
  /**
   * M129 fix. One rename, two authorities, ONE call.
   *
   * The panel record holds `{scope, name}` and the shelf holds
   * `scope:name` — a rename that moved the folder and updated neither would
   * leave the panel describing a skill that is gone and the shelf slot
   * rendering `not installed here`, which is indistinguishable from a skill
   * that was never installed. The record goes through `commitHistory` (it is
   * layout); the shelf goes through its own invoke (it is a library).
   */
  const renameSkillEverywhere = useCallback((panelId: string, newName: string): void => {
    // Read through the REF, never inside a setPanels updater: an updater
    // must stay pure (this file's own rule, stated at commitHistory), and
    // this one has to fire an invoke and a second setState.
    const target = panelsRef.current.find((p) => p.rect.id === panelId)
    if (target === undefined || !isSkillPanel(target)) return
    const scope = target.skill.scope
    const oldName = target.skill.name
    setPanels((current) => {
      const next = current.map((p) =>
        p.rect.id === panelId && isSkillPanel(p) ? { ...p, skill: { scope, name: newName } } : p)
      commitHistory(next)
      return next
    })
    const carried = renameInShelf(shelfRef.current, skillKey(scope, oldName), skillKey(scope, newName))
    setShelf(carried)
    void window.canvas.shelf.save(carried)
      .then((saved) => { setShelf(saved); setShelfState({ kind: 'loaded' }) })
      .catch((e) => setShelfState({ kind: 'unavailable', why: String(e && (e as Error).message ? (e as Error).message : e) }))
    setSkillsReadTick((t) => t + 1)
  }, [commitHistory])
  const [skillKindTab, setSkillKindTab] = useState<SkillPaneKind>('skill')
  const [skillQuery, setSkillQuery] = useState('')
  const [skillScopes, setSkillScopes] = useState<ToolScope[] | null>(null)
  const [skillPlacedOnly, setSkillPlacedOnly] = useState(false)
  // M131 fix round 2. Main's REAL verdict on the assign door's last save —
  // never the renderer's own advisory guess. Absent means nothing to say;
  // it is not persisted and clears on the pane's next assignment.
  const [skillAssignNotice, setSkillAssignNotice] = useState<string | null>(null)
  // M194. The inspector's Toolbox rule, ASKED rather than copied. This was a
  // third hand-written copy of it, and the moment the inspector's own rule
  // learned about chats it began to disagree with this one silently: the
  // Tools section would list a conversation's commands while the pane one
  // dock row away said "no directory" about the same folder. `skillsCwd`
  // also feeds `skill:create` and the assign door, so a sandbox chat — which
  // the policy answers `absent` for — must not reach either.
  const skillsCwd = (() => {
    const d = inspectionDirectory(panels.find((x) => x.rect.id === selectedId), 'tools')
    return d.kind === 'known' ? d.cwd : null
  })()
  const [skillsInventory, setSkillsInventory] = useState<ToolInventoryResult | undefined>(undefined)
  // M129 fix. Main's own answer to the last `skill:create`, as a sentence —
  // the refusals (an existing name, a plugin's folder, a path outside every
  // writable root) all arrive here, and a door that swallowed them would
  // leave the user watching a pane that never grew a card.
  const [newSkillResult, setNewSkillResult] = useState<string | null>(null)
  // Bumped after a create, a rename or a delete so the pane and the panels
  // re-read the inventory through the ordinary door rather than being handed
  // a row this renderer invented.
  const [skillsReadTick, setSkillsReadTick] = useState(0)
  useEffect(() => {
    // Cleared before the invoke, never after: the `live` flag stops a stale
    // WRITE and nothing stops the stale RENDER, so panel A's skills would sit
    // under panel B's heading for a whole round trip.
    setSkillsInventory(undefined)
    if (selectedId === null || skillsCwd === null) return
    let live = true
    void window.canvas.toolbox.read({ panelId: selectedId, cwd: skillsCwd })
      .then((r) => { if (live) setSkillsInventory(r) })
      // M194. A rejected read is NOT a panel without a directory. The pane
      // grew an `unavailable` arm this milestone and this is the only site
      // that can produce a rejection; laundering it into `no-cwd` here would
      // print "no directory" over a folder the user is looking at.
      .catch(() => { if (live) setSkillsInventory({ kind: 'unavailable', reason: 'the skills read did not answer' }) })
    return () => { live = false }
  }, [selectedId, skillsCwd, skillsReadTick])
  /**
   * M128. Every OPEN panel that HAS a directory, with the rail's own label.
   * The skill panel asks each one's inventory — the cache is keyed by
   * resolved cwd, so twelve panels in one repository cost one parse — and
   * that list is also the answer to "which panels can see this skill".
   * A panel with no directory is absent rather than listed as "no": it was
   * never a candidate, and listing it would read as a refusal.
   */
  // M137. Terminal, chat and toolbox panels only: a watcher's cwd is deliberately
  // absent from "Available in" — a watcher runs a command, it never reads a skill.
  const skillSources = useMemo(() => panels.flatMap((p) => {
    const cwd = isTerminalPanel(p) ? p.spec.cwd : isChatPanel(p) ? p.chat.cwd : isToolboxPanel(p) ? p.source.cwd : undefined
    if (cwd === undefined || cwd === '') return []
    return [{ panelId: p.rect.id, cwd, label: railRows.find((r) => r.id === p.rect.id)?.label ?? p.rect.id }]
  }), [panels, railRows])
  // M256. Keyed on a SIGNATURE of the skill panels, never on `panels`: the
  // array changes identity on every drag frame, and the Skills pane's props
  // must not rebuild at 60Hz for a fact that changes when a panel opens.
  const placedSkillSig = panels.filter(isSkillPanel).map((p) => skillKey(p.skill.scope, p.skill.name)).sort().join('\n')
  const placedSkillKeys = useMemo<ReadonlySet<SkillKey>>(() => new Set(placedSkillSig === '' ? [] : placedSkillSig.split('\n')), [placedSkillSig])
  const skillsPaneProps = useMemo(() => {
    const entries = skillsInventory?.kind === 'inventory' ? skillsInventory.inventory.entries : []
    const state: SkillsInventoryState =
      skillsCwd === null ? { kind: 'no-cwd' }
        : skillsInventory === undefined ? { kind: 'pending' }
          : skillsInventory.kind === 'no-cwd' ? { kind: 'no-cwd' }
            : skillsInventory.kind === 'unavailable' ? { kind: 'unavailable', why: skillsInventory.reason }
            : { kind: 'inventory', readAt: skillsInventory.inventory.readAt }
    const paneColumns = buildSkillColumns(entries, shelf, { kind: skillKindTab, query: skillQuery, scopes: skillScopes, placedOnly: skillPlacedOnly })
    // M131. A project-scoped key's repository, read back out of the
    // inventory's own `sourcePath` (`<root>/.claude/skills/<name>/SKILL.md`)
    // — the assign door's own check, so a bad assignment is refused before
    // it ever reaches `teammate:save`. `insidePlace` runs with an identity
    // realpath: the renderer has no filesystem, and the real, symlink-
    // resolved check is main's own at the one brief-append site, which never
    // trusts this one.
    const repoRootOfKey = (key: SkillKey): string | null => {
      const parsed = parseSkillKey(key)
      if (parsed === null || parsed.scope !== 'project') return null
      const entry = entries.find((e): e is NamedToolEntry => 'name' in e && e.scope === parsed.scope && e.name === parsed.name)
      if (entry === undefined) return null
      const suffix = `/.claude/skills/${parsed.name}/SKILL.md`
      return entry.sourcePath.endsWith(suffix) ? entry.sourcePath.slice(0, -suffix.length) : null
    }
    // M131 fix round 2. A light, renderer-side prefix check — kept ONLY as
    // an early sentence, never the authority: `@shared/places` pulls in
    // `node:path`, which the renderer cannot bundle (it has no filesystem to
    // realpath against anyway), so this can be wrong in either direction. It
    // no longer blocks the save — main's own `saveTeammate` now computes the
    // REAL (symlink-resolved) verdict on the same cwd and returns
    // `notVisible` on its response, which is what `skillAssignNotice` below
    // actually renders; a card the pane shows as "saved" never silently
    // fails to reach the agent (this repo's "row that disappears" rule).
    const roughlyInside = (repoRoot: string, places: readonly string[]): boolean =>
      places.some((p) => { const norm = p.replace(/\/+$/, ''); return repoRoot === norm || repoRoot.startsWith(norm + '/') })
    const assignOne = (key: SkillKey, teammateId: string): void => {
      const t = (teammates ?? []).find((x) => x.id === teammateId)
      if (t === undefined) return
      const repoRoot = repoRootOfKey(key)
      if (repoRoot !== null && !roughlyInside(repoRoot, t.places)) {
        setSkillAssignNotice(`this may not be visible to ${t.name} yet — ${repoRoot} looks outside their places; saving anyway to let main's real check decide`)
      } else {
        setSkillAssignNotice(null)
      }
      const merged = Array.from(new Set([...(t.skills ?? []), key]))
      void window.canvas.teammate.save({ ...t, skills: merged }, skillsCwd ?? undefined).then((r) => {
        reloadTeammates()
        if (r.notVisible !== undefined && r.notVisible.length > 0) {
          setSkillAssignNotice(r.notVisible.map((n) => `not visible to ${t.name}: ${n.repoRoot} is outside their places`).join('; '))
        } else {
          setSkillAssignNotice(null)
        }
      })
    }
    return {
      onToggle: toggleNavigator,
      state,
      shelfState,
      // M129 fix. The `skill:create` door. The scope names a ROOT main
      // derives itself from the asking cwd — the renderer sends the word,
      // never a path. The project word stays present and disabled with its
      // reason when no selected panel has a directory.
      // M194 opened this arm. Before it, `skillsCwd` answered for terminal and
      // toolbox panels only, and a terminal's record carries the cwd the user
      // ASKED for — M37 applies the lane at spawn — so a worktree lane could
      // not reach this door. A DISPATCHED chat's `chat.cwd` IS the lane
      // (`board-lane.ts`), and main derives the project root from the cwd it is
      // handed (`skill-write.ts`'s `rootsOf`), so a project skill written from
      // one would land in `userData/worktrees/tc/…/.claude/skills` and vanish
      // with the lane, having never been in the repository the person meant.
      // M196 (D04) closed it. Main translates a lane to its record's root
      // before deriving the project skill root, the same subject the Places
      // gate already judges, so a project skill written from a dispatched
      // conversation lands in the repository the person meant. What was a
      // REFUSAL is now a statement: the door stays open and says where the
      // file will go, because a person writing a project skill from a lane
      // needs to know which repository gets it — the folder in the header is
      // not that repository.
      projectScopeReason: skillsCwd === null || skillsCwd === ''
        ? 'select a panel with a directory to write a skill into its repository'
        : null,
      // The lane STATEMENT, which is not a refusal: the row stays enabled and
      // says which repository the write reaches. `laneOfPath` is the one
      // containment rule main asks too, replacing the prefix test written here
      // by hand — the same fact answered twice was D04's subject.
      projectScopeNote: (() => {
        if (skillsCwd === null || skillsCwd === '') return null
        const lane = laneOfPath(skillsCwd, worktreeRows)
        return lane === undefined ? null : `this conversation works in a ${lane.branch} lane — a project skill goes to ${displayPath(lane.root).short}, the repository it was cut from`
      })(),
      newSkillResult,
      onNewSkill: (scope: 'user' | 'project', name: string) => {
        setNewSkillResult(`creating ${name}…`)
        void window.canvas.skill.create({ cwd: skillsCwd ?? '', scope, name })
          .then((r) => {
            setNewSkillResult(
              r.kind === 'created' ? `created ${r.path}`
                : r.kind === 'refused' ? r.why
                  : r.kind === 'failed' ? `the skill could not be created — ${r.why}`
                    : r.kind
            )
            // Re-read through the ordinary door: the card must come from the
            // inventory, never from a row invented here.
            if (r.kind === 'created') setSkillsReadTick((t) => t + 1)
          })
          .catch(() => setNewSkillResult('the create did not answer'))
      },
      columns: paneColumns,
      // M256. The workspace's canvas facts: which skills already have a panel,
      // the one door that opens one, and a usage snapshot read on open.
      placedKeys: placedSkillKeys,
      onPlaceOnCanvas: (scope: ToolScope, name: string) => { paletteActionsRef.current?.openSkillPanel(scope, name, worldCentre()) },
      readUsage: () => recentSkillUses(panelsRef.current.map((p) => ({ id: p.rect.id, kind: p.kind, label: railRows.find((r) => r.id === p.rect.id)?.label ?? p.rect.id }))),
      teammates: teammates ?? [],
      assignNotice: skillAssignNotice,
      onAssignColumn: (columnId: string, teammateId: string) => {
        const col = paneColumns.find((c) => c.id === columnId)
        if (col === undefined) return
        for (const card of col.cards) assignOne(card.key, teammateId)
      },
      onAssignCard: (key: SkillKey, teammateId: string) => assignOne(key, teammateId),
      kind: skillKindTab,
      onChooseKind: setSkillKindTab,
      query: skillQuery,
      onQuery: setSkillQuery,
      scopes: skillScopes,
      onToggleScope: (scope: ToolScope) => setSkillScopes((cur) => {
        // A pressed scope on its own means "only this"; pressing it again is
        // every scope, never an empty list — a filter that can hide
        // everything reads as a broken pane.
        if (cur !== null && cur.length === 1 && cur[0] === scope) return null
        return [scope]
      }),
      placedOnly: skillPlacedOnly,
      onTogglePlacedOnly: () => setSkillPlacedOnly((v) => !v),
      onPlace: (key: SkillKey, columnId: string) => {
        // The override, written whole: the key leaves every column it was in
        // and joins exactly one. A card dropped where it already sits is a
        // no-op rather than a duplicate.
        const columns = shelf.columns.map((c) => ({ id: c.id, title: c.title, keys: c.keys.filter((k) => k !== key) }))
        const target = columns.find((c) => c.id === columnId)
        if (target === undefined) {
          if (columnId !== UNGROUPED_COLUMN_ID) return
          columns.push({ id: UNGROUPED_COLUMN_ID, title: 'Ungrouped', keys: [key] })
        } else target.keys.push(key)
        writeShelf({ columns })
      },
      onNewColumn: () => {
        const id = `col-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`
        writeShelf({ columns: [...shelf.columns.map(carryOneColumn), { id, title: `collection ${shelf.columns.length + 1}`, keys: [] }] })
      },
      onDeleteColumn: (id: string) => {
        // Ungrouped refuses in the model AND here: the pane's control is
        // disabled with the reason, and this is the door a later caller would
        // otherwise reach past it.
        if (id === UNGROUPED_COLUMN_ID) return
        writeShelf({ columns: shelf.columns.filter((c) => c.id !== id).map(carryOneColumn) })
      }
    }
  // `worktreeRows` is a useState array (EMPTY_WORKTREES until a read lands),
  // so its identity is stable between reads and naming it here costs no churn.
  // Omitting it left the lane refusal frozen at whatever it was when another
  // dep last changed — the kind of staleness that shows up as a door that is
  // enabled when it should not be, only sometimes.
  }, [toggleNavigator, shelf, shelfState, newSkillResult, skillsInventory, skillsCwd, worktreeRows, skillKindTab, skillQuery, skillScopes, skillPlacedOnly, writeShelf, teammates, reloadTeammates, skillAssignNotice, placedSkillKeys, railRows, worldCentre])

  return { shelf, skillSources, renameSkillEverywhere, skillsPaneProps }
}
