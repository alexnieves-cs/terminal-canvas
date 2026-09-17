import { useState, type JSX } from 'react'
import type { PresetRow } from '../palette/commands'
import type { CenterView } from './useShellChrome'
import { shellControl } from './shell-control'
import { Check, ChevronDown, Lanes, PanelRight, Pin, ProductMark, Search } from '@renderer/icons'
import { Menu, MenuTrigger, MenuContent, MenuCheckboxItem, MenuRadioGroup, MenuRadioItem, SegmentedControl } from '@renderer/primitives'
import { LiveStatus } from './LiveStatus'

export interface TopBarProps {
  presets: PresetRow[]
  /** M65. The button opens the spawn sheet; ⌘N (the menu's accelerator) stays the instant default. */
  onOpenSheet: () => void
  /** M66. The active workspace's name, for the merged toggle's "back to …". */
  workspaceName?: string
  onSearch: () => void
  /** M257. The selected object's one task, when its ownership is unambiguous. */
  taskName?: string
  theme: 'system' | 'light' | 'dark'
  onSetTheme: (theme: 'system' | 'light' | 'dark') => void
  /** Whether M14's merged view is currently showing. */
  merged: boolean
  onToggleMerged: () => void
  /** M46. The context pane is on screen (a column, or a Compact drawer). */
  contextOpen: boolean
  onToggleContext: () => void
  /** (this redesign) Keeps the inspector open through the Compact breakpoint's own auto-collapse (`shell.inspectorPinned`). */
  inspectorPinned: boolean
  onToggleInspectorPinned: () => void
  /** M268. Center page: canvas or orchestration. */
  centerView: CenterView
  onSetCenterView: (view: CenterView) => void
  /** M279. The live status cluster: agents working and waiting, from the inspector's summary. */
  running: number
  waiting: number
  onJumpWaiting: () => void
}


/**
 * The visible verbs. Every one of them already existed as a chord or a palette
 * row; this bar is a second VIEW over them, which is why each handler is a
 * prop rather than an implementation.
 *
 * The spawn button routes through onSpawnPreset -> PaletteActions.spawnPreset
 * -> preset:spawn-by-id, i.e. main. That is not indirection for its own sake:
 * only main can resolve an ABSENT command into the user's login shell, so a
 * renderer-side spawn would launch a hardcoded shell for the built-in preset
 * and every user preset saved from a login-shell panel.
 *
 * Every control here mounts shellControl(), which preventDefaults its own
 * mousedown so DOM focus never leaves the terminal. A top bar that stole
 * focus would break the app's central promise — that bare keys reach the
 * agent — on the very first click, and silently: the button would work, and
 * the next keystroke would go nowhere.
 */
export function TopBar({
  presets, onOpenSheet, onSearch, merged, onToggleMerged, contextOpen, onToggleContext,
  workspaceName, taskName, theme, onSetTheme, inspectorPinned, onToggleInspectorPinned,
  centerView, onSetCenterView, running, waiting, onJumpWaiting
}: TopBarProps): JSX.Element {
  // The default preset if it can actually run, otherwise the first that can.
  // Availability matters here for the same reason it does in the palette: an
  // unavailable preset spawns a panel that dies instantly with "command not
  // found", which reads as the button being broken rather than as claude not
  // being on PATH.
  const fallback = presets.find((p) => p.available)
  const preferred = presets.find((p) => p.isDefault && p.available) ?? fallback
  // The outside-click listener this used to mount is Radix's now
  // (DismissableLayer), along with Escape, the arrow keys, Home/End, typeahead
  // and focus returned to the trigger — none of which this menu had.
  const [viewOpen, setViewOpen] = useState(false)

  return (
    <header className="shell__top" aria-label="Toolbar">
      {/*
        SPIKE. The bar was using roughly a quarter of its width — four small
        controls hard-left, two hard-right, and ~1000px of nothing between.
        This is the window's only fixed anchor and the one place display type
        costs nothing (it is inside the traffic-light clearance the bar now
        pays for itself, so it occupies space that was previously dead).
        aria-hidden: it is decoration, and the window already has a title.
      */}
      <span className="shell__mark" aria-hidden="true"><ProductMark /><span>canvas</span></span>

      {/* M268. Center-page swap: reachable without opening dock labels.
          M279: the segmented primitive; `.shell__center-toggle` / `.shell__center-btn`
          stay on the elements as the bar's own hooks. */}
      <SegmentedControl<CenterView>
        className="shell__center-toggle"
        label="Center view"
        value={centerView}
        onChange={onSetCenterView}
        options={[
          { id: 'canvas', label: 'Canvas', className: 'shell__center-btn' },
          { id: 'orchestration', label: 'Orchestrate', className: 'shell__center-btn' }
        ]}
      />

      <button
        type="button"
        className="shell__spawn"
        // M65. The button is the considered door (the sheet); ⌘N — the menu's
        // accelerator — stays the instant default. Never disabled: the sheet
        // can always take a typed command.
        title={preferred ? `Create… (⌘⇧N) — ⌘N starts ${preferred.name} at once` : 'Create… (⌘⇧N)'}
        {...shellControl(onOpenSheet)}
      >
        <span>+ Create</span> <kbd>⌘⇧N</kbd>
      </button>

      <div className="shell__workspace" title={taskName === undefined ? workspaceName : `${workspaceName} / ${taskName}`}>
        <span>{merged ? 'All workspaces' : (workspaceName ?? 'Workspace')}</span>
        {taskName !== undefined && <><span className="shell__breadcrumb-separator">/</span><span className="shell__task">{taskName}</span></>}
      </div>

      {/* M279. What the agents are doing, before the search: the one fact a
          person returning to the window wants first. Nothing at rest. */}
      <LiveStatus running={running} waiting={waiting} onJumpWaiting={onJumpWaiting} />

      <button type="button" className="shell__search" title="Search panels, files, tasks, commands…"
        {...shellControl(onSearch)}><Search /><span>Search panels, files, tasks, commands…</span><kbd>⌘K</kbd></button>
      {/* M276. The menu's BEHAVIOUR is the Menu primitive's; its look is these
          same classes, unchanged. `.shell__view` stays the positioned host and
          `.shell__view-menu` keeps its own `position: absolute` rule — Radix's
          popper wrapper is neutralised app-wide so the stylesheet still places
          this exactly where it placed it (styles.css, the one
          `[data-radix-popper-content-wrapper]` rule).

          `aria-haspopup` and `aria-expanded` are no longer written here: Radix
          derives both from the open flag, which is the point of adopting it —
          the pair cannot drift out of step with the state any more. */}
      <div className="shell__view">
        <Menu open={viewOpen} onOpenChange={setViewOpen}>
          <MenuTrigger className="shell__view-trigger">View <ChevronDown /></MenuTrigger>
          {/* forceMount + hidden, NOT Radix's unmount-on-close: `.shell__merge`
              below is clicked from outside this menu — by verify-panels-agents,
              verify-panels-kinds and shot.cjs's `merged` scene — and a row that
              is absent while closed reads to all of them as a deleted control.
              See MenuContent's note. */}
          <MenuContent forceMount>
            <div className="shell__view-menu" role="menu" aria-label="View" hidden={!viewOpen}>
              <div className="shell__view-heading">Appearance</div>
              {/* The three themes are mutually exclusive, so they are a real
                  radio group: a screen reader now says "2 of 3" where before
                  it read three unrelated checked states. The wrapping div the
                  group renders is layout-neutral HERE because
                  `.shell__view-menu` declares no `display` and its rows stack
                  as blocks — see MenuRadioGroup's note before reusing it. */}
              <MenuRadioGroup value={theme} onValueChange={(value) => onSetTheme(value as 'system' | 'light' | 'dark')}>
                {(['system', 'light', 'dark'] as const).map((value) => (
                  <MenuRadioItem key={value} value={value}><span className="shell__view-check">{theme === value && <Check />}</span>{value === 'system' ? 'System theme' : `${value[0]!.toUpperCase()}${value.slice(1)} theme`}</MenuRadioItem>
                ))}
              </MenuRadioGroup>
              <div className="shell__view-heading">Layout</div>
              <MenuCheckboxItem checked={contextOpen} onSelect={onToggleContext}
                className={`shell__inspector-toggle${contextOpen ? ' shell__inspector-toggle--on' : ''}`}
              ><span className="shell__view-check">{contextOpen && <Check />}</span><PanelRight /> Context pane <kbd>⇧⌘\\</kbd></MenuCheckboxItem>
              {/* (this redesign) Pin the inspector open THROUGH the Compact
                  breakpoint's own auto-collapse — a separate axis from
                  contextOpen above (open/closed at all), the way
                  `shell--inspector-pinned` is a separate class from
                  `shell--inspector-collapsed` in the stylesheet. */}
              <MenuCheckboxItem checked={inspectorPinned} onSelect={onToggleInspectorPinned}
                className={`shell__inspector-pin${inspectorPinned ? ' shell__inspector-pin--on' : ''}`}
                title={inspectorPinned ? 'Stop keeping the inspector open on a narrow window' : 'Keep the inspector open even when the window narrows'}
              ><span className="shell__view-check">{inspectorPinned && <Check />}</span>{Pin} Pin inspector open</MenuCheckboxItem>
              {/* aria-pressed is kept BESIDE Radix's aria-checked: verify:panels
                  reads it (`.shell__merge` → aria-pressed) as the merged
                  view's state, and it is the same fact under another name. */}
              <MenuCheckboxItem checked={merged} onSelect={onToggleMerged} aria-pressed={merged}
                className={`shell__merge${merged ? ' shell__merge--on' : ''}`}
              ><span className="shell__view-check">{merged && <Check />}</span><Lanes /> Merged view</MenuCheckboxItem>
              {/* A toggle, not one of a set — so a checkbox row, which is what
                  it always behaved as. It was announced as `menuitemradio`
                  with no group to be one of. */}
              <MenuCheckboxItem checked={centerView === 'orchestration'}
                onSelect={() => onSetCenterView(centerView === 'orchestration' ? 'canvas' : 'orchestration')}
              >
                <span className="shell__view-check">{centerView === 'orchestration' && <Check />}</span>
                Orchestration view
              </MenuCheckboxItem>
            </div>
          </MenuContent>
        </Menu>
      </div>
    </header>
  )
}
