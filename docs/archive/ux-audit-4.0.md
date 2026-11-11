# The 4.0 UX audit (M149)

Walked 2026-09-07 from the goldens `verify:visual` wrote at the close of Act II — every scene
`npm run shot` paints, looked at one by one, against the intent its manifest states. The
method is M61–M70's: what the image shows, what is wrong, what was done. The language is the
Obsidian brief's (M109–M111); anything this audit adds is a NEW name in both theme blocks,
never a re-spelling.

Six lenses, a section each. Findings are numbered `F.n`; each ends with FIXED (and its check),
DECLINED (and why), or OWED (the scene it needs).

## 1. Every scene against its intent

- **launcher.** The hero, three doors, five verbs, the environment line naming what was not
  found and the `Check again` verb. As intended. The rail's `no panels — ⌘N to start one` and
  the dock's `0 live · 0 quiet` agree. Nothing wrong.
- **kinds / kinds-dark.** Every kind side by side on both themes; the state edge, the tone
  words, the dormant card's `click to start` with the annotation beside it, the chat's turn
  rows, the work card's four verbs. Two findings:
  - **F.1** The minimap sits over the `tests` panel's chrome controls (top right). The minimap
    is an overlay by design; a panel parked under it loses its `×` and `fill` to it. DECLINED
    as a scene problem — the fixture parks a panel there; the minimap's corner is the one
    place the canvas cannot be — but the minimap should yield on hover. OWED: backlog #83
    (the yield and a `minimap-hover` scene; #33 is the minimap itself, shipped).
  - **F.2** The toolbox row's new `open` control (M140) drops to its own line under the
    description, where every other row verb sits on the row's first line. FIXED: the row's
    header is a flex line with the verb `flex: 0 0 auto` at its end (`styles.css`,
    `verify:styles toolbox.open.style.1`).
  - **F.3** The dark theme's top-bar appearance control shows a sun on the dark theme too.
    DECLINED by M45's rule: `appearance.theme` is a three-way CHOICE (system / light / dark)
    the menu's radio group and this control both open — not a toggle — so one glyph for
    "appearance" on both themes is the honest one; a moon-on-light / sun-on-dark pair would
    promise a flip that the control does not perform.
- **workflow.** The verb row, three disabled sentences beneath (Stop, Save, Delete each with
  its why — M133's rule, M137's Triggers reason joins them when it applies), the tabs, the
  diagram. **F.4** The diagram's second block is CLIPPED at the panel's right edge at the panel's
  default width. DECLINED, corrected on reading the stylesheet: the pane already scrolls
  (`.workflow-node__pane { overflow: auto }`); the cut is a scroll container at rest, and
  `fill` is the verb that shows the whole shape.
- **skills.** The pane's three tabs, the search and scope chips, two columns. **F.5** The
  second column (`DOCUMENTS · derived`) is cut at the navigator's right edge. DECLINED,
  corrected on reading the stylesheet: `.skills-pane__columns` already scrolls horizontally;
  the cut is the container at rest. **F.6** A card whose name wraps to two lines drops its
  `⋯` menu under the name. DECLINED by the M127 critic's own ruling — "words, not
  ellipses": a skill's name wraps rather than being cut, and the menu host follows the name.
- **chat.** The conversation, the tool rows, the composer, the `no skills used` capsule. As
  intended.
- **board.** Four columns, two cards, the verbs. An empty column is a heading and a count of
  `0`. **F.7** An empty column says nothing about what it is for; it is also a drop target
  that does not look like one. FIXED: an empty user-set column reads `nothing here — drop a card, or add one from the
  palette`, a runtime column reads what sets it (`set when a dispatched lane starts its first
  turn`, `set when a lane opens its pull request`) — three states for a column, never a bare
  zero (`verify:rail board.empty.1` pins the words).

- **trail.** The skill trail beside a dormant claude card: four cards to the right, each the
  skill's name, its one-line purpose and the caps phase, the fourth `not installed here`; the
  card's `hide 4 skills` verb in its chrome. As intended.
- **integrations.** GitHub `connected as octocat`, the broker's rows beneath it (two calls and a
  refusal in red with its reason and the asking panel), Jira `token rejected` with `Reconnect…`,
  `granted to no teammate`, the pane's one-line explanation of what it lists. As intended.
- **github.** Two issues and a review request, each `owner/repo#N KIND · STATE`, title, a cut
  description, `Start session` / `On board` (`Add to board` for the PR) / `Open on GitHub`; the
  chrome's `2 issues · 1 review`. As intended.
- **across.** `3 worktrees · 2 with changes`, the one-line rule (`one worktree at a time — open
  that worktree's own review to commit or discard`), main first then a section per lane with its
  branch in mono, `no changes` for the third. As intended.
- **vault.** The pane lists the vault's notes by name with the directory prefix dim; the note
  panel's `[[flush gate]]` links underlined, `create` beside an unresolved one, BACKLINKS with
  line numbers. As intended.
- **watcher.** The command in mono, its output, `last run passed` in the footer, `Disarm` /
  `Run now` / `Stop` in the chrome with the trigger phrase (`on a change in…`). As intended.
- **browser.** The guest with Back / Forward / Reload and the url field, the readout in the
  chrome, `Open in browser`. As intended.
- **teammate / routine.** The roster, the brief, PLACES with `remove` and `add a place…`, the
  two services with `revoke` / `grant`, the two permissions, ROUTINES with the schedule words,
  the add form. **F.10** A routine's status line wrapped MID-PHRASE (`· last` on one line, `run
  07:28 AM` on the next) because the missed badge and the sentence were one inline run. FIXED:
  the line is a wrapping row that breaks between the badge and the sentence, the badge never
  inside itself (`verify:styles routine.last.1`).
- **chat-copilot.** The sheet's `what` names copilot with `not on PATH` and the preview line
  says what the row cannot do (`no interrupt · no images · a read-only mode`). As intended —
  the disabled row is present with its reason, never absent.
- **memory.** `3 remembered`, the rows `KIND · text · time` newest first, the add line with the
  kind select. As intended.
- **supervisor.** The sheet on `supervisor of this canvas`, the preview naming what it is and
  that this canvas has none yet. As intended.
- **templates.** The sheet on `review this repository` with ONE field (`repository`) and the
  env field beneath, the preview `chat + terminal · after a turn`, `↵ create 2 panels`. **F.9**
  The parameter's label sits ABOVE its field where every other label sits beside. DECLINED:
  M80's own rule in the stylesheet — a parameter's name is the template author's word and is
  never truncated into the sheet's fixed label column.
- **runs, and every scene after templates.** **F.8** The golden shows an EMPTY workspace named
  `review this repository`, the palette's `No matching command` for a panel that is not there,
  and the summary's `THIS WEEK` stuck at `reading the ledger…`. Two defects in the code, found
  by the walk, neither the scene's:
  - M147's `New workspace from <template>` minted the workspace and switched BEFORE the sheet
    asked its holes, so the scene's Escape (and a person's) stranded the canvas in an empty
    workspace named after the template; every later scene painted that. FIXED: the sheet asks
    first and the three doors run on its Enter (`verify:panels shell workspace.template.2`).
    The `composer` scene's failure to paint had the same cause (its chat panel was in the other
    workspace).
  - M142's renderer half was never wired (a partial patch): nothing read `ledger:usage`, so the
    week line was the asked-but-unanswered sentence forever. FIXED: the hook reads on mount, on
    every registry version and on a slow clock; a rejected read is a FOURTH arm with its own
    sentence (`verify:rail summary.history.2`, `verify:panels kinds cost.history.1`).
  The goldens from `runs` on were regenerated after both fixes and walked again below.

- **composer.** Three fresh captures after F.8's fix still showed the wrong panel: the
  scene's palette jump `api (chat)` also matched the review node `review: claude — api
  (chat)` the tool-objects scene had opened OVER the chat, the rail row selected without
  flying, and the drop at the chat's centre hit whatever was on top. Scene fixed: it runs
  BEFORE tool-objects and flies by the chat's full title. Walked with its golden below.
- **reduced-motion** (added). The jump to `worker b` under the real media feature lands
  in one frame: the target framed, selected and inspected a beat after Enter. As intended.
- **file-missing** (added). `not found` in the chrome, `This file no longer exists. It will
  reappear here if it is recreated.` in the body, the title and the reload kept. As intended.
- **runs.** `run 1 · 3 panels · 2m 0s · $0.21 · idle · Run again` in the Workspaces pane and
  the Work tab's RUN section for the target. As intended, now that the workspace is the right
  one.
- **graph.** Two ruled edges, the selected one's inspector (`after a turn`, `never fired`,
  Label / Remove). As intended.
- **tool-objects / approval.** The review node with the tool calls above the diff (`Read ·
  Edit · 07:48`), `4 panels share this repository — git changes are unattributed; tool calls
  are this chat's own`; the approval's `Allow Bash` / `Deny` leading the action bar, the dock
  badge, `1 waiting` on the workspace row. As intended.
- **verbs / auto / subagents / lineup / flip.** As intended (the verb line's refusal in the
  palette's own words; the auto chip `auto · complete · 0/8` beside its one-panel run; the
  SUBAGENTS note; the lineup preview's three seats with their lanes; both cards turned over).
- **palette / palette-query.** **F.11** The query `group` lists `Open review of chat: /private/
  var/…` and `Open toolbox for chat: …` ABOVE the canvas verbs `Card group` / `Remove group`:
  the fuzzy subsequence lit scattered letters across a sixty-character directory in the row's
  TITLE. DECLINED by two rules already made: M62's section-first order (the PANELS section
  leads whatever the score) and M73/M77's full directory in a chat's label (two chats in two
  repositories must be told apart). The highlight shows why the row matched, which is the
  M61 remedy for a match that surprises.
- **header.** **F.12** The fresh capture shows the narrow panel's `⋯` control but NO open
  menu, where the intent is the menu with the full title. The probe said the menu was OPEN
  in the DOM; the capture said it was not on screen. FIXED, and a real defect of THIS run:
  M144's counter-scale transform made `.pf__chrome` a stacking context that painted under
  the positioned slot after it, so the menu was invisible over every live terminal —
  `menu.1` reads the DOM and stayed green. `.pf__chrome { z-index: 2 }` with `.pf__body {
  isolation: isolate }` (`verify:styles menu.stack.1`; `verify:panels product menu.paint.1`
  asks `elementFromPoint` on a live terminal). One consequence, stated: at a zoom where the
  counter-scaled chrome overhangs the body's top rows, those rows are the chrome's — three
  checks that had reached xterm THROUGH the chrome (core 9, agents `hover.1`, `links.1`) now
  write their content below the overhang. That loss has a home: backlog #84 (a top padding
  from `--chrome-scale`).
- **attention / approval.** **F.14** The dock badge counts one and there is NO popover, in
  both scenes, where the intent is the popover listing the waiting panel. The probe said the
  popover was open. FIXED, and the oldest defect the walk found: M109's glass blur made
  `.shell__dock` a stacking context AND the containing block of its fixed popover, so the
  shell-wide `overflow: hidden` clipped the popover to the column's 48 px — open in the DOM
  and invisible since 2.3.0, through every DOM check of it. The dock now declares
  `overflow: visible` and a z-index above the navigator's drawer (`popover.stack.1`,
  `popover.paint.1`). The scene also uses `dock()` (a bare click had toggled shut what the
  approval scene left open).
- **F.13** In one full run the live `claude — api (2)` terminal painted an EMPTY body from
  `subagents` to the end, its chrome and state pill live, and painted its rows in the runs
  before and after. `verify:xterm repaint.1` now counts ink through the real attach path
  (the spike page had never loaded xterm's stylesheet — its first capture was a cursor box)
  and is green; the blank did not recur in three later runs. OWED as an observation: backlog
  #82 names what would close it.

(The remaining scenes are walked below as the audit proceeds; each is listed with its verdict.)

## 2. Empty, loading and error states

The repository's rule is three states, never two: nothing to show, asked but unanswered, a real
answer — and where a read can fail, the failure is a fourth, worded. What the scenes show:

| Surface | nothing | asking | answer | failure | scene |
|---|---|---|---|---|---|
| The launcher's environment line | — | — (the probe runs before the launcher paints) | `found` / `codex not found — install it so it is on the login PATH · asked /bin/zsh · checked 2 folders` | `the shell didn't answer (…) — a slow or prompting ~/.zshrc` (M107's third state) | `launcher` |
| Search | `No matches for “zzqx”` (only once a term is typed; before that the scope is quiet) | — | rows, with the cap and the redaction count stated FIRST (M122) | — | `search`, `search-empty` |
| The Board's columns | `drop a card here` / `set when a lane starts` (F.7) | — | cards | — | `board` |
| Integrations | `not connected` with the fix | `not verified` (`token added, not verified yet`) | `connected as octocat` | `token rejected — add a new github token` (durable `rejectedAt`, M89) | `integrations` |
| The summary's `this week` | `nothing closed this week` | `reading the ledger…` | `$0.14 across 2 sessions` / `unpriced` | `the ledger could not be read` (F.8) | `runs`, `inspector-work` |
| A file panel | — | — | the text | `This file no longer exists. It will reappear here if it is recreated.` with `not found` in the chrome (+ binary, too-large, unreadable arms; a draft open at the time gets `This file was deleted from disk.`) | `file-missing` (added) |
| The Work tab's Changes | `no changes` / `no session yet` | `reading…` | rows | `unavailable` (no git binary; not a repository) / `unattributable` — the engine's arms | `inspector-work` |
| The Panels pane | `no panels — ⌘N to start one` | — | rows | — | `launcher` |
| The Workspaces pane's runs | `no runs yet — a handoff that fires records one` | — | run rows | — | `runs` |
| A vault | `no vault folder yet — a vault is a folder of markdown notes that link to each other` | — | notes | the caps REPORTED beside the list (M85) | `vault` |

No surface in the walk collapsed two of its states into one rendering; the one that had (the
summary's week line, F.8) was a missing read, not a missing arm, and it has four arms now.

## 3. Motion, reduced motion and focus order

- **Flights honour `prefers-reduced-motion`.** M56's rule is read from the real media query at
  every flight (`useViewport.ts`); the harness's override exists only because a hidden window
  cannot set the preference. The `reduced-motion` scene (added) sets the REAL media feature
  through the DevTools protocol and captures a beat after Enter: the target is already framed.
  `verify:panels agents flight.1` pins the flight's endpoints and the reduced jump's identity.
- **The wants-you pulse is finite** — one to four breaths, then the static amber ring
  (`verify:styles pulse.1`, M111). The palette's enter is a scale from below 1 on its own
  element (`motion.1`). Nothing on the canvas animates at rest.
- **Focus order.** A real Tab from the workflow panel's Run visits every enabled verb in the
  row's order and skips the disabled ones, each present and titled; a real Tab through the
  Skills pane's top controls reaches every enabled named control (`reach.3`, M94's real-Tab
  method). The dock's buttons, the top bar's controls and the context pane's tabs are in DOM
  order left to right, top to bottom — the order the eye reads the shell.

## 4. Chrome accessibility

- Every `<button>` in the renderer carries an aria-label, a title, or visible text; every
  `.icon-button` an aria-label or a title on the same element (`verify:rail labels.1–.2`,
  M66). `verify:styles icons.1` fails a control whose text is an entity glyph.
- The dock's pane buttons carry `aria-pressed`; the context pane's tabs and the Skills pane's
  tabs are `role="tab"` groups with `aria-selected`; the top bar's toolbar is a labelled
  `<header>` (`aria-label="Toolbar"`), its merged-view toggle labelled by what it will do.
- Contrast: the state edge and the tone words are the Obsidian brief's tokens on both themes
  (`kinds` / `kinds-dark` walked side by side); the dim text (`--fg-3`) on the glass ground
  reads on both. No token was re-spelled by this audit; nothing it changed touches colour.

## 5. Density

- `compact` (< 1100 px): the navigator and the context pane become drawers and the canvas
  keeps the width (`compact` scene, 1000 × 760). As intended.
- `wide` (> 1600 px): both panes resident with the canvas between (`wide`, 1800 × 1000). As
  intended.
- **200 % scale is every scene on this machine** — the harness captures at the display's
  device scale factor of 2, and the goldens are those captures at half size. The density this
  walk had NOT seen was the other one. A `scale-100` scene was TRIED (a device scale factor
  of 1 through `Emulation.setDeviceMetricsOverride`) and dropped by measurement: `capturePage`
  renders at the display's own scale whatever the override says — the capture came back
  2880 × 1800 — so the scene could not prove its intent. The 100 % density is DECLINED as a
  scene and stays on the manual-only list: a hand look on a non-retina display.

## 6. Act IV and Act V scenes

Owed: one scene per Act IV / V milestone that lands, added with its golden in that
milestone's commit.
