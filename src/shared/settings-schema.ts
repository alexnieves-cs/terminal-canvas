/**
 * Every user-facing toggle in the app, as data.
 *
 * This module imports NOTHING — not electron, not node, not a sibling. That is
 * deliberate and load-bearing: it is what keeps verify:layout in the cheap
 * plain-node tier while covering the schema, and it is what lets main and the
 * renderer both read the same declarations without either owning them.
 *
 * Adding a setting means adding an entry here and nothing else. The palette
 * builds its rows from this list, main/menu.ts builds the Restore submenu from
 * it, and layout-store.ts resolves defaults from it — so a setting that exists
 * here exists everywhere, and one that does not exist here cannot be set.
 */

export type SettingValue = boolean | string | number | string[]

/**
 * Named once so the menu's submenu label, the menu's `settingsInCategory`
 * query, and every SettingDef's own `category` field can't drift from one
 * another by a typo — a mismatch here returns [] and renders as a silently
 * empty submenu, with nothing in any log. See CLAUDE.md.
 */
export const RESTORE_CATEGORY = 'Restore on launch'

/** Named once, for the same anti-typo reason RESTORE_CATEGORY is. */
export const AGENT_CATEGORY = 'Agent state'

/** Named once, for the same anti-typo reason RESTORE_CATEGORY is. */
export const SHELL_CATEGORY = 'Shell'

/** Named once, for the same anti-typo reason RESTORE_CATEGORY is. */
export const FILES_CATEGORY = 'Files'

/** Named once, for the same anti-typo reason RESTORE_CATEGORY is. */
export const SESSION_CATEGORY = 'Sessions'
export const ACCESSIBILITY_CATEGORY = 'Accessibility'
/** Named once, for the same anti-typo reason RESTORE_CATEGORY is. */
export const APPEARANCE_CATEGORY = 'Appearance'
/**
 * M48. Not a user-facing category: the hint strip's memory lives in the same
 * map every other persisted fact does (one map, never a bespoke home), but
 * nobody chooses it from a menu.
 */
export const HINTS_CATEGORY = 'Hints'
/** Named once, for the same anti-typo reason RESTORE_CATEGORY is. */
export const TERMINAL_CATEGORY = 'Terminal'

/** M112. Named once, for the same anti-typo reason RESTORE_CATEGORY is. */
export const TELEMETRY_CATEGORY = 'Privacy & telemetry'
/** M123. Named once, for the same anti-typo reason RESTORE_CATEGORY is. */
export const UPDATES_CATEGORY = 'Updates'

export interface SettingDef {
  /** Dotted and stable — it is the persisted key, so renaming one loses the
   *  user's choice with no migration. Prefix by area: `restore.`, `agent.`. */
  id: string
  label: string
  /** One line, shown under the label. Says what the setting DOES, not what it is. */
  description: string
  /**
   * Synonyms the fuzzy matcher should see but the row should not show. The
   * whole argument for a searchable settings surface (ideas-backlog #11) is
   * that a user looking for the theme types "dark" — so a setting findable
   * only by its own label is a setting most users will not find.
   */
  keywords: string[]
  /**
   * `boolean` and `number` track what `typeof` can answer; `enum` is a
   * string drawn from `values`, and both parsers reject one outside that
   * list exactly as they reject an out-of-range number. An earlier 'enum'
   * member with no enum-typed setting behind it was removed as a
   * customer-free abstraction (M23-spec §9.1); `appearance.theme` is its
   * customer, and it is the FIRST enum, so anything that renders a setting
   * (the palette's row builder, the menu) has to handle the type or the
   * setting silently gets no row.
   */
  type: 'boolean' | 'number' | 'enum' | 'list' | 'text'
  default: SettingValue
  /** The legal values of an `enum` setting, in the order the palette cycles them. */
  values?: readonly string[]
  /** Groups rows in the palette and names the menu submenu they came from. */
  category: string
  /**
   * Inclusive bounds for a `number` setting; ignored for booleans.
   *
   * They exist because both ends of the idleness threshold fail SILENTLY: at
   * 0 every pause between tokens reads as "finished" and the border strobes,
   * and at an hour the signal lands long after you have looked. The app keeps
   * working in both cases, which is exactly why the store refuses the value
   * rather than trusting whoever typed it.
   */
  min?: number
  max?: number
  /**
   * M96. Present means a PLAN may write this key (`set-setting`). A closed
   * list, and short on purpose: cosmetic and attention keys only. Never a
   * ceiling (`agents.*` — a plan that can raise its own has none), never a
   * path (`vault.root` reads disk), never what survives quit. Absent refuses
   * by name in `shared/plan.ts`.
   */
  planWritable?: true
}

/**
 * M6b ships with exactly the three settings that already existed as
 * RestoreSettings. That is not a placeholder: ideas-backlog #11 warns against
 * building this schema before three or four toggles exist, and migrating the
 * three real ones is what stops it being an abstraction with no customers.
 * M6c and M6d add theirs.
 */
export const SETTINGS: readonly SettingDef[] = [
  {
    id: 'restore.layout',
    label: 'Restore panel layout',
    description: 'reopen the panels you had open when the app last quit',
    keywords: ['panels', 'layout', 'reopen', 'session', 'startup', 'launch'],
    type: 'boolean',
    default: true,
    category: RESTORE_CATEGORY
  },
  {
    id: 'restore.camera',
    label: 'Restore camera position',
    description: 'return the canvas to the pan and zoom you left it at',
    keywords: ['camera', 'zoom', 'pan', 'viewport', 'position', 'startup'],
    type: 'boolean',
    default: true,
    category: RESTORE_CATEGORY
  },
  {
    id: 'restore.focus',
    label: 'Restore selection & focus',
    description: 'reselect the panel that was selected when the app last quit',
    keywords: ['focus', 'selection', 'selected', 'highlight', 'startup'],
    type: 'boolean',
    default: true,
    category: RESTORE_CATEGORY
  },
  {
    id: 'agent.glow',
    planWritable: true,
    label: 'Show agent state on panels',
    description: 'colour a panel’s border by what its agent is doing',
    keywords: ['glow', 'border', 'colour', 'color', 'status', 'busy', 'idle', 'state', 'highlight'],
    type: 'boolean',
    default: true,
    category: AGENT_CATEGORY
  },
  {
    // M82. Two ceilings the canvas enforces. 0 is no ceiling for both, which
    // is every canvas that has never opened this page.
    id: 'agents.maxConcurrent',
    label: 'Agents working at once',
    description: 'how many agents may work at once — a send past this queues with its reason; 0 is no ceiling',
    keywords: ['concurrency', 'limit', 'ceiling', 'parallel', 'queue', 'at once', 'budget'],
    type: 'number',
    default: 0,
    min: 0,
    max: 32,
    category: AGENT_CATEGORY
  },
  {
    id: 'agents.budgetUsd',
    label: 'Budget for this canvas',
    description: 'stop this canvas\'s agents when their reported cost reaches this many dollars — a send past this is refused by name; 0 is no ceiling',
    keywords: ['budget', 'cost', 'dollars', 'spend', 'ceiling', 'limit', 'money'],
    type: 'number',
    default: 0,
    min: 0,
    max: 1000,
    category: AGENT_CATEGORY
  },
  {
    id: 'agent.bell',
    planWritable: true,
    label: 'Detect the terminal bell',
    description: 'treat a bell as “this panel wants you” — your CLI must be set to ring it; Claude Code’s notification channel defaults to auto',
    keywords: ['bell', 'alert', 'notify', 'notification', 'attention', 'ping', 'sound'],
    type: 'boolean',
    default: true,
    category: AGENT_CATEGORY
  },
  {
    id: 'attention.notify',
    planWritable: true,
    label: 'Notify me when a panel needs me',
    description: 'post an OS notification when a panel wants you and this window is behind another; clicking it flies here to that panel',
    keywords: ['notify', 'notification', 'os', 'alert', 'attention', 'background', 'dock', 'badge'],
    type: 'boolean',
    default: true,
    category: AGENT_CATEGORY
  },
  {
    id: 'attention.sound',
    planWritable: true,
    label: 'Play a sound when a panel needs me',
    description: 'ring the system alert sound when a panel wants you — off by default; it uses your own alert sound and volume, and works when this window is hidden',
    keywords: ['sound', 'beep', 'alert', 'audio', 'attention', 'ping', 'chime'],
    type: 'boolean',
    default: false,
    category: AGENT_CATEGORY
  },
  {
    id: 'accessibility.screenReaderMode',
    label: 'Screen reader mode',
    description: 'let a screen reader read each live terminal by keeping a text mirror of its buffer — off by default; the mirror is costly, and a carded or off-screen panel has none to read',
    keywords: ['screen', 'reader', 'accessibility', 'a11y', 'voiceover', 'aria', 'blind', 'sr'],
    type: 'boolean',
    default: false,
    category: ACCESSIBILITY_CATEGORY
  },
  {
    id: 'appearance.theme',
    planWritable: true,
    label: 'Theme',
    description: 'follow the system appearance, or force light or dark; the terminal follows the theme too',
    // "dark" and "light" are what a user types looking for this; the label
    // says neither.
    keywords: ['theme', 'dark', 'light', 'appearance', 'mode', 'system', 'colour', 'color'],
    type: 'enum',
    values: ['system', 'light', 'dark'],
    default: 'system',
    category: APPEARANCE_CATEGORY
  },
  {
    id: 'agent.idleAfterMs',
    label: 'Idle after',
    description: 'call a working panel idle after this many milliseconds of silence',
    keywords: ['idle', 'timeout', 'threshold', 'delay', 'quiet', 'silence', 'milliseconds'],
    type: 'number',
    // PROVISIONAL — a stand-in, not a measured value. Task 1 measures the
    // within-turn gap distribution against a real `claude` session (p50, p99,
    // shortest turn-boundary gap) and this default is meant to sit above the
    // p99 of within-turn gaps and below the shortest turn boundary worth
    // noticing. That measurement has not been run yet; 1500 is a placeholder
    // so this milestone's settings surface has something to show, and a later
    // task must replace it with the measured number before shipping.
    default: 1500,
    min: 250,
    max: 60000,
    category: AGENT_CATEGORY
  },
  {
    id: 'agent.edgeIndicators',
    planWritable: true,
    label: 'Point at off-screen panels that want you',
    description: 'draw an arrow on the edge of the canvas for each panel that wants you but is out of view',
    keywords: ['edge', 'arrow', 'pip', 'indicator', 'offscreen', 'off-screen', 'attention', 'pointer', 'wants'],
    type: 'boolean',
    default: true,
    category: AGENT_CATEGORY
  },
  {
    id: 'canvas.minimap',
    planWritable: true,
    label: 'Show the overview',
    description: 'draw every panel as a block in its state colour in the top corner of the canvas, with the camera as a rectangle; click or drag it to move',
    keywords: ['minimap', 'overview', 'map', 'thumbnail', 'status board', 'blocks'],
    type: 'boolean',
    default: true,
    category: SHELL_CATEGORY
  },
  {
    id: 'shell.railOpen',
    label: 'Show the side rail',
    description: 'keep the left rail open beside the canvas',
    keywords: ['rail', 'sidebar', 'side bar', 'left', 'panel list', 'outline', 'shell', 'chrome', 'hide'],
    type: 'boolean',
    default: true,
    category: SHELL_CATEGORY
  },
  {
    id: 'shell.inspectorOpen',
    label: 'Show the inspector',
    description: 'keep the right inspector open beside the canvas',
    keywords: ['inspector', 'details', 'properties', 'right', 'sidebar', 'info', 'shell', 'chrome', 'hide'],
    type: 'boolean',
    default: true,
    category: SHELL_CATEGORY
  },
  {
    id: 'shell.navigator',
    label: 'Navigator pane',
    description: 'show your panels, your workspaces, your vault, your integrations, your teammates or the board in the navigator; the Files pane is its own toggle (⌘B)',
    keywords: ['navigator', 'rail', 'sidebar', 'panels', 'workspaces', 'dock', 'pane', 'shell', 'board'],
    type: 'enum',
    values: ['panels', 'workspaces', 'vault', 'integrations', 'teammates', 'board'],
    default: 'panels',
    category: SHELL_CATEGORY
  },
  {
    id: 'shell.contextTab',
    label: 'Context tab',
    description: 'open the context pane on Detail (what this panel is), Work (what it did and cost), or Tools (what it can do)',
    keywords: ['context', 'inspector', 'tab', 'detail', 'work', 'tools', 'shell'],
    type: 'enum',
    values: ['detail', 'work', 'tools'],
    default: 'detail',
    category: SHELL_CATEGORY
  },
  {
    id: 'terminal.fontSize',
    planWritable: true,
    label: 'Terminal font size',
    // M49. A font size change is a RESIZE wearing a hat: bigger cells mean
    // fewer columns, which is a pty:resize, which is a SIGWINCH, which is a
    // full-screen agent TUI repainting its frame. Committed per press, never
    // live. The bounds are legibility on one end and a 24px grid that fits
    // nothing on the other.
    description: 'size terminal text, in pixels; a panel can override it from the palette',
    keywords: ['font', 'size', 'text', 'terminal', 'bigger', 'smaller', 'zoom', 'type', 'typography'],
    type: 'number',
    default: 13,
    min: 9,
    max: 24,
    category: TERMINAL_CATEGORY
  },
  {
    id: 'hints.seen',
    label: 'Gesture hints seen',
    description: 'remember which first-run gesture hints have been used once and faded',
    keywords: ['hints'],
    // M48. A LIST — the second customer of a non-boolean type after M45's
    // enum. The palette mints no row for a list; hints are not a setting a
    // person toggles, and a row that said "Gesture hints seen: pan, zoom"
    // would be noise on the one surface that has to stay scannable.
    type: 'list',
    default: [],
    category: HINTS_CATEGORY
  },
  {
    id: 'placement.snap',
    planWritable: true,
    label: 'Snap panels while dragging',
    description: 'snap a dragged panel’s edges and centre to nearby panels, with a guide line; off, you align by eye',
    keywords: ['snap', 'snapping', 'align', 'guides', 'grid', 'placement', 'drag'],
    type: 'boolean',
    default: true,
    category: SHELL_CATEGORY
  },
  {
    id: 'files.treeOpen',
    label: 'Show the file tree',
    // Says what it DOES, not what it is. M46: the tree is the navigator's
    // Files pane, so ON shows it in place of the panels/workspaces list.
    description: 'show the file tree in the navigator pane, in place of the panel list',
    // A user who wants this has no vocabulary for "tree". They will type
    // "files", "explorer", "sidebar" or "browser" — so a setting findable only
    // by its own label is a setting most users will not find. The rail's own
    // keywords make the same argument for "sidebar".
    keywords: ['files', 'file tree', 'tree', 'explorer', 'browser', 'directory',
      'folder', 'sidebar', 'shell', 'chrome', 'hide'],
    type: 'boolean',
    // CLOSED by default, unlike the rail and inspector. It is a fourth thing
    // competing for horizontal width — at 220 + 240 + 260 a 1280px window has
    // 560px of canvas left — so the user opens it when they want it.
    default: false,
    category: FILES_CATEGORY
  },
  {
    // M85. The vault's folder. A `text` setting rather than a bespoke store:
    // this schema is the one home for anything a user sets, and a second home
    // for one path would be a second thing to persist, migrate and forget.
    // Empty by DEFAULT and empty is a real value — the pane says so and
    // offers the verb that fixes it, rather than hiding itself.
    id: 'vault.root',
    label: 'Vault folder',
    description: 'the folder of markdown notes the Vault pane lists and links between',
    keywords: ['vault', 'notes', 'markdown', 'wiki', 'zettel', 'backlinks', 'obsidian'],
    type: 'text',
    default: '',
    category: FILES_CATEGORY
  },
  {
    id: 'files.showHidden',
    planWritable: true,
    label: 'Show hidden files',
    description: 'list dotfiles and dot-directories in the file tree',
    keywords: ['hidden', 'dotfiles', 'dot files', 'invisible', 'git', 'files', 'tree'],
    type: 'boolean',
    // Off, because `.git` at a repository root is pure noise in a navigator.
    // A SettingDef rather than a hardcode: this repo's standing rule is that
    // anything a user can toggle lives in this one schema.
    default: false,
    category: FILES_CATEGORY
  },
  {
    id: 'session.keepOnQuit',
    label: 'Keep agents running after quit',
    // Says what it DOES and what it NEEDS. The direct backend has no sessions
    // to keep, and a toggle that is silently ignored is worse than one that
    // names its precondition.
    description: 'keep every panel’s process running after you quit, and reattach on the next launch; needs tmux — without it processes end with the app either way',
    keywords: ['quit', 'keep', 'running', 'survive', 'outlive', 'detach', 'reattach', 'tmux', 'background', 'agents', 'exit'],
    type: 'boolean',
    // OFF by default, and decided rather than defaulted into (M38's spec): a
    // person who quits an app expects its processes to stop, and an agent
    // left burning tokens behind a quit is the surprise this description
    // has to name. The author who wants the opposite is one palette row away.
    default: false,
    category: SESSION_CATEGORY
  },
  {
    id: 'scrollback.persist',
    label: 'Keep recent output on disk',
    // The cap and the caveat, both: the cap is what bounds the disk, and the
    // caveat is backlog #31's rule stated where the switch is — agents print
    // secrets, and this is the honest reason a user would turn it off.
    description: 'keep each panel’s recent output on disk (up to 2 MB per panel) so a restored panel can show it and search can find it; agents print secrets — turn this off if that worries you',
    keywords: ['scrollback', 'history', 'log', 'output', 'persist', 'disk', 'search', 'secrets', 'restore'],
    type: 'boolean',
    // ON by default: a restored canvas whose every panel shows nothing is the
    // failure M39 exists to end, and the description says the cost plainly.
    default: true,
    category: SESSION_CATEGORY
  },
  {
    // M112. Nothing leaves the machine until a DSN is here, and NOT
    // planWritable: a plan that could switch telemetry on has the shape of
    // one that raises its own ceiling. Read once at launch (main/index.ts),
    // which the description says.
    id: 'telemetry.sentryDsn',
    label: 'Sentry DSN',
    description: 'send crash reports and errors to a Sentry project you own — nothing is sent until a DSN is here; takes effect on next launch',
    keywords: ['sentry', 'telemetry', 'crash', 'errors', 'reporting', 'privacy', 'dsn'],
    type: 'text',
    default: '',
    category: TELEMETRY_CATEGORY
  },
  {
    // M112. A separate decision from the DSN because it fails differently: a
    // JS event is scrubbed field by field (main/telemetry.ts); a native dump
    // is process memory, which no scrubber reads.
    id: 'telemetry.nativeCrashes',
    label: 'Include native crash dumps',
    description: 'a dump is process memory and can contain what a terminal showed or a token this app held — off unless you accept that',
    keywords: ['minidump', 'crash', 'native', 'node-pty', 'telemetry', 'privacy'],
    type: 'boolean',
    default: false,
    category: TELEMETRY_CATEGORY
  },
  {
    // M123. OFF by default and never planWritable: a launch-time network
    // call a plan could switch on has the shape of exfiltration, the same
    // reason telemetry's keys carry no flag (`verify:meta update.1`). It is
    // a NOTICE — nothing is downloaded or installed; auto-swap is declined
    // by name for an unsigned build.
    id: 'update.checkOnLaunch',
    label: 'Check for updates at launch',
    description: 'ask GitHub once at launch whether a newer release exists — nothing is downloaded or installed; the notice says where',
    keywords: ['update', 'release', 'version', 'github', 'launch', 'newer', 'check'],
    type: 'boolean',
    default: false,
    category: UPDATES_CATEGORY
  }
]

export function settingDef(id: string): SettingDef | undefined {
  return SETTINGS.find((d) => d.id === id)
}

/** Declaration order within a category is menu and palette order. */
export function settingsInCategory(category: string): SettingDef[] {
  return SETTINGS.filter((d) => d.category === category)
}

/**
 * The stored map is SPARSE — it holds only what the user changed — so every
 * read goes through here. A missing entry is not a missing setting; it is a
 * setting still at its default, which is the overwhelmingly common case and
 * the reason the file does not grow a key per toggle per user.
 */
export function resolveSetting(
  persisted: Record<string, SettingValue>,
  id: string
): SettingValue {
  const def = settingDef(id)
  if (def === undefined) return false
  const value = persisted[id]
  return value === undefined ? def.default : value
}
