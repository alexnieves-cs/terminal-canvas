import { useEffect, useState, type JSX } from 'react'
import type { PresetRow } from '../palette/commands'
import type { CenterView } from './useShellChrome'
import { shellControl } from './shell-control'
import { Check, ChevronDown, Lanes, PanelLeft, PanelRight, Pin, ProductMark, Search } from '@renderer/icons'
import { Menu, MenuTrigger, MenuContent, MenuCheckboxItem, MenuRadioGroup, MenuRadioItem, SegmentedControl } from '@renderer/primitives'
import { LiveStatus } from './LiveStatus'
import { AccountMenu } from '../account/AccountMenu'
import { initialsOf } from '../account/account-model'
import type { Accounts } from '../account/useAccounts'
import { sessionCountLabel, sessionsBadgeLabel, useAttentionCensus } from '@renderer/canvas/command-pill'
import { useAttentionQueue } from '@renderer/session/useAttentionQueue'

export interface TopBarProps {
  presets: PresetRow[]
  /** M65. The button opens the spawn sheet; ⌘N (the menu's accelerator) stays the instant default. */
  onOpenSheet: () => void
  /** M66. The active workspace's name, for the merged toggle's "back to …". */
  workspaceName?: string
  onSearch: () => void
  /** M257. The selected object's one task, when its ownership is unambiguous — on whichever center view is showing. */
  taskName?: string
  /** Navigation hierarchy. The workspace crumb's door: the navigator's Workspaces pane. */
  onShowWorkspaces?: () => void
  /** Navigation hierarchy. The task crumb's door: frame the task on the canvas. Absent = the crumb is plain text. */
  onShowTask?: () => void
  theme: 'system' | 'light' | 'dark'
  onSetTheme: (theme: 'system' | 'light' | 'dark') => void
  /** Whether M14's merged view is currently showing. */
  merged: boolean
  onToggleMerged: () => void
  /** M46. The context pane is on screen (a column, or a Compact drawer). */
  contextOpen: boolean
  onToggleContext: () => void
  /**
   * M404 (critic). The navigator is on screen. ⌘\ shows or hides whichever
   * pane it holds, and the View menu is where a chord is learned — the dock
   * no longer claims it, so without this row nothing on screen named it.
   * Absent = no row (a caller with no navigator).
   */
  navigatorOpen?: boolean
  onToggleNavigator?: () => void
  /** (this redesign) Keeps the inspector open through the Compact breakpoint's own auto-collapse (`shell.inspectorPinned`). */
  inspectorPinned: boolean
  onToggleInspectorPinned: () => void
  /** M268. Center page: canvas or orchestration. */
  centerView: CenterView
  onSetCenterView: (view: CenterView) => void
  /** M279. The live status cluster: agents working and waiting, from the inspector's summary. */
  running: number
  waiting: number
  /**
   * M438. How many sessions the bar names. Canvas passes the terminal and
   * chat count. Absent: the bar counts those panels itself, on a slow tick.
   * A non-positive count draws nothing.
   */
  sessionCount?: number
  onJumpWaiting: () => void
  /** M336. The signed-in accounts; the menu is absent when accounts are unconfigured and nobody is signed in. */
  accounts?: Accounts
  /** M404 (C3). The active workspace is a shared one — the People segment shows then even signed out. */
  sharedWorkspace?: boolean
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
  presets, onOpenSheet, onSearch, merged, onToggleMerged, contextOpen, onToggleContext, navigatorOpen, onToggleNavigator,
  workspaceName, taskName, onShowWorkspaces, onShowTask, theme, onSetTheme, inspectorPinned, onToggleInspectorPinned,
  centerView, onSetCenterView, running, waiting, onJumpWaiting, accounts, sharedWorkspace = false, sessionCount
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
  // M404 (C3). People is a place only for someone with people to see: signed
  // in, or on a shared workspace. Otherwise it was a top-level page saying
  // "run tc login" with no button. The palette's "Show People" row stays, and
  // the segment stays while the view is showing, so the pressed place never
  // vanishes from under the person looking at it.
  const showPeople = (accounts?.sessions.length ?? 0) > 0 || sharedWorkspace || centerView === 'team'
  const attentionQueue = useAttentionQueue(useAttentionCensus())
  const badge = sessionsBadgeLabel(attentionQueue.length)
  const observed = useObservedSessionCount(sessionCount)
  const sessionsLabel = sessionCountLabel(observed)

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
      {/* M303 (Quiet instrument). The mark alone: the name was the bar's
          loudest text and said nothing the window title does not — the bar
          now leads with WHERE you are (the crumb), not what the app is. */}
      <span className="shell__mark" aria-hidden="true"><ProductMark /></span>

      {/* M268. Center-page swap: reachable without opening dock labels.
          M279: the segmented primitive; `.shell__center-toggle` / `.shell__center-btn`
          stay on the elements as the bar's own hooks. */}
      <SegmentedControl<CenterView>
        className="shell__center-toggle"
        label="Center view"
        value={centerView}
        onChange={onSetCenterView}
        // Each place is introduced by its PURPOSE under its name — the two
        // are different jobs, not two views of one thing, and a bare
        // "Orchestrate" never said what a person goes there to do. The name
        // stays first: it is what the dock, the palette and the docs call it.
        options={[
          { id: 'canvas', label: <><span className="shell__center-name">Canvas</span><span className="shell__center-purpose">Arrange and work</span></>, title: 'Canvas — arrange and work: your objects, where you edit and run them', className: 'shell__center-btn' },
          { id: 'sessions', label: <><span className="shell__center-name">Sessions{badge !== null && <span className="shell__nav-badge" data-sessions-badge>{badge}</span>}</span></>, title: 'Sessions', className: 'shell__center-btn' },
          { id: 'review', label: <><span className="shell__center-name">Review</span></>, title: 'Review', className: 'shell__center-btn' },
          // D2. Orchestrate is not a tab. The segment stays in this control so
          // the panels harness can still press [data-seg="orchestration"];
          // the F3 stylesheet clips it. The doors a person uses are the View
          // menu row, the palette, and the Sessions header link.
          { id: 'orchestration', label: <><span className="shell__center-name">Orchestrate</span><span className="shell__center-purpose">Monitor and review</span></>, title: 'Show Orchestrate', className: 'shell__center-btn' },
          // M404 (C1). "People", not a second name for teammates. The code id
          // stays `team`. Conditional: only when there are people to see.
          ...(showPeople ? [{ id: 'team' as const, label: <><span className="shell__center-name">People</span><span className="shell__center-purpose">See who is working</span></>, title: 'People — see who is working: your organization, what each person is on, and a read-only look at their canvas', className: 'shell__center-btn' }] : [])
        ]}
      />

      <button
        type="button"
        className="shell__spawn"
        // M65. The button is the considered door (the sheet); ⌘N — the menu's
        // accelerator — stays the instant default. Never disabled.
        // M315. It opens the TASK sheet: the header's one creation button is
        // the primary journey's front door, and the sheet's own header already
        // called Task "the primary route" while this button landed on Panel.
        // ⌘⇧N stays the expert door to a raw panel, so the button no longer
        // shows it as its own shortcut.
        title={preferred ? `Start a task — an agent works on a repository on its own branch. A raw panel is one switch away in the sheet, or ⌘⇧N; ⌘N starts ${preferred.name} at once` : 'Start a task — an agent works on a repository on its own branch. A raw panel is one switch away in the sheet, or ⌘⇧N'}
        tabIndex={-1}
        {...shellControl(onOpenSheet)}
      >
        <span>+ New task</span>
      </button>

      {/* Navigation hierarchy: workspace → selected task, persistent across BOTH center
          views (the task follows the selection on the page showing). Each crumb is a
          door to the thing it names — the Workspaces pane, the task framed on the canvas
          — so the bar answers "what am I looking at" and "what will this affect". The
          task crumb is absent, not "No task", when there is none: a rest-layer fact is
          never a zero-value statement. */}
      <nav className="shell__workspace" aria-label="Location" title={taskName === undefined ? workspaceName : `${workspaceName} / ${taskName}`}>
        {onShowWorkspaces === undefined
          ? <span>{merged ? 'All workspaces' : (workspaceName ?? 'Workspace')}</span>
          // M404 (C1). Styled as what it is — a workspace SWITCHER, with a
          // chevron — because nobody guessed a bare name was clickable. It is
          // the Workspaces door now that the dock's duplicate is gone (C2).
          : <button type="button" className="shell__crumb shell__crumb--switcher" data-crumb="workspace"
              title="Switch workspace — or add, rename and see history in the Workspaces list" {...shellControl(onShowWorkspaces)}>
              <span className="shell__crumb-name">{merged ? 'All workspaces' : (workspaceName ?? 'Workspace')}</span><ChevronDown />
            </button>}
        {taskName !== undefined && <><span className="shell__breadcrumb-separator" aria-hidden="true">/</span>
          {onShowTask === undefined
            ? <span className="shell__task" aria-current="location">{taskName}</span>
            : <button type="button" className="shell__crumb shell__task" aria-current="location" title={`Show ${taskName} on the canvas`} {...shellControl(onShowTask)}>{taskName}</button>}</>}
      </nav>

      {sessionsLabel !== '' && <span className="shell__sessions" data-session-count>{sessionsLabel}</span>}

      <button type="button" className="shell__search" title="Search panels, files, tasks, commands…"
        {...shellControl(onSearch)}><Search /><span>Find or run anything</span><kbd>⌘K</kbd></button>

      {/* M279. What the agents are doing, at the bar's right after the field
          (the reference pass moved it from before the field): the one fact a
          person returning to the window wants first. Nothing at rest. */}
      <LiveStatus running={running} waiting={waiting} onJumpWaiting={onJumpWaiting} />
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
              {onToggleNavigator !== undefined && (
                <MenuCheckboxItem checked={navigatorOpen === true} onSelect={onToggleNavigator} data-view-navigator
                ><span className="shell__view-check">{navigatorOpen === true && <Check />}</span><PanelLeft /> Navigator <kbd>{'⌘\\'}</kbd></MenuCheckboxItem>
              )}
              <MenuCheckboxItem checked={contextOpen} onSelect={onToggleContext}
                className={`shell__inspector-toggle${contextOpen ? ' shell__inspector-toggle--on' : ''}`}
              ><span className="shell__view-check">{contextOpen && <Check />}</span><PanelRight /> Context pane <kbd>{'⇧⌘\\'}</kbd></MenuCheckboxItem>
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
                title="Show Orchestrate"
                data-view-orchestrate
              >
                <span className="shell__view-check">{centerView === 'orchestration' && <Check />}</span>
                Orchestrate
              </MenuCheckboxItem>
            </div>
          </MenuContent>
        </Menu>
      </div>
      {/* M336. Last in the bar, where an account lives in every Mac app with
          one: WHO the doors act as is a fact about the window, not the canvas. */}
      {accounts !== undefined && accounts.sessions.slice(1, 3).map((session) => (
        <span key={session.githubLogin} className="shell__avatar" aria-hidden="true" title={session.githubLogin}>{initialsOf(session.githubLogin)}</span>
      ))}
      {accounts !== undefined && <AccountMenu accounts={accounts} />}
    </header>
  )
}

/**
 * Terminal and chat panels are the sessions the bar counts. Notes and
 * pictures are objects, not sessions. A passed `sessionCount` wins; otherwise
 * the bar looks, on a slow tick, so an xterm redraw does not recount.
 */
function useObservedSessionCount(override: number | undefined): number {
  const [seen, setSeen] = useState(0)
  useEffect(() => {
    if (override !== undefined) return
    const count = (): number => document.querySelectorAll('[data-panel-kind="terminal"], [data-panel-kind="chat"]').length
    const update = (): void => {
      setSeen((prev) => {
        const next = count()
        return prev === next ? prev : next
      })
    }
    update()
    const timer = window.setInterval(update, 1000)
    return () => window.clearInterval(timer)
  }, [override])
  return override ?? seen
}
