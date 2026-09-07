# v7 Act II — eight backlog entries (M140–M147): design

Written 2026-09-07 against `719dd14` (the close of Act I). Each entry in `docs/ideas-backlog.md`
was read whole before its milestone was scoped; where the entry's own text has been overtaken
by a milestone since it was written, the milestone here is the REMAINDER, and the entry is
rewritten down at the act's close. Order of build: M146, M144, M141, M147, M145, M143, M142,
M140 — smallest and most independent first; M147 and M145 are what Act V needs.

## M146 — #23, zoom to fit (a camera flight, named apart from maximise)

The entry's whole point is that "zoom to fit" and "maximise" look the same in a screenshot
and are different features; M92 built maximise. `zoomToFit` today is `resetViewport`, and the
palette row honestly says `Reset zoom`. This milestone builds the other one.

- `viewport.ts` gains nothing: `fitTo(rects, size, margin)` exists (M56's fitAll). `useViewport`
  gains `fitSelection(rects)`: a FLIGHT (M56's `flyTo` path, reduced-motion honoured) to
  `fitTo(rects, hostSize)`; `fitAll` unchanged.
- `zoomToFit` in `usePaletteActions`: the SELECTED panels' rects when any are selected,
  else every panel (`fitAll`); nothing selected and no panels is `resetViewport`. The verb
  table's `zoom-fit` keeps its id; the palette gains a `Zoom to fit` row (`Reset zoom` stays,
  its own row — two verbs, two names, the entry's rule).
- No session state moves; the live budget's `fitAll` comment (a flight that ends on new
  panels) applies unchanged.
- Checks: `verify:viewport fit.sel.1` (fitTo over a selection is the same math fitAll uses),
  `verify:palette zoom.fit.1` (both rows present, distinct titles, distinct actions),
  `verify:panels` core `fit.1` (select two panels, run the verb, the camera frames both and
  nothing spawns).

## M144 — #60, zoom-independent chrome, chrome and handles only

The boundary is the entry's: counter-scale `.pf__chrome` and `.pf__handles` and NOTHING
else; `.pf__body` is never transformed (`frame.2` pins it from both sides, and the reason is
pointer arithmetic). The shape that keeps the body's layout box untouched — so no `refit()`,
no SIGWINCH, no reflow of a running agent on zoom — is a CSS `transform` on the chrome,
which does not affect layout: the chrome grows VISUALLY over the top of the body as the
camera zooms out, and the body's `.panel__slot` rect is exactly what it was.

- `Canvas.tsx` stamps `--chrome-scale` on `.world`: `clamp(1, 1/scale, 2.5)` — the band is
  1× at scale ≥ 1 (no change at the working zoom) up to 2.5× (a 28 px bar reads as 70 px on
  screen at 0.4 and below, where the panels are cards). Computed once per viewport change,
  a CSS variable so no panel re-renders for it.
- `styles.css`: `.pf__chrome { transform: scale(var(--chrome-scale, 1)); transform-origin:
  top left; width: calc(100% / var(--chrome-scale, 1)) }`; the same for `.pf__handles`'
  corner targets (scaled about their own corner). The `.pf__body` rule gains a comment
  naming M144 as the one exception and where it stops.
- The overlap is stated rather than hidden: at scale < 1 the chrome covers the body's top
  rows visually; at those scales the body is a summary card (M57) or the far tier.
- Checks: `verify:styles chrome.scale.1` (the two rules exist, the body has no transform,
  the variable has a fallback); `verify:panels` core `frame.3` (at scale 0.5 the chrome's
  screen height is ≥ 1.9× its height at scale 1 while `.panel__slot`'s screen rect is exactly
  half — the boundary measured, not read).

## M141 — #27, prompt placeholders

The entry names four: `{{cwd}}`, `{{branch}}`, `{{selection}}`, `{{panel}}`. M75 built the
`{{hole}}` machinery (holes asked one question each; a project prompt is never expanded). The
four become BUILT-IN holes: filled from the target panel before any question is asked, never
asked, and only for a SAVED prompt (a project prompt is a file this app does not own — the
entry's third constraint, kept).

- `composer-model.ts`: `BUILT_IN_HOLES` = the four names; `fillBuiltIns(body, values)` fills
  those present in `values` and leaves an absent one AS TYPED (the M75 rule — a `{{branch}}`
  in a panel outside a repository stays `{{branch}}`, visible, rather than an empty string).
  `placeholders(body)` no longer lists a built-in among the holes to ask.
- The values: `{{cwd}}` is the target's LIVE cwd (`PRESET_CAPTURE`'s read, M12 — never
  `spec.cwd`, the entry's first constraint); `{{branch}}` is `git:status`'s branch for that
  cwd (main's); `{{selection}}` is `handle.getSelection()` (renderer); `{{panel}}` is the
  panel's title. Composed in `insertPrompt` after the M75 hole questions, before delivery.
- A chat target fills the same four (its cwd is its record's; its selection is empty).
- Checks: `verify:palette holes.builtin.1–.3` (pure: the four are filled, an absent one stays
  as typed, a project prompt is untouched, a built-in is not among the asked holes);
  `verify:panels` core `prompt.builtin.1` (a saved prompt with `{{cwd}}` pastes the live
  cwd into the terminal, bracketed).

## M147 — #34, per-preset environment and template sets

Two halves, both named by the entry as "never about naming a spawn".

**Environment.** `buildPtyEnv(loginEnv, spec.env)` already merges an override map at spawn —
what is missing is everything before it: the field on a preset and a persisted panel, the
parser, the sheet. `Preset.env?: Record<string,string>` and `PersistedTerminalPanel.env?`,
absent stays absent, a present non-record or a non-string value warns and is dropped whole
(one bad value would otherwise land beside good ones as an environment nobody wrote). The
layout-schema's deliberate-absence comment becomes the field. `spawn:sheet` and
`preset:spawn-by-id` carry it; the sheet gains an `Env` line (`KEY=value`, one per line)
under an advanced disclosure. The renderer ships only the overrides; main merges — #31's
boundary kept. Capturing a RUNNING panel as a preset never captures its environment (the
entry's open question, answered: it captures secrets).

**Template sets.** "New workspace from a template": one gesture, a fresh workspace holding the
template's shape. A palette row per template under the Workspaces scope
(`New workspace from <name>`), the verb `workspace-from-template`: `workspace:create` (named
after the template), `workspace:activate`, then M80's `instantiateTemplate` in it — three
existing doors in order, one history entry in the new workspace. A template with parameters
opens the sheet first (M80's rule). The record is the template itself: no fourth store, as
the entry asked.

- Checks: `verify:layout preset.env.1–.2` (round trip; malformed dropped whole with a
  warning; absent stays absent through `carry`), `verify:file env.merge.1` (`buildPtyEnv`
  precedence: override over login env, TERM/COLORTERM kept unless overridden),
  `verify:palette workspace.template.1` (the rows, disabled with a reason when the template
  cannot run), `verify:panels` shell `workspace.template.1` (the verb mints a new workspace
  holding the shape and switches to it).

## M145 — #13, the image handoff into a terminal's agent

The entry's guard (the drop that killed every session) and its path case both landed: a
file dropped ON a terminal is pasted as a shell-quoted path, dropped on the background it
opens as a file panel — the disambiguation the entry called the real cost is decided by
TARGET. What is left is the BYTES case: an image in the clipboard (a screenshot, a copy from
a browser) pasted into a terminal panel. A chat already takes it (`agent:clipboard-image`,
M75). A terminal cannot take bytes, so main writes them to a file and the path is pasted.

- `main/clipboard-file.ts`: `writeClipboardImage({ dir, now, image })` — pure over an injected
  clipboard reader and directory: writes `userData/attachments/<stamp>.png`, then prunes the
  directory to the newest `ATTACHMENTS_KEEP` (20) files (the entry's cleanup policy, as a
  cap, not an age — a cap cannot grow without bound and needs no clock to be right).
- `attachment:clipboard-file` (one invoke; the diagram in both files; `EXPECTED_CHANNELS`
  123): returns `{ path }`, `{ kind: 'empty' }` (no image on the clipboard) or a refusal.
- The renderer: the ONE `edit:paste` subscription in `Canvas.tsx` — when the text is empty
  and the focused panel is a spawned TERMINAL, ask for the file and `paste(shellQuote(path))`;
  a chat keeps its own door; an unfocused canvas does nothing. A named skip when the
  terminal is not spawned (`REASON_NOT_STARTED`'s sentence, in the palette's own words).
- Per-CLI capability (the entry's constraint) is a `pastesImagePath` note on `BACKENDS`'
  rows: claude and codex read a path; copilot's is unmeasured and says so. The paste happens
  regardless — a path in a terminal is harmless — and the note is what the inspector shows.
- Checks: `verify:file clipboard.1–.3` (the write, the cap, the empty arm); `verify:panels`
  core `paste.image.1` (a fake clipboard image → the path lands in the terminal, bracketed;
  a text paste is unchanged).

## M143 — #53, the live tier's card from a serialised screen

> **As built (M149 note).** No `@xterm/addon-serialize`, no `lastScreen`, no `<pre>` card, no `serialize.1` / `card.screen.1`: M112 had tried the addon and dropped it by measurement, and M63 already renders the card's rows as rows. M143 is the pin the design lacked — `verify:xterm card.rows.1`, attached and detached. Do not "finish" the paragraphs below; they describe the road not taken.

M39 made the dormant card honest (the durable log's tail). A panel that ran THIS session and
was carded by tiering still shows `handle.tail(6)` — six colour-stripped fragments of a
TUI's box frame. The entry's first source is the right one: `@xterm/addon-serialize`,
snapshotted at `detachSlot` (before the WebGL context goes), as the card's text.

- `session-factory.ts`: on `detachSlot`, `serialize.serialize({ scrollback: 0 })` of the
  visible screen, ANSI-stripped by `shared/ansi.ts`, blank lines kept (they carry the
  layout), stored on the handle as `lastScreen`; `tail(n)` prefers it when present and the
  buffer is gone. The dependency: `@xterm/addon-serialize` pinned like the other three
  addons; `verify:meta` already pins the dependency floor.
- The card (`PanelCard.tsx`) renders the screen text in a `<pre>` clipped to the card, not
  the trimmed-line list; the dormant arm is unchanged (M39's).
- Not built: `tmux capture-pane` for a restored panel — the entry itself says the durable log
  made it unnecessary.
- Checks: `verify:xterm serialize.1` (a real Terminal: write a box, detach, the snapshot holds
  the box's blank lines and its text, ANSI gone), `verify:panels` core `card.screen.1` (a
  full-screen draw, a zoom-out that cards the panel, the card shows the screen's layout, not
  six fragments).

## M142 — #19, cost history and the totals that reach the screen

> **As built (M149 note).** The per-workspace totals line was DECLINED in Act II by name (one workspace is on screen at a time; the canvas-wide figure is the one that changes what a person does — `docs/ideas-backlog.md` #19) and not built. The renderer's read of `ledger:usage` was not wired in Act II at all and landed in M149 (`9c75f6d`); `cost.history.1` was red until then.

Three open halves in the entry; two are answered by name and one is built.

- **History and retention** — built on #46's ledger, as the entry asked, not a third store:
  when a panel with usage is killed or exits, main appends ONE `usage` row to the run ledger
  (`kind: 'usage'`, panel id, model, the four token classes, cost, `endedAt`) beside the
  command rows; the ledger's cap is its retention. `buildInspectorSummary` gains `history`:
  the sum of usage rows from the last seven days (`ledger:list` already reaches the
  renderer), rendered under the canvas-wide totals as `this week: $X across N sessions`,
  three states (no ledger rows; rows with no priceable model — `unpriced`; a figure).
- **Per-workspace totals** — the accumulator fold per workspace, one line per workspace in
  the no-selection summary when there is more than one workspace.
- **A second adapter** — codex reports no cost (M90, by name) and copilot is unmeasured;
  declined again, in the entry.
- **The un-pinned panel** — declined again: a guess is worse than nothing (the entry's own
  words).
- Checks: `verify:usage ledger.usage.1` (the row's shape and the seven-day fold, pure),
  `verify:rail summary.history.1` (the three states), `verify:panels` kinds `cost.history.1`
  (a killed panel with fixture usage leaves a usage row and the summary reads it).

## M140 — #26, the toolbox's write half beyond skills

> **As built (recorded after the Act II critic's review, M149).** The write half shipped as ONE door, not the skill editor generalised: every toolbox row carries the file it came from and an `open` control opens it in M22's file panel — the editor every `.claude` file already had — including project-scope command rows, hooks' `settings.json` and MCP's `~/.claude.json`. The splice/stamp gate and the `verify:toolbox edit.cmd.1–.3` checks named below were NOT built; `editor.cmd.1` (product) drives a command row end to end and hook/MCP rows are pinned as data (`toolbox.open.1`, rail). M5b's "project prompts are read, never written" stands for the PALETTE's prompt store; a person opening a project command file in the editor and saving it is a deliberate edit of a file they own, which `docs/load-bearing.md` records beside M5b.

M129 built the editor for SKILLS. The entry's remaining write half lists commands, subagents,
hooks, permissions and MCP servers, and its own argument decides the line: a markdown file
under `~/.claude` (a command, a subagent) is the same shape as a skill — a file the user
authored, with frontmatter and a body, in the user's own scope; hooks, permissions and MCP
servers are arbitrary code, decisions about what an agent may do without asking, and
processes with their own reach. So:

- The skill editor generalises to `~/.claude/commands/*.md` and `~/.claude/agents/*.md` in
  the USER scope: the same splice (frontmatter never re-serialised), the same stamp gate,
  the same trash-only delete. `skill-write.ts`' roots gain the two folders; the grammar is the
  same `KEY_LINE`; a command's body has no `name:` key and the editor's metadata row shows
  what the file has.
- PROJECT scope stays read-only for commands (M5b's decision, "a file someone will commit is
  a decision to ask for"), and the door says so by name.
- Hooks, permissions, MCP: declined by name in the entry, with the reason it already states.
- Checks: `verify:toolbox edit.cmd.1–.3` (a user command round-trips; a project command is
  refused by name; a subagent file's frontmatter survives), `verify:panels` product
  `editor.cmd.1` (the toolbox node's command row opens the editor and a save lands).

## Not in scope, by name

`#26`'s cross-panel palette scope ("which panels can do X") — a milestone of its own;
`#53`'s `capture-pane`; `#19`'s second adapter; `#13`'s per-CLI capability beyond a note.
