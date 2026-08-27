import type { Command } from './palette-model'
// Type-only: SettingRow/SettingValue are Task 4's ipc-contract additions.
// Erased by esbuild, so it costs verify:palette nothing that the bundle
// otherwise has no @shared import at all (the alias is wired pre-emptively
// for exactly this day).
import type { SettingRow, WorkspaceRow } from '@shared/ipc-contract'
import type { SettingValue } from '@shared/settings-schema'

/**
 * The palette's command list, built from PLAIN DATA and callbacks.
 *
 * Nothing here touches the registry, the DOM, or IPC — that is what keeps it
 * in the plain-node verify:palette tier, the same dependency-injection move
 * session-registry.ts makes with its bridge and terminal factory. The callers
 * of these callbacks live in Canvas.tsx, where the registry actually is.
 */

/** A preset as the palette needs it: main answers preset:list with these. */
export interface PresetRow {
  id: string
  name: string
  /** Its command is on the resolved login PATH. Only main can know this. */
  available: boolean
  /** Built-ins are code, not data: they refuse rename and delete. */
  builtIn: boolean
  isDefault: boolean
  /** cwd, and the command if there is one. Searchable via filterCommands. */
  subtitle: string
}

export interface PromptRow {
  id: string
  name: string
  /** 'saved' is the store in layout.json; 'project' is .claude/commands. */
  source: 'saved' | 'project'
}

export interface PanelRow {
  id: string
  label: string
  /** The user's name for it, if set. Shown so the rename row can echo it. */
  title?: string
}

export interface PaletteActions {
  spawnPreset(id: string): void
  beginRenamePreset(id: string, currentName: string): void
  deletePreset(id: string): void
  setDefaultPreset(id: string): void
  goToPanel(id: string): void
  insertPrompt(id: string): void
  beginSavePrompt(): void
  deletePrompt(id: string): void
  beginRenamePanel(id: string, currentTitle: string): void
  resetCanvas(): void
  zoomToFit(): void
  /**
   * Task 7 implements the real wiring (main's settings:set, then a reload of
   * the row list from the answer it gives back — never an optimistic local
   * flip, because main can refuse an id or a type). REQUIRED, not optional:
   * an optional member here would let Canvas.tsx's paletteActions object
   * satisfy this interface while wiring only the `settings` prop and
   * forgetting this callback (or vice versa), and tsc would say nothing — the
   * exact silent gap "a row that disappears is indistinguishable from a
   * feature that is missing" warns about elsewhere in this file. Required
   * forces a type-satisfying stub at both call sites until Task 7 replaces
   * them with the real thing; see Palette.tsx and Canvas.tsx.
   */
  toggleSetting(id: string, value: SettingValue): void
  /**
   * Open the palette's input mode on a number setting. Required, not
   * optional, for the same reason toggleSetting is: an optional member is a
   * compile-time hole a half-finished wiring passes straight through.
   */
  beginEditSetting(id: string, label: string, current: number): void
  switchWorkspace(id: string): void
  beginCreateWorkspace(): void
  beginRenameWorkspace(id: string, currentName: string): void
  /**
   * `liveCount` is passed in rather than looked up because the confirm names
   * it, and the row is the only place that knows both the workspace and the
   * renderer's session set.
   */
  deleteWorkspace(id: string, name: string, liveCount: number): void
}

export interface PaletteContext {
  presets: PresetRow[]
  prompts: PromptRow[]
  panels: PanelRow[]
  /**
   * Empty until Task 7 loads it from `window.canvas.settings.list()`.
   * REQUIRED for the same reason toggleSetting is required above — leaving it
   * optional is a compile-time hole a half-finished Task 7 wiring could pass
   * straight through.
   */
  settings: SettingRow[]
  workspaces: WorkspaceRow[]
  /**
   * Panel ids currently in wants-you, from the renderer's own attention set.
   * Intersected with each row's panelIds — which is why WORKSPACE_LIST returns
   * ids and not a count: main does not hold this fact, the renderer does.
   */
  attentionIds: readonly string[]
  /**
   * focusedId as it was when the palette OPENED, not now. Opening moves DOM
   * focus to the input; the app-level focus is deliberately left alone, and
   * every panel-acting command targets the panel the user was in.
   */
  capturedId: string | null
  hasSelection: boolean
  actions: PaletteActions
}

// Reasons are exported so the checks assert the same strings the user reads,
// rather than a paraphrase that can drift away from the UI.
export const REASON_NO_FOCUS = 'no focused panel'
export const REASON_NO_SELECTION = 'select some text in a panel first'
export const REASON_BUILT_IN_RENAME = "built-in presets can't be renamed"
export const REASON_BUILT_IN_DELETE = "built-in presets can't be deleted"
export const REASON_PROJECT_PROMPT = 'this prompt is a file in your project'
export const REASON_NOT_ON_PATH = 'not found on PATH'
export const REASON_ALREADY_DEFAULT = 'already the default'
export const REASON_NO_PROMPTS = 'no prompts saved yet'
export const REASON_ALREADY_ACTIVE = 'already the active workspace'

/** Present-means-unrunnable, so an undefined reason must not become a key. */
const withReason = (command: Command, reason: string | undefined): Command =>
  reason === undefined ? command : { ...command, disabledReason: reason }

/**
 * The words a section header now supplies, kept searchable.
 *
 * A spawn row reads "Claude" under NEW PANEL and a prompt row reads "review"
 * under PROMPTS, which is the whole readability win — but haystack() is
 * title + subtitle + searchText, so without somewhere to put the dropped
 * phrasing, "new panel" and "insert prompt" would stop finding rows they have
 * always found. The rows would still be there; they would simply stop being
 * reachable the way people reach them, which is the quietest kind of
 * regression this palette can have.
 */
const SPAWN_TERMS = 'new panel from preset spawn'
const INSERT_TERMS = 'insert prompt paste'

/**
 * Build the whole list. Section membership — not position — is what orders it:
 * filterCommands sorts by SECTIONS index first, so unlike M5b this function no
 * longer carries the grouping in its construction order. It is still written
 * in display order, because a reader who has to jump around the file to work
 * out what the palette looks like is a reader who will put a row in the wrong
 * section.
 */
export function buildCommands(ctx: PaletteContext): Command[] {
  const { actions } = ctx
  const out: Command[] = []

  // --- Panels --------------------------------------------------------------

  for (const panel of ctx.panels) {
    // "Go to" KEEPS its verb, asymmetrically: the other two rows lost the
    // prefix their header now supplies, and this one does not. Two reasons.
    // The Panels section holds goto rows AND "Rename panel…", so the verb is
    // still doing work — and verify:panels 39 finds this row by the literal
    // text "Go to" before recomputing centreOn's arithmetic to prove WHERE the
    // camera landed, which is the most delicate assertion in that suite.
    //
    // A user-set title rides as the SUBTITLE: haystack() includes it, so this
    // is what makes a panel named "auth refactor" findable by typing "auth".
    // Conditional, not `subtitle: panel.title`, so an untitled panel gets no
    // subtitle key at all rather than one holding undefined.
    out.push(panel.title !== undefined
      ? {
          id: `panel.goto.${panel.id}`,
          title: `Go to ${panel.label}`,
          subtitle: panel.title,
          group: 'panel',
          run: () => actions.goToPanel(panel.id)
        }
      : {
          id: `panel.goto.${panel.id}`,
          title: `Go to ${panel.label}`,
          group: 'panel',
          run: () => actions.goToPanel(panel.id)
        })
  }

  {
    const target = ctx.panels.find((p) => p.id === ctx.capturedId)
    out.push(
      withReason(
        {
          id: 'panel.rename',
          title: 'Rename panel…',
          subtitle: target ? (target.title ?? target.label) : 'no panel',
          group: 'panel',
          run: () => actions.beginRenamePanel(ctx.capturedId!, target?.title ?? '')
        },
        // Aimed at the CAPTURED panel, not at a row's own panel: opening the
        // palette moves DOM focus to the input but deliberately leaves
        // focusedId alone, and that captured id is what every panel-acting
        // command targets.
        ctx.capturedId === null ? REASON_NO_FOCUS : undefined
      )
    )
  }

  // --- New panel -----------------------------------------------------------

  for (const preset of ctx.presets) {
    out.push(
      withReason(
        {
          id: `preset.spawn.${preset.id}`,
          title: preset.name,
          subtitle: preset.subtitle,
          searchText: SPAWN_TERMS,
          group: 'spawn',
          scope: 'presets',
          // On the DEFAULT preset's row and no other. CLAUDE.md records that
          // this feature sat inert for a whole milestone because nothing
          // anywhere said what Cmd+N would spawn — the stock canvas looked
          // correct and only a user who hand-edited defaultPresetId could
          // tell. A hint on every row would be a lie on all but one.
          ...(preset.isDefault ? { shortcut: '⌘N' } : {}),
          run: () => actions.spawnPreset(preset.id)
        },
        preset.available ? undefined : REASON_NOT_ON_PATH
      )
    )
  }

  // --- Prompts -------------------------------------------------------------

  for (const prompt of ctx.prompts) {
    // The source is on the ROW, and same-named prompts are never merged:
    // pasting the wrong project's context into an agent is silent and costly.
    const subtitle = prompt.source === 'project' ? 'project — .claude/commands' : 'saved'
    out.push(
      withReason(
        {
          id: `prompt.insert.${prompt.id}`,
          title: prompt.name,
          subtitle,
          searchText: INSERT_TERMS,
          group: 'prompt',
          scope: 'prompts',
          run: () => actions.insertPrompt(prompt.id)
        },
        ctx.capturedId === null ? REASON_NO_FOCUS : undefined
      )
    )
  }

  out.push(
    withReason(
      {
        id: 'prompt.save',
        title: 'Save selection as prompt',
        group: 'prompt',
        scope: 'prompts',
        run: () => actions.beginSavePrompt()
      },
      // Which one is missing, not just that something is: "no focused panel"
      // and "select some text" send the user to two different actions.
      ctx.capturedId === null
        ? REASON_NO_FOCUS
        : ctx.hasSelection
          ? undefined
          : REASON_NO_SELECTION
    )
  )

  // --- Workspaces ------------------------------------------------------------

  for (const w of ctx.workspaces) {
    const waiting = w.panelIds.filter((id) => ctx.attentionIds.includes(id)).length
    out.push(
      withReason(
        {
          id: `workspace.switch.${w.id}`,
          // The count is in the TITLE and nowhere else. It is state, not a
          // name: putting it in searchText would make the row findable by
          // typing a digit, and its match score would then move as agents
          // finish — a ranking that changes under the user for a reason
          // nothing on screen explains.
          title: waiting > 0 ? `${w.name} · ${waiting} waiting` : w.name,
          // The base name, not the count-appended title: `haystack()` reads
          // this in title's place, which is what keeps the waiting count out
          // of search while still showing it on screen.
          searchTitle: w.name,
          searchText: 'switch workspace canvas go to',
          group: 'workspace',
          run: () => actions.switchWorkspace(w.id)
        },
        w.active ? REASON_ALREADY_ACTIVE : undefined
      )
    )
  }

  out.push({
    id: 'workspace.create',
    title: 'New workspace…',
    searchText: 'create add canvas workspace',
    group: 'workspace',
    run: () => actions.beginCreateWorkspace()
  })

  // --- Canvas --------------------------------------------------------------

  out.push({
    // "Reset zoom", not "Zoom to fit": useViewport exposes resetViewport
    // (Cmd+0's INITIAL) and deliberately not fitTo (Cmd+1), because the camera
    // setter stays private and only named verbs get out. The row says what it
    // does rather than what the spec first called it.
    id: 'canvas.fit',
    title: 'Reset zoom',
    group: 'canvas',
    shortcut: '⌘0',
    run: () => actions.zoomToFit()
  })
  out.push({
    id: 'canvas.reset',
    title: 'Reset canvas…',
    group: 'canvas',
    run: () => actions.resetCanvas()
  })

  // --- Settings ------------------------------------------------------------
  //
  // hiddenAtRest, like every administration row: M6c/M6d add more toggles, and
  // the resting list stays the ~8 rows M6p sized it to rather than growing one
  // row per setting. The door below is the always-visible way in.

  for (const setting of ctx.settings) {
    if (setting.type === 'boolean') {
      const on = setting.value === true
      out.push({
        id: `setting.${setting.id}`,
        title: `${setting.label}: ${on ? 'On' : 'Off'}`,
        subtitle: setting.description,
        // The synonyms, where the matcher can see them and the row cannot show
        // them. Without this the row is findable only by its own label — and
        // ideas-backlog #11's whole argument for a searchable settings surface
        // is that a user looking for the theme types "dark", not "theme".
        searchText: setting.keywords.join(' '),
        group: 'setting',
        scope: 'settings',
        hiddenAtRest: true,
        run: () => actions.toggleSetting(setting.id, !on)
      })
      continue
    }
    if (setting.type === 'number') {
      const current = typeof setting.value === 'number' ? setting.value : 0
      out.push({
        id: `setting.${setting.id}`,
        // The value is in the TITLE, not only in the input it opens: a row
        // that said just "Idle after" would put the user in an edit field
        // with no idea what they are changing it from.
        title: `${setting.label}: ${current}`,
        subtitle: setting.description,
        searchText: setting.keywords.join(' '),
        group: 'setting',
        scope: 'settings',
        hiddenAtRest: true,
        // NOT toggleSetting. `!1500` is `false`, which a number setting's
        // store refuses — silently, leaving the row unchanged and the user
        // with no idea why pressing Enter did nothing.
        run: () => actions.beginEditSetting(setting.id, setting.label, current)
      })
      continue
    }
    // An enum (or any future type) has no row yet — building the input mode
    // for a type with no customer would repeat the trap ideas-backlog #11
    // warns about for the schema itself. Falls through to nothing pushed.
  }

  // --- Manage --------------------------------------------------------------
  //
  // Everything below is hiddenAtRest except the two doors, and the doors are
  // why the hiding is honest. Administration stays one keystroke away (type
  // "delete" and it is back, in this section) rather than one guess away.

  // The doors. `entersScope` rather than a callback, and `run` is genuinely a
  // no-op: entering a drill-in is view state that never leaves Palette.tsx, so
  // routing it through Canvas.tsx would make the canvas a stakeholder in which
  // rows the palette is currently showing — and the view has to know BEFORE it
  // runs the row, because running one normally closes the overlay.
  out.push({
    id: 'manage.presets',
    title: 'Manage presets…',
    subtitle: `${ctx.presets.length} preset${ctx.presets.length === 1 ? '' : 's'}`,
    group: 'manage',
    entersScope: 'presets',
    run: () => {}
  })
  out.push(
    withReason(
      {
        id: 'manage.prompts',
        title: 'Manage prompts…',
        subtitle: `${ctx.prompts.length} prompt${ctx.prompts.length === 1 ? '' : 's'}`,
        group: 'manage',
        entersScope: 'prompts',
        run: () => {}
      },
      ctx.prompts.length === 0 ? REASON_NO_PROMPTS : undefined
    )
  )
  {
    // Booleans AND numbers now produce rows, so the count is the length again
    // — but derive it from the same predicate the loop uses rather than from
    // ctx.settings.length, so a future type that produces no row (an enum,
    // still uncustomered) cannot make this door claim a setting the scope
    // does not show.
    const settingCount = ctx.settings.filter(
      (s) => s.type === 'boolean' || s.type === 'number'
    ).length
    out.push({
      id: 'manage.settings',
      title: 'Manage settings…',
      subtitle: `${settingCount} setting${settingCount === 1 ? '' : 's'}`,
      group: 'manage',
      entersScope: 'settings',
      run: () => {}
    })
  }
  out.push({
    id: 'manage.workspaces',
    title: 'Manage workspaces…',
    subtitle: `${ctx.workspaces.length} workspace${ctx.workspaces.length === 1 ? '' : 's'}`,
    group: 'manage',
    entersScope: 'workspaces',
    run: () => {}
  })

  for (const preset of ctx.presets) {
    out.push(
      withReason(
        {
          id: `preset.rename.${preset.id}`,
          title: `Rename preset ${preset.name}`,
          group: 'manage',
          scope: 'presets',
          hiddenAtRest: true,
          run: () => actions.beginRenamePreset(preset.id, preset.name)
        },
        preset.builtIn ? REASON_BUILT_IN_RENAME : undefined
      )
    )
    out.push(
      withReason(
        {
          id: `preset.delete.${preset.id}`,
          title: `Delete preset ${preset.name}`,
          group: 'manage',
          scope: 'presets',
          hiddenAtRest: true,
          destructive: true,
          run: () => actions.deletePreset(preset.id)
        },
        preset.builtIn ? REASON_BUILT_IN_DELETE : undefined
      )
    )
    out.push(
      withReason(
        {
          id: `preset.default.${preset.id}`,
          title: `Make ${preset.name} the Cmd+N default`,
          group: 'manage',
          scope: 'presets',
          hiddenAtRest: true,
          run: () => actions.setDefaultPreset(preset.id)
        },
        preset.isDefault ? REASON_ALREADY_DEFAULT : undefined
      )
    )
  }

  for (const prompt of ctx.prompts) {
    const subtitle = prompt.source === 'project' ? 'project — .claude/commands' : 'saved'
    out.push(
      withReason(
        {
          id: `prompt.delete.${prompt.id}`,
          title: `Delete prompt: ${prompt.name}`,
          subtitle,
          group: 'manage',
          scope: 'prompts',
          hiddenAtRest: true,
          destructive: true,
          run: () => actions.deletePrompt(prompt.id)
        },
        prompt.source === 'project' ? REASON_PROJECT_PROMPT : undefined
      )
    )
  }

  // hiddenAtRest for the reason every other admin row is: two rows per
  // workspace un-hidden would put the resting list back past the roughly-
  // eight-row budget M6p sized it to. They stay findable by query — typing
  // "delete" surfaces them — because a row that disappears is
  // indistinguishable from a feature that is missing.
  for (const w of ctx.workspaces) {
    out.push({
      id: `workspace.rename.${w.id}`,
      title: `Rename workspace “${w.name}”…`,
      group: 'manage',
      scope: 'workspaces',
      hiddenAtRest: true,
      run: () => actions.beginRenameWorkspace(w.id, w.name)
    })
    out.push({
      id: `workspace.delete.${w.id}`,
      title: `Delete workspace “${w.name}”…`,
      group: 'manage',
      scope: 'workspaces',
      hiddenAtRest: true,
      destructive: true,
      // Marked AND gated. A red row still runs on one Enter, so the mark is
      // not the guard; the confirm (Task 6, in Canvas.tsx) is. Neither half
      // replaces the other.
      run: () => actions.deleteWorkspace(w.id, w.name, w.panelIds.length)
    })
  }

  return out
}
