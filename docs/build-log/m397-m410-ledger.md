# M397–M410 ledger — make the daily loop feel obvious

Run prompt: [2026-09-30-ux-critique-run-prompt-gpt61-sol.md](../superpowers/specs/2026-09-30-ux-critique-run-prompt-gpt61-sol.md)
(written for GPT 6.1 Sol, run by Claude Opus 5.5 as lead with subagent builders and fresh-context critics).
Branch `m397-daily-loop` off main `6362a94e`. **This ledger is the state.** Reread it after a compaction.

Commit trailer: the prompt asks for `Model: GPT 6.1 Sol`. This run was NOT made by that model, so commits carry
the Claude co-author trailer instead. Writing the wrong model's name would be a false record.

Baseline reds (from the M396 gate): `verify:panels:agents template.1`, `verify:panels:product starter.1`,
`verify:visual starter`. `starter` is expected to change (A1, A2).

## Plan (finding IDs → milestones, grouped by the files they touch)

| M | IDs | Area |
|---|---|---|
| M397 | A1, A4, A8, A11 | styles: note editor height, terminal scrim, menu layer, type scale |
| M398 | A2, A3 | shot fence, subagent watcher (main) |
| M399 | A5, A6, A7, A9, A10 | wheel yield, palette freeze, dismissal, search, disabled reasons |
| M400 | B1 | one task form behind every door |
| M401 | B2, B3, B9 | review: merged state, sizing, one reviewed notion |
| M402 | B4 | one placement rule |
| M403 | B5, B6, B7, B8 | permission line, progress strip, return notice, ask a question |
| M404+ | C/D by impact per risk | decided after Wave B; skipped IDs listed with reasons |
| last-1 | critique → one fix batch → confirm | |
| last | gate | |

Machine rules: at most two app instances (slots 1–2, CDP 9210/9220); one Electron verify tier at a time via
`/tmp/tc-electron-lock` (a DIRECTORY: `mkdir` to take it, `rm -rf` only one you made). Builders run one at a time in
this checkout. Screenshots go to `/tmp/tc-daily-loop-shots/<ID>-{before,after}.png`.

## Milestones

### M397 — correctness in the stylesheet: note editor height, terminal scrim, menu layer, pane type

Reproduced every ID in the real built app (slot 1, CDP 9210) before touching it. Screenshots are in
`/tmp/tc-daily-loop-shots/` (`A1-before/after`, `A1-after-md-panel`, `A1-after-newnote`, `A4-before/after`,
`A4-after-focused`, `A8-before/after`, `A11-before-*/after-teammates`).

**A1 (P0), the Markdown editor is 0px.** *Reproduced:* starter note, measured by `eval`: `.file-node__editor` 224×0,
host 224×0, `.monaco-editor` 224×2.8. The body is `display: block`. *Cause:* as the prompt says, and wider than it
says. `.file-node__editor { flex: 1; min-height: 0 }` sizes nothing inside `.pf__body--text`, a block scroller, and the
host is `position: absolute; inset: 0`. So every file panel in edit mode was affected, not only notes. A plain `.txt`
had the same 0px host. *Fix:* the edit-mode body becomes a flex column only while Monaco is its child
(`.pf__body--text[data-file-mode="edit"]:has(> .file-node__editor)`). Its other children are `flex: none`, and the
editor is `flex: 1 1 auto` with a 64px floor, so a conflict banner in a short panel scrolls the body instead of
squeezing the editor back to nothing. Rich mode and the read view keep their block flow. The selector keys on
`.pf__body--text[data-file-mode]`, not `.file-node__body`, because `verify:styles frame.1` forbids a kind declaring
`__body`. *Measured after:* starter note 64 world px (the floor, since the starter's note panel is short, 160px, and its
body scrolls), a `.md` file panel 213px, ⌘K › New note 213px, a non-note `.txt` 213px (all at 57% zoom). Rich mode
still shows its content-height block (125px) with the body in block flow. *Checks:* `verify:panels:product
note.editor.height.1` measures `offsetHeight` of the host and of `.monaco-editor` on the starter note (≥48 layout px).
It runs after the agent door's second application of the starter, so it doesn't depend on `starter.1`'s visible-line
click, which is the baseline red. `verify:panels:kinds note.editor.height.2` measures the same on a plain file in edit
mode. *Note on the baseline:* `starter.1`'s `note` arm looks for "Welcome" in the note's text, which a 0px Monaco
never renders. But `starter.1` is still red for a different reason, `started: false`: the visible Starter line isn't
hit-testable because the launcher card is below the fold (A5, M399). Re-check it after A5 lands.

**A4 (P1), the terminal header hides row 0.** *Reproduced:* a fresh ⌘N shell showed no prompt at all. With the chrome's
background removed in the page, `alexnieves@… ~ %` and the cursor were on row 0 under it. The chrome was 44px tall with
a solid `--well` band down to 62%, about 2.6 rows. *Cause:* the scrim was a full-width band. Its comment's claim that it
only ever hides the oldest row is false on a fresh shell or after `clear`. *Fix (scrim only, box model untouched):* the
band paints nothing (`background: none`). The chrome stays `position: absolute` with the same padding and its lit top
edge (`--rim-top`). The `--well` backing moves onto the parts themselves: the title, the state word, and each control
while it is shown. The title's backing is a box-shadow spread up and left over whole cells, because a backing hugging
the name cut the prompt's first glyphs in half, which read as a rendering fault. It stops at the lit top edge
(`rim.paint.1`). *Decision:* at rest, row 0 now shows everything to the right of the name (the name covers the prompt's
first ~11 characters cleanly). While controls are shown (hover, focus, selected), the `⋯` control's own backing covers a
few cells of row 0. That was preferred to hiding the controls while typing, which would spend M44's reach rule.
*Checks:* `verify:panels:core chromeless.row0.1`. elementFromPoint can't see this, because the chrome is
`pointer-events: none` at rest. So it measures computed style: the band paints nothing, the parts that paint a backing
(inflated by their shadow reach) cover under half of row 0's width (0.249 measured), the chrome stays
`position: absolute`, and the name is visible at rest. `chromeless.resize.1` / `.paint.1` / `rim.paint.1` stay green.

**A8 (P2), the minimap draws over the View menu.** *Reproduced:* the minimap (z 940) painted over the right half of
the theme rows. `elementFromPoint` there returned `minimap__view`. The shortcut read `⇧⌘\\`. *Cause:* the menu's 950
ranks only inside `.shell__top`'s stacking context, and the bar was 920. The label was JSX text, which is not a string
literal, so `\\` printed two backslashes. *Fix:* `.shell__top` goes to 960, above every canvas HUD layer (pill 930,
minimap and toaster 940, HUD 950) and under the palette scrim (999) and modal sheets (1000). `.link-banner` goes from
930 to 970 to keep its M257 guarantee of out-ranking the bar. The label is `{'⇧⌘\\'}`. *Check:*
`verify:panels:agents menu.layer.1` opens View with a real click and requires every row point over the minimap to win
elementFromPoint, plus the one-backslash label. At the harness's window size the two don't meet, so the menu is
translated onto the map inside its own stacking context and back. Stacking is decided by the contexts, not the position.
Setting the bar back to 920 in the live app made 6 probes land on `minimap__view`.

**A11 (P2), text at 16px.** *Reproduced* by scanning the rail for own-text elements at 16px: the Teammates name input
and its `.pf__note`, the Skills pane's empty note, and every `.skill-card__name`. *Fix:* `.shell__rail .pf__note` takes
`--t-sm` (a note inherits the reading body's `--t-base` inside a panel, but in a rail pane its nearest sized ancestor
was the document). `.skill-card__name` takes `--t-sm`, which other rail labels get from `.rail-row__main`. The
Teammates name field takes the panes' shared input look (the `.inspector__input` / `.vault-pane__filter`
declarations: line border, `--r-sm`, `--s-1`, `--t-sm`, iris focus ring). After: the rail scan finds nothing at 16px.
*Check:* `verify:styles pane.type.1` (static; P2). *Not done:* the Teammates note sits flush against the rail's left
edge with no inset. That was true before and isn't text size, so it's left for the lead.

**Goldens expected to move (not written; the lead does goldens):** `starter` (the note now paints its editor). Every
scene with a live terminal (A4 — the band scrim is gone and the name has its own backing), e.g. `kinds`, `kinds-dark`,
`header`, `trail`, `attention`, `palette*`, `flip`, `overview`, `group*`, `merged`, `zoomed-out*`, `compact`, `wide`.
Any scene with a file draft open. `skills`, `teammate`, `routine` (A11). `account-menu` only if the minimap is in its
frame (A8).

**Suites:** `verify:styles` 93/93. `verify:panels:core` 86/86. `verify:panels:kinds` 51/51. `verify:panels:agents`
83/84: only `template.1` (baseline). `verify:panels:product` 130/131: only `starter.1` (baseline). Two earlier product
runs hit the watchdog and three workflow drag checks went red while macOS's `mediaanalysisd` held the load average at
20–85. At load 5 the same code ran green but for the baseline in 182 s, so those reds were load, measured by the re-run. `npm run affected` (39 suites): 37 passed. The two reds are `panels:agents` (`template.1`, baseline) and `panels:product` (`starter.1`, baseline, plus a watchdog at 230.7 s while the load average was 7–16). Re-run alone at load 4–5, product finished in 181.7 s (79% of its watchdog) with only `starter.1` red.

**A4 follow-up (after the M397 critic).** The critic rejected the first A4 fix: the title's box-shadow backing
spread up and left over whole cells, and the name straddles rows 0–1, so the first ~11 columns of BOTH rows were hidden
at rest; with the chrome shown, `⋯` landed mid-prompt (`MacBook-Pr ⋯ · % echo hello`) and the state word sat on the
typed line (`space-between` spread the controls across the screen). And `chromeless.row0.1` could not see any of it:
it passed at `coveredFrac < 0.5`, never looked with the chrome shown, and inflated boxes by a hardcoded 18px.
*Reproduced* on a fresh slot-1 instance (1200×800): row 0 read `/bin/zsh   Alexs-MacBook-Pro ~ %`, the user name hidden.
*Fix: the name sits on the rim, like a fieldset legend, but wholly above the frame.* A legend centred on the edge
(tried first, `translateY(-50%)`) still covered the top half of row 0, because xterm's row 0 starts at the frame's
top edge. So the live terminal's chrome is `bottom: 100%`, one `--sp-6` (16px) tall, still `position: absolute` with
the body's box untouched (`chromeless.resize.1` green). The name and the state word sit at its left, bottom-aligned on
the rim, each on its own `--well` tab (no box-shadow spread); the controls (⋯, fill, close) sit together at the right
end, shown on hover/focus/selection as before. Looked at in the real app, and each collision measured:
- *100% zoom:* rows 0 and 1 fully clear at rest and selected; the prompt and `echo hello` read whole
  (`A4-after2-100-rest.png`, `A4-after2-100-selected.png`).
- *Zoomed out (58%), a tidied neighbour directly above:* M144's counter-scale grew the strip DOWN from its top at
  first, which sliced row 0's prompt in half at 58% (looked at). The terminal's strip now grows UP from the rim
  (`transform-origin: bottom left`), so row 0 is clear at every zoom. The cost, recorded: below 67% the strip's 16
  screen px exceed a tidied gap (24 world px) and touch the bottom edge of the panel above by a few px
  (`A4-after2-58-rest.png`, `-58-hover.png`). Below the near tier (≤ ~50%) a terminal is a headed card and none of
  this applies (looked at, 40% and 48%).
- *Maximised:* 16px fits `MAXIMISE_MARGIN` (16), so the name stays on screen. End-aligned 24–28px controls lost their
  top 8–12px to the canvas edge (looked at), so the controls are CENTRED on the strip instead: they overhang 4–6px
  each way, 22px above the frame in all (inside the tidy gap), and 4–6px into the far right end of row 0, never the
  prompt's columns.
- *Groups:* a group's header ends 30px into its frame and its first member starts 62px in (`GROUP_PADDING` +
  `GROUP_HEADER_H`), so the strip never meets it (`A4-after2-group.png`, `SHELLS 2` above two rim names).
- *Selection ring:* selection is the frame's border colour, which the strip does not cover.
Two consequences, each fixed: (1) the name no longer covers any cell, so the name and the state word take the pointer
at rest (a click selects, a press drags through the header's `beginMove`); `fit.1`'s real click on the chrome had
started deselecting instead, because a pointer-transparent strip above the frame passed it to the canvas. The
controls stay inert until shown. (2) The ⋯ menu hangs from the chrome's foot, now the frame's top edge, where the
north link port (z 4) painted over its title (`menu.paint.1` red); the live terminal's chrome goes from z 2 to 5.
The frame lets its overflow out for this kind only (`overflow: visible`), and the state edge's glow keeps spilling
only inward through a `clip-path` (M109's clip). *Not done:* an agent terminal (`claude` in a PTY) also puts its
header line and mode chips on the rim; not driven with a real agent. The hover-time north link port still sits on
row 0's middle; that's D1 (ports on the resize band), not A4.
*Checks:* `chromeless.row0.1` is rewritten to measure. Every chrome part that PAINTS (a fill, a shadow, a visible
border, its own text, an svg; effective opacity through its ancestors above 0), inflated by its own computed
box-shadow (parsed, no token px), against the cursor cell (xterm's helper textarea, parked on the cursor cell once the
cursor moves, so a space and a backspace are sent first) and one cell's height: at rest nothing touches rows 0–1
across the whole width; with the chrome shown by a real hover (⋯ at opacity 1) nothing touches the prompt's columns
(the cursor's row, screen left to the cursor's right). Red against 864d9a03's stylesheet (the title and the chrome's
band over rows 0–1 and the prompt), green now. `chromeless.paint.1`'s rest arm now asserts the point under the unseen
⋯ does not land in the chrome (it is the canvas above the frame now, not a cell). `verify:panels:kinds
subagent.cover.1` probes the neighbour's name and word, the parts its rim strip paints, instead of the strip's empty
span. `verify:panels:kinds worktree.1` selects the terminal with a real click on its NAME: 30% across the strip is
canvas now. *Suites (this commit alone, built without M399):* `verify:styles` 93/93, `verify:panels:core` 86/86,
`verify:panels:kinds` 52/52, `verify:panels:shell` 105/105 (a first run had `discard.1` red, a review node's
delete-new-file confirm, at load average 15–21; alone at load 8 it passed), `verify:panels:product` 130/131 (only
`starter.1`, baseline), `verify:panels:agents` 83/84 on the first cut of this change (only `template.1`, baseline).
*Goldens expected to move:* every scene with a live terminal (the name moves from the first row onto the rim):
`kinds`, `kinds-dark`, `header`, `trail`, `attention`, `palette*`, `flip`, `overview`, `group*`, `merged`,
`zoomed-out*`, `compact`, `wide`, `navigator-files`, `starter` (if its terminal is live).

### M398 — the harness fence covers the project arm, and the subagent card leaves plain shells

Screenshots in `/tmp/tc-daily-loop-shots/`: `A3-before.png`, `A3-after.png` (and `A3-fresh.png`, the fresh canvas
both started from).

**A2 (P1), the `starter` golden prints the developer's own `~/.claude`.** *Reproduced* through the door itself, not by
shooting: with a fenced toolbox home, `createToolboxDoor` asked for `~` (the starter chat's cwd, `beginNewChat`'s
fallback) answered `cwd: /Users/alexnieves`, 15 real skills and 7 source/permission paths outside the fence. The live
app's Skills pane shows the same shape (its PROJECT column repeats USER for a `~` panel), which is correct in
production, where the cwd really is home. *Cause:* `shot.cjs` fences the USER arm (`TC_TOOLBOX_HOME`), but the door
expanded `~` with `expandTilde` (the process's `homedir()`), and the PROJECT arm is `join(cwd, '.claude')`, which is
the real `~/.claude` again. *Fix:* `toolboxCwd` (`main/toolbox-read.ts`) resolves `~`, `~/…` and the real home's own
path against the TOOLBOX home. Unfenced, the toolbox home is the real home, so production answers are unchanged. The
door (`toolbox:read`, `tc toolbox`) uses it, and so does `pty-manager`'s spawn-time config stamp, so a fenced home-cwd
panel doesn't compare stamps of one directory against a read of another. A folder UNDER the real home is left alone,
because it's a real project and no harness scene sits in one. *Other harness scenes that could read the real home:*
checked. `prompt:list` is stubbed in shot, the vault reads only a set notes folder (default none), `navigator-files`
is rooted on the fixture repo, and every `~` preset's toolbox read goes through the same door, so the one fence covers
them. `fs:list` on a literal `~` would still list the real home, but no scene asks it to. *Check:* `verify:control
toolbox.fence.1`: through the same door, `~` and the real home's path both read only under a fenced home, both arms
(every source and permission path), with the planted skill found. A non-home folder keeps its own project arm. It was
red against the old expansion (`outside: 7, skills: 15`). The brief's other option (running the shot starter far enough
to eval the inspector) wasn't needed: the starter reaches exactly this door with exactly this cwd. *History:* the
leaked `starter.png` is already on `origin/main` (last written by 04f375d8, M267; also on `origin/archive/carried-reds`
and `origin/cursor/cos-waves-1-4-ec2c`). Whether to purge it from history is **the user's decision**. Nothing was
rewritten, amended or forced. *Golden:* `starter` must be re-shot and LOOKED at: its inspector should now show the
fenced home's planted skills, not the developer's.

**A3 (P1), SUBAGENTS on plain shells.** *Reproduced* in the real app (fresh userData, three ⌘N login shells in `~`):
three cards, each "3 panels share this repository, so their subagents cannot be told apart" (`A3-before.png`). *Cause:*
`pollLive` fed every PTY to `SubagentWatch.poll`, and `~` slugs like any folder, so the three shells were "one
repository". The cards took their parent's z, so a parent that out-ranked a neighbour painted over its header. *Fix:*
(1) `isClaudeSession` (`subagent-scan.ts`, pure): a session is fed only if the spawn spec's `agent` is `claude-code`,
or the spawned command, tmux's current command or the OSC 133 command in flight has the basename `claude`. It's sticky
per session (`agentSeen`), so an agent typed into a shell keeps its `done` nodes after it exits (M15's rule). (2)
`isHomeDir`: a panel whose cwd is home is never watched. It's filtered BEFORE `poll`, so it isn't counted into anyone's
`sharing` either. A panel that leaves the watch (an agent's shell that `cd ~`) has its claim dropped and one empty
update sent, so a card drawn earlier doesn't stay up forever. (3) `SubagentLayer` draws nodes, the card and `+N more`
at z 0, below every panel (Panel.z ≥ 1, the lanes' rule). *Decision:* z-below rather than placement-aware positioning.
The layer knows only terminal panels, and passing every rect would defeat its per-panel memo. Below a neighbour, the
neighbour wins, and on open canvas nothing changes. *After:* the same three shells show no card (`A3-after.png`).
*Checks:* `verify:subagent subagent.feed.1` (which sessions count: login shell, codex, `claude-helper`, `echo claude`
don't; each of the four facts alone does) and `subagent.home.1` (home, trailing slash and `~` are home, and `/Users/meg`
isn't `/Users/me`). `verify:pty-manager subagent.feed.2` is end to end on a real PtyManager and real fs: a plain shell
beside an agent in the same folder gets no update and doesn't make the agent ambiguous, and an agent in `$HOME` with a
claimable seeded session gets nothing. `verify:panels:kinds subagent.cover.1` is measured: a plain shell is spawned, the
parent is raised over it by a chrome press, and the shell's header is moved under the first node. `elementFromPoint`
(node made hit-testable for the probe only, since `pointer-events: none` would otherwise make it pass vacuously) must
land in the neighbour. It was red with the old `zIndex: panel.z` (hits `subagent-node__desc`, z 3 over 2).
*Fixture change:* the positive-path checks (`verify:pty-manager` 26/27, `verify:panels:kinds` 131–133) now spawn a real
`/bin/sh` under the name `claude` (a two-line script), because a `/bin/sh` panel is no longer an agent. That script's
directory is NOT spaced, against the repo's rule and on purpose: tmux hands a lone command argument to `$SHELL -c`,
which splits a spaced path, and the pane died at once (measured: no tick ever saw it). *Lead may want to note:* a real
preset whose COMMAND path contains a space would die the same way under tmux. That's a separate pre-existing fact, not
fixed here.

**Goldens expected to move (not written):** `starter` (A2: fenced toolbox in the inspector, plus A1 from M397). Every
scene with two or more shells in one fixture folder loses its "N panels share this repository" card (A3), e.g.
`navigator-files` shows two now, and likely `kinds*`, `header`, `overview`, `group*`, `attention`, `palette*`, `trail`,
`zoomed-out*`, `compact`, `wide`, `merged`: any scene whose shells share `REPO` or `~`.

**Suites:** `verify:subagent` 29/29, `verify:control` 38/38, `verify:toolbox` 106/106, `verify:pty-manager` 64/64,
`verify:panels:kinds` 52/52 (headroom 85%). `npm run affected` (46 suites): 44 passed. The two reds are
`panels:agents template.1` and `panels:product starter.1`, both baseline, with every part's headroom at 67–86%.

**M398 follow-up (critic), commit f5e642c9.** *Measured* with tmux 3.7c and a native claude 2.1.285: a running `claude`'s `pane_current_command` is `2.1.285`, the name of the file `~/.local/bin/claude` links to, while argv[0] stays `claude`. So the tmux arm never fired for a native install. `isClaudeSession` now accepts a version-shaped process name, the `versions/` path, env/exec/npx/pnpm-dlx launches and the npm package (`subagent.feed.3`). The first draft refused `$HOME` outright, which switched subagent nodes off for every built-in claude preset, since they all spawn in `~`. Home is watched now; only the "N panels share this repository" sentence is withheld there (`subagent.feed.2` on the preset route with panes measured alive, and `subagent.home.card.1`). `isHomeDir` moved to `home-dir.ts`: it resolves path segments, compares against home's cached realpath and folds case on darwin, and `toolboxCwd` uses it (`subagent.home.2`, `toolbox.home.1`). The sticky `agentSeen` became "an agent now, or a claim still held", so one `claude --version` no longer watches a shell for good, and finished nodes come back after a reload (`subagent.holds.1`). Recorded, not fixed: a neighbour on the right hides the z-0 column entirely. Not run in this pass: `verify:ipc` and the panels suites; the gate runs them.

### M399 — wheel yield, palette hold, layers that leave, ⌘F edges, disabled reasons

Screenshots in `/tmp/tc-daily-loop-shots/`: `A5-before`, `A5-after-tip`, `A5-after-scrolled`, `A5-after-starter`,
`A7-{pill,view,settings}-{before,after}`, `A9-before-{empty,query}`, `A9-after-{empty,query}`,
`A10-before-{selected,note}`, `A10-after-selected`.

**A5 (P1), the launcher card can't be wheel-scrolled.** *Reproduced* (slot 1, 1200×800): with More ways to start
open the card is 1136px of content in a 710px scroller, the Starter canvas line at y 797; a wheel over the card moved
the camera from y 120 to −280 and left the card's `scrollTop` at 0. *Cause:* `shouldYieldWheel` exempted the palette,
HUD, minimap and pill, not `.launcher`, so useViewport's capture listener panned the empty canvas behind it. *Fix:* a
`.launcher` rule beside the zoom rule, taken only while the card has something to scroll (a card that fits leaves the wheel to the camera,
and a pinch still zooms — `verify:canvas` 2/3 went red on the first cut, which yielded everything over the card;
check 2 now pans over bare canvas found by hit test, because its window opens on an overflowing card), and the
amber tip carries its own door, `Open the starter canvas` (runs the same `onOpenStarter`, retires the tip). The tip's
sentence no longer sends a person to "More ways to start, below". *After:* the same wheel scrolls the card 400px, the
camera is still, the line is hit-testable; the tip's button lays out the starter (chat, terminal, note, workflow,
image in one group). *Checks:* `verify:panels:product launcher.wheel.1` (real wheel notches over the card until the
line is hit-testable; the card scrolled and the camera did not). `starter.1`, the baseline red, now reaches its line
the way a person does — those same real notches — instead of failing `clickVisible` below the fold, and it is GREEN:
**a baseline red retired** (`verify:panels:product` 133/133).

**A6 (P1), the palette re-sorts under the keyboard.** *Not reproduced live*: a shell looping `echo tick; sleep 4`
under an open query, the first twelve rows sampled every 500 ms for 12 s, held still. *Reproduced in the code*: every
`commands` rebuild re-ranks through `filterCommands`, and a row's haystack carries live words (a state word, a
title), so a rebuild that changes a score moves rows; the selection followed its id only in an EFFECT after the
render that moved them. The lead assigned the fix and its check, so it landed as a defence. *Fix:* the selection is a
row id (`selectedId`; `index` derived in render), and the first arrow or hover holds the order being navigated
(`palette-model.ts` `holdOrder`: held rows keep their places with their new content, gone rows drop, arrivals go after
their own section's last held row) until the query or scope changes. The seat logic is lifted out whole into
`seatSelection` (pure). Arrows, hover and Enter checked live after the change. *Checks:* `verify:palette
palette.hold.1` and `palette.pin.1` (pure). No DOM check: no harness route re-ranks rows on demand; recorded.

**A7 (P2), layers that won't dismiss.** *Reproduced* all three: the pill (click-opened) stayed up after a real Esc and
after a real click on bare canvas; the View menu stayed open after Esc (an outside click did close it); Settings from
the dock gear went to the root palette on Esc. *Causes and fixes:*
- *Pill:* opened by a click it never takes the keyboard, and Esc was handled only in its input. It now listens while
  expanded: Escape in the CAPTURE phase (before xterm's textarea, so the agent never receives that ESC) collapses with
  the pill's own hand-back, and an outside pointerdown collapses without restoring (the press is the focus gesture).
  *Decision:* this retires M249's "stays open across outside clicks"; the load-bearing entry is updated. The draft
  survives a collapse. The palette, when open, owns Escape.
- *View menu:* Radix gives Escape only to the HIGHEST dismissable layer, ranked by mount order, and a force-mounted
  menu's layer lives on while closed; the Account menu mounts after View, so its closed layer took every Escape.
  `MenuContent` now re-keys a force-mounted menu on each opening render, which re-registers its layer on top; the key
  holds through close, so the exit animation plays on the same element. Fixes the Account and Inspector menus the same
  way. Pointer opens still take no focus (`useOpenIntent`), so a pointer-opened menu's Escape leaves focus where it
  was. A keyboard open did NOT get focus back: Radix returns it when its focus scope unmounts, and a force-mounted
  one never does, so Escape left focus on a row `hidden` had just removed (`<body>`, measured by a focus trace). The
  primitive now hands it back itself on the closing render of a keyboard-opened force-mounted menu, only when focus
  is lost or still on one of its rows.
- *Settings:* `usePalette` records the scope the palette OPENED into (`entryScope`, spent by any scope move inside);
  Escape there closes. And `closePalette` hands the keyboard back to a shell control that held it at open (a ⚙ reached
  with Tab) before falling back to rule 4's `restoreFocus(capturedId)`; a pointer open never moved focus, so rule 4
  runs as before. The lb entry says so.
*Focus decision:* "returns focus to its trigger" is read as "to where the opening gesture found it": the trigger for a
keyboard open, the unmoved owner (usually a terminal) for a pointer open — `useOpenIntent`'s rule.
*Checks:* `verify:panels:product pill.dismiss.1` (a real Escape collapses it, no ESC reaches the PTY and the terminal
keeps the keyboard; a real press on bare canvas collapses it), `verify:panels:agents view.dismiss.1` (pointer open +
real Escape, pointer open + real outside press, keyboard open + Escape returns focus to the trigger) and
`settings.dismiss.1` (one real Escape closes Settings opened from the gear; a real outside press closes it).

**A9 (P2), ⌘F at the edges.** *Reproduced:* placeholder `Search search…`; `No matching command` before any typing;
the "searched …" line printed twice; a canvas with one shell and one note said "searched 2 terminals". *Causes:* the
placeholder is `Search ${label}` with the scope named Search; the empty scope fell to the palette's generic empty
state; an information row is disabled with its own title as its reason, so the hint repeated it; `searchPanels`
counted every non-chat panel as a terminal (and handed them to the scrollback log). *Fixes:* the scope's placeholder
says what it reads; a `palette-search` empty state ("Type to search terminal output, chat turns and tasks in this
workspace"); a reason equal to the row's title is not printed again; terminals are `kind === 'terminal'`. Also: the
"searched …" line matched only queries that fuzzy-matched its own words (typing `alex` hid it), so its `searchText`
is the query. *After (the starter canvas):* "searched 1 terminal, 1 chat, 0 tasks and 0 retained outcomes", once.
*Checks:* `verify:file psearch.count.1`. *Decision, note CONTENT search: not done.* The only content index the app
holds is the vault read (`useVault`: bodies in the renderer), and it is empty unless a notes folder is set — none by
default, and New note and the starter write beside a panel, not into a vault. A vault-only search would still find
nothing on a default profile. The real fix is main reading the open note panels' files in `searchPanels` through
`redactSecrets`, a new reader on the outward-gate's caller list; that is a scoped milestone of its own, left for the
lead.

**A10 (P2), wrong disabled reasons.** *Reproduced:* with the HUD at "1 selected", `Next prompt` said "click into a
panel first"; the prompt-mark rows use `REASON_NOT_TERMINAL` ("only a terminal panel has a font size") for a
non-terminal subject (read in `commands.ts`; the live note case showed the focus reason first, because a selected
note is not a captured one). *Fixes:* `REASON_NOT_TERMINAL_MARKS` ("only a terminal panel marks its commands") for
Previous/Next prompt and Copy last command's output. *Decision: say the difference, don't let selection satisfy.*
The first cut made the ONE selected panel the rows' subject when nothing was captured; it changed the subject of
~40 rows at once, and `verify:panels:product` then crashed its renderer (`render-process-gone`, exit 5) after
`board.1`, three runs out of three, and ran clean with only that line reverted (bisected). So selection and focus
stay two things, and while something is selected and nothing captured, the focus-gated rows say
`REASON_NO_FOCUS_SELECTED` ("selecting a panel is not focusing it — click into it first"). *The crash itself is not
diagnosed* — some row builder misbehaves with a selected-but-unfocused subject; the lead may want it looked at before
anyone tries the same thing. *After:* a selected, unfocused note's `Copy last command's output` reads "selecting a
panel is not focusing it — click into it first" (`A10-after-selected.png`); the marks sentence shows for a captured
non-terminal (pinned in plain node; a captured note could not be produced live, since clicking a note selects it
without capturing it). `docs/dead-end-audit.md` lists both new reasons (`verify:meta audit.1`). *Check:*
`verify:palette palette.reason.1`.

**Goldens expected to move:** `palette*` if a scene's list shows a prompt-mark row or the focus reason; `starter` and
any first-run launcher scene (the tip's button and sentence); `palette` scenes opened into Search.

**Suites (M399):** `npm run affected` (49 suites): 48 passed; the one red is `verify:panels:agents template.1`
(baseline), with `view.dismiss.1` and `settings.dismiss.1` green. `verify:panels:product` 133/133 at 78% of its
watchdog — `starter.1` green, **a baseline red retired**. `verify:canvas` 7/7, `verify:palette` 167/167,
`verify:file` 115/115, `verify:rail` 258/258, `verify:meta` green after the audit rows. `verify:panels:product` crashed its renderer (exit 5) with the first A10 cut in three runs out of three (see A10),
and never without it.

#### M399 critic follow-ups (landed in M403's first commit)

- **A7, the pill's Escape handler ate other layers' Escape.** It is window-level, capture phase, with
  `stopPropagation`, so a Radix menu, Monaco, a rename input or an IME composition over the expanded pill never got
  its key. *Fix:* `escapeBelongsElsewhere` (`CommandPill.tsx`) — Escape is left alone during `isComposing`, while any
  other `[role=dialog|alertdialog|menu|listbox]:not([hidden])` is open (a force-mounted menu stays in the DOM
  `hidden`, so that is what "open" means), and when its target is an editable outside the pill and `.xterm`
  (Monaco's `.monaco-editor` included). Only then is the pill the topmost layer.
- **A7, an outside press collapsed the expanded pill whose verbs act on the selection.** "Open pill → shift-click
  panels → Tidy" was gone. *Fix:* a press on a panel (`.panel, [data-panel-id]`) keeps the pill up; a press on bare
  canvas collapses it only on a RELEASE that travelled ≤ 4px (`PILL_CLICK_SLOP`), so a marquee drag keeps it and a
  plain click outside still dismisses (`pill.dismiss.1` unchanged and green).
  *Check:* `verify:panels:product pill.dismiss.2` — all real input: pill open, a real press on the terminal, a real
  drag on bare canvas, an Escape typed into an input outside the pill (it reaches the input), the View menu opened
  from the keyboard and closed by Escape — the pill is up after each — and the next Escape still closes it. The
  input arm first asserted the Escape arrived un-`defaultPrevented`; something else in the window's capture path
  prevents it (not the pill: before this fix the key never reached the input at all), so the check asserts that it
  REACHED the input, which is the discriminating fact.
- **A6 minor, nearest runnable neighbour.** When the held row turns unrunnable IN PLACE, `seatSelection` now moves to
  the nearest runnable neighbour (below first on a tie) instead of the best match, which could be a screen away; a
  row that LEFT still falls back to the best match (its old place is not known). *Check:* `verify:palette
  palette.pin.2`.
- **A10, said plainly:** the `render-process-gone` crash with "selection as subject" was **not diagnosed**. Anyone who
  retries letting a selected-but-unfocused panel be the rows' subject must bisect the ~40 row builders it reaches
  first; the crash was reproducible (three of three) and is the only evidence there is.

### M400 — one task form behind every door (B1)

Screenshots in `/tmp/tc-daily-loop-shots/`: `B1-before.png`, `B1-before-palette.png`, `B1-after-open.png`,
`B1-after.png`, `B1-after-started.png`, `B1-after-palette.png`.

**B1 (P1). *Reproduced*** on a fresh slot-1 profile (`rm -rf /tmp/tcc-1`, 1200×800): "+ New task" opened "Start a
task" with Repository first and DISABLED ("choose who does it below first…"), who forced open on "choose a
teammate…", and the red "no teammate yet — add one in the Teammates pane" (`B1-before.png`). ⌘K: "new task" selected
"Open review this repository as a workflow"; "new", "task" and "start" did not lead with Start work… at all.
*Cause:* the sheet's model made the order a dependency — task → agent → repository — because the repositories on offer
were the CHOSEN teammate's (`startWorkNeeds`, the list read after the agent field), and `startWorkRefusal` refused an
empty roster outright. The launcher had solved the same problem (`firstWorkPlan`: reuse a teammate whose place contains
the folder, else mint one for exactly it) but in Canvas-only code nobody else could call. The palette row sat in Canvas,
the ninth section, and its searchText led with "start work".
*Fix:*
- **One reuse-or-mint rule, one executor.** `folderTeammatePlan` (`shared/onboarding.ts`) is extracted from
  `firstWorkPlan` (which now calls it) and takes an optional `prefer`. Canvas's `teammateForFolder` is the launcher's
  former inline body — `firstWorkRepoAnswer` (git status) first, then reuse or mint — installed as
  `boardVerbs.teammateFor`. `startFirstWork` and the sheet's submit both call it; the sheet resolves who BEFORE
  `addWorkItem`, so a refusal mints no teammate and no card. Folder-access rules unchanged: exactly the chosen folder,
  path-segment `placeContains`, nothing on a refusal, main's Places gate the authority. The Codex-only chat branch stays
  in `startFirstWork`, untouched. The card fast path (`beginStartWork`'s empty-needs dispatch) is unchanged.
- **The model** (`start-work.ts`): needs are task → repository → agent, and agent is asked ONLY when a PICKED teammate's
  places do not contain the folder (`startWorkReaches`). An empty roster is no refusal. New `startWorkWho`
  (picked / reuse / mint / none); `startWorkSwarmRefusal` takes the answered teammate so a planned mint never trips "has
  no places"; `startWorkSummary` accepts a not-yet-made teammate's name.
- **The sheet** (`StartWorkSheet.tsx`), the launcher's order: Task, then Repository (never disabled; every placed
  teammate's repositories read once at open, plus the launcher's recent folders, plus Choose… → `teammate.choosePlace`),
  then one closed who line — `Claude Code · on its own branch, and may work only in <folder> · Change` for a mint, or
  `<teammate> · <backend>` — whose picker has **Automatic** first. Title "New task", aria-label "New task". Options
  (recipe, arrangement/swarm, criteria…) unchanged, and swarm/recipe rows still open it held open (`optionsOpenAtRest`).
  *Decision:* the request counter (stale-reply guard) is gone because the list no longer depends on who is picked —
  one read at open, nothing to overtake. *Decision:* a teammate from the typed door's recent task, the last-used or a
  draft is a PREFERENCE (reused when its place contains the folder), not a pick; only a caller's own teammate (a drop, a
  card) arrives picked. Persisted `tc.startWork.draft`/`.last` keep their shape and parsers; a restored `teammateId` is
  read as a preference. *Decision:* a `preferRoot` proposal (`tc task`, URL) chooses only among the GRANTED
  repositories, never a recent folder — the M313 lb rule.
- **Ranking.** A `task` section ("Tasks") is first in `SECTIONS`, but no row is declared in it: a row's new `leads`
  promote a COPY of it there when the query is a prefix of a lead, with `LEAD_BONUS` for the selection. Declaring
  `start.work` in the section first made it lead "auth" (palette 33 went red), so the promotion is by prefix only. The
  resting list is unchanged. `start.work` keeps its id (V9 / closure.v9.1 literal).
- **Copy ("task" is the noun).** `start.work` → "New task…"; swarm rows → "New task as a … swarm…"; `board.new` →
  "Add a task to the board…" (still `beginNewWorkItem`; its prompt "Add a task to the board — its title"); BOARD_EMPTY;
  card/Focus/readiness verbs "Start task…"/"Start task again…"; Orchestrate's "Start task" and empty line; flowchart
  "New task from this chart…" (inspector, palette row, pill); review/recipe references; onboarding's git refusals say
  "a task works on its own branch". The launcher (its three steps, headline, step-3 sentence) is untouched.
*After (driven, real app, fresh profile):* "+ New task" → Task / Repository (live, Choose…) / closed who line, no
refusal (`B1-after-open.png`). Choose… opens the native dialog, which this session cannot drive (osascript has no
accessibility access), so the folder came from the sheet's other real route: a login shell opened in
`/tmp/tc-b1-repo` through the Panel tab put it in recents; "+ New task" restored the draft, the repository was chosen,
who read "Claude Code · on its own branch, and may work only in /tmp/tc-b1-repo" (`B1-after.png`), and a real click on
Start task made teammate `Claude · tc-b1-repo` with places `["/tmp/tc-b1-repo"]`, a lane `tc/c2-…`, and a streaming
conversation in the focus view (`B1-after-started.png`); the tiny task committed `Add hello line to README` in its lane
and the turn ended. ⌘K: "new", "new task", "task", "start" each show Tasks › *New task… selected; "restart" still leads
with Restart panel… (`B1-after-palette.png`).
*Checks added:* `verify:palette start.who.1` (who from where: mint for exactly the folder, reuse by containment with
the preferred first, sibling ≠ inside, pick stays pick, swarm refusal with a planned mint) and `task.rank.1` (first and
selected for new / new task / task / start / Start work; not for restart or auth; not at rest). `verify:first-run
start.form.1` (the reproduction as markup: no teammate → Repository enabled, Choose… offered, no "no teammate yet", who
closed, Task before Repository; red against the old sheet, whose select was `disabled`).
*Checks whose assertion changed ON PURPOSE (each commented in place):*
- `verify:palette start.1a` — pinned task → agent → repository with a missing agent hiding the repository question,
  which IS B1's dead end; now task → repository, and agent only for a picked teammate that cannot reach the folder.
- `verify:palette start.1e` — an empty roster was a refusal ("no teammate yet"); now null. The placeless arm stays.
- `verify:palette board.1` — the title regex (`/New work item/` → `/Add a task to the board/`); group, reason and
  `beginNewWorkItem` unchanged.
- `verify:first-run startwork-first.dom.1` — was Repository before Task with the sole placed teammate PICKED; now Task
  before Repository, Automatic selected and "works in the folder you choose" until a folder decides.
- `verify:first-run startwork-first.dom.2` — who used to open itself when no teammate could be preselected (the gate);
  now it stays a closed line. Options' half unchanged.
- `verify:panels:product start.door.1` — asserted the repository disabled before a teammate is picked (or sam picked);
  now the field is live at open with every placed teammate's repositories, agent on Automatic.
- `verify:panels:product start.door.2` — no longer picks sam first: the typed task starts with nobody picked and the
  folder answers who (sam, by containment) through `teammateForFolder`.
- `verify:panels:core 48` — ORDER gains 'Tasks' first (SECTIONS changed).
- `verify:rail focus.3` (`/Start work/` → `/Start task/`) and `verify:panels:orchestrate orch-tasks.app.2`
  (`primary === 'Start task'`) — copy only.
- Golden scene `start-work` (`scripts/shot.cjs`): intent rewritten and the teammate pick removed (it now types "New
  task" in ⌘K and picks the first repository row).
*Not changed, checked:* `verify:swarm` rows.1/doors.1/sheet.* (39/39 — literal ids kept), `verify:onboarding`
(21/21, `onboarding.intent.*` unchanged), `onboarding.intent.e2e.*` and `start.recovery.*` (not touched; they go through
the same executor). The plan's `verify:styles` "+ New task" literal and `panels:shell 76` needed nothing.
*Not done / left:* no Electron check drives the fresh-roster sheet end to end: a folder outside every place reaches the
sheet only through Choose… (a native dialog the harness cannot answer) or recents (main's `spawn.recent`, fed by a
spawn); start.form.1 pins the markup and the drive above covered the path by hand. The flowchart pill and palette row
were renamed; `verb-table.ts`'s descriptive `canvas:` strings still say "Start work…" (documentation text that
`closure.v9.1` does not read as copy). The launcher's own `aria-label="Start work"` and its "Start work is unavailable"
reason were left alone (Keep list).
*Goldens expected to move:* `start-work` (whole sheet; `spawn-sheet` should not — only the Task side's title changed), any scene with
a work card showing its verb (`Start task…`), `board`/Orchestrate task-list scenes with a not-started row (`Start
task`), `palette*` only if its query leads to New task (the resting list is unchanged), `focus*` with a not-started
task, the flowchart scenes with the pill or inspector open ("New task from this chart…").
*Suites:* `npm run affected` (it pulled in the concurrent main builder's uncommitted `home-dir.ts` too): 55/56 passed in
779 s. The one red is `verify:panels:agents template.1` (baseline). `verify:panels:product` green including
`start.door.1/.2`, `start.answer.1`, `onboarding.intent.e2e.*`, `start.recovery.*`; `verify:panels:core` green with 48's
new ORDER; `verify:panels:orchestrate` green with `orch-tasks.app.2`. Plain: `verify:palette` 169/169, `first-run` 29/29,
`onboarding` 21/21, `swarm` 39/39, `rail` 258/258, `meta` 51/51 (the lb entries added in `docs/load-bearing.md`).

#### M400 critic follow-ups (landed in M403's first commit)

1. **`leadsQuery` promoted New task… on any prefix** — "n", "t", "s", "st", "ne" jumped it into Tasks ahead of Split,
   Terminal and Settings. *Fix:* a prefix must be at least `LEAD_MIN` (3) characters unless it IS a whole lead
   ("new" still leads, it is three). *Check:* `task.rank.1` gains n/t/s/st/ne on its must-not-lead list (and
   must-not-select); the lb entry says so.
2. **Automatic could name the wrong agent.** The who line read "Claude Code" from `backendLabel` while the mint was
   hardcoded `Claude · <folder>`, so a Codex start minted a teammate called Claude, and one agent had two names on
   one sheet. *Fix:* `startAgentName(backend)` (`start-work.ts`) is the ONE name — the first-launch engines' words
   ("Claude Code", "Codex"), else the registry label — read by the who line, the Runtime line and the mint
   (`folderTeammatePlan`'s new `agent` parameter; the executor `teammateFor` receives it from the sheet). The
   preference list puts `installedFirstBackend(model.available)` — `onboardingReadiness`'s rule (the first installed
   first-launch engine) over the discovery answer the sheet already holds — before the default, after the card's own
   vendor and the last one used. *Decision:* the minted name is now **"Claude Code · <folder>"** (was "Claude ·
   <folder>") for the launcher too, so the foot and the who line say the same word; the chat header's echo rule
   (`chat__backend--echo`, prefix match) still hides the doubled "claude". *Checks:* `start.who.1` updated ON
   PURPOSE (the expected name); new `verify:palette start.who.2` (Codex-only: codex preselected, the who name and
   the mint "Codex · app"; both installed → Claude Code; no answer → nothing claimed).
3. **Symlinked folders.** main's `git:status` echoes the root it was given (`review-engine`'s `status`), so
   `firstWorkRepoAnswer`'s subfolder test never fired live, and a symlink was stored as a place — reused by string,
   then refused by main's realpath gate AFTER `addWorkItem`. *Fix:* main's `git:status` HANDLER (not the engine, so
   no other reader changes) adds `real` (the realpath) and `home` (`isHomeDir`, M398's) to the status arm;
   `teammateForFolder` asks `git:root` (git's top level) beside it; `firstWorkRepoAnswer(status, folder, top)` then
   answers `canonical: top` for a symlink to a repository, the subfolder refusal for a link INTO one (judged on the
   realpath), and refuses **home** and **`/`** by name. The executor grants and STARTS in the returned `root`
   (`teammateFor` now returns it; the sheet's submit and `startFirstWork` use it), never the typed link. Nothing is
   widened: the realpath IS the chosen folder. *Check:* `verify:onboarding onboarding.intent.6` (link → canonical,
   link into → refused, home, root, `/tmp`↔`/private/tmp` is not a symlink case, an old status without `real` is
   unchanged).
4. **Disabled Start task looked MORE primary than enabled.** `.sheet__button` comes after the shared `.is-primary`
   fill at the same specificity, so the enabled button painted as a dark outline and only the disabled one had a
   fill. *Fix:* `.sheet__button.is-primary` is the full `--iris` fill with `--on-iris` ink, hover adds the ring
   (never a surface step), disabled keeps the launcher's half fill. *Check:* `verify:panels:product start.primary.1`
   measures the painted colours: enabled = `--iris` (Δ < 2), far from Cancel's; disabled ≠ iris and nearer Cancel
   than enabled is.
- **Minor, the sheet's refusal path was never driven.** *Check:* `verify:panels:product start.refuse.1` — a plain
  folder reaches the sheet through recents (`layoutStore.addRecentDirectory`, main's `spawn.recent`), a typed task,
  nobody picked, a real Enter: "not a git repository" is said IN the sheet, the sheet stays open, and the roster and
  the board are exactly as they were.
- *Not done (minor, outside the four):* a draft root from Choose… dropped on restore unless it is in recents or
  granted; the DOM path for a picked teammate outside the folder is still not driven.

### M401 — a merged task looks done, one notion of reviewed, the return covers tasks (B2, B9, B7)

Built by a builder in worktree `tc-m401-review` (branch `m401-review` off `f5e642c9`), app on slot 2 (CDP 9220).
B3, listed beside B2/B9 in the plan table, was not in this builder's brief and is not touched here.
**Reproduction fixture (no real agent):** a throwaway repo under `/tmp/m401-fixture` with a REAL linked worktree on
branch `tc/m401-greeting` holding one commit; `merged` mode merges that branch into `main` with `--no-ff`, `ready`
mode leaves it unmerged. `/tmp/tcc-2/layout.json` is seeded with a chat panel in the lane, a work card, the worktree
record and the work item (`merged` + an old `reviewed` mark, or neither), and the chat's transcript file gets a
plaintext assistant turn ending "It hasn't been pushed or merged." — main's transcript reader takes plaintext lines.
The Review is then opened through the card's real Review verb. The state is exactly what M315's Accept leaves, and
the fix was also driven through a LIVE Accept → Merge on the `ready` fixture (`B2-after-live-accept.png`: the row
flips to Close task / Remove lane and the navigator line to "merged into main as aa091d6" the moment Merge lands).
Screenshots: `/tmp/tc-daily-loop-shots/B2-*`, `B7-*`, `B9-*`.

**B2 (P2), a merged task never looks done.** *Reproduced:* the accepted review showed `Mark reviewed again` and
`Accept…` (both disabled, both titled with the accepted detail), `Continue the conversation`, and nothing about
what comes next; the navigator's chat row read "It hasn't been pushed or merged." (`B2-before.png`). *Cause:* a
projection gap, as the prompt says. `review-readiness` already returns `accepted`; the review's decision row only
disabled its verbs, and the rail row's second line is the chat's last assistant line with no task context.
*Fix:* (1) The accepted decision row swaps its verbs for the two next steps (FocusTask's accepted arm already
dropped them): **Close task…** — a two-press arm with its own sentence ("Its agent stops and its panel closes; the
branch, the lane and this review stay."), then the canvas's ordinary `onClosePanel` for the chat; **Remove lane…** —
the palette's own remove-worktree confirm (`beginRemoveWorktree`, so a dirty tree is refused where it always is).
Remove lane is PRESENT and disabled while a panel still owns the lane, titled with the palette row's own
`REASON_WORKTREE_ATTACHED`; closing the task lights it. (2) `mergedLine()` in `review-readiness.ts` is the one
spelling of "merged into main as <sha7>"; the navigator row (`RailRow.outcome`, built by `buildRailRows`' new
optional `outcomeOf`, appended last in the literal for `railSignature`'s key-order reason) shows it in place of the
last line for the merged task's conversation. The last-line store is untouched. (3) After the lane is removed the
accepted detail stops promising it ("…; its lane has been removed"): an accepted task's section is undefined exactly
when its record is gone. `taskContextFor` keeps an ACCEPTED task's section after its record goes (lane path `''`,
no watchers, `laneGone`), because the section vanishing under the person's own press read as a crash; Remove lane
then reads disabled "the lane was removed — its branch stays in the repository". (4) Two things found while driving
it: `useTaskHandoffs` only re-read the worktree list for a record it did not hold, so a removed lane stayed "held"
forever — a refresh (token) now re-reads it too, one IPC per refresh; and closing a merged task's conversation
retains an outcome, after which **"Resume work … open blocker — lane closed"** appeared for work that had landed
(`B2-resume-bug.png`, taken before this fix) — `pickResumeSubject` now skips a DONE item's retained
outcome. (5) `beginRemoveWorktree` looks the branch up when `worktreeRows` (read only when ⌘K opens) doesn't hold
it, so the confirm names `tc/m401-greeting`, not the opaque id; its optional `after` callback (outside
`PaletteActions`' declared shape, typed only on useBoardVerbs' ref, commented at both ends — `commands.ts` is the
B1 builder's file and was left alone) re-reads the handoffs once the lane is really gone.
*Decision — ACCEPTED IS TERMINAL for "present at rest, disabled by name, never absent".* That rule (the comment over
Mark reviewed/Accept) exists so a person can see what they must do before a verb lights. After the merge nothing will
ever light Accept or Mark reviewed, so a disabled pair is noise that reads as "not done yet". The rule applies to a
task not yet accepted; the accepted row's own doors (Close task, Remove lane) keep it: each is present and disabled
by name when it cannot run. *Checks:* `verify:panels:product review.accepted.1` (real lane merged into main, real
card Review press): exactly `close-task,remove-lane`, Remove lane disabled with the palette's reason, the chat's
rail row reads `merged into main as <sha7>` with `data-rail-outcome`, and Close task confirmed removes the chat and
enables Remove lane. `verify:review accepted.lane.1` (the detail with and without the lane; `mergedLine`),
`verify:rail rail.outcome.1` (the outcome rides only its row, moves the signature, absent = byte-identical),
`verify:rail resume.done.1`. `accepted.1` and `fr.flagship.1` stay green.

**B9 (P2), two notions of "reviewed".** *Reproduced* on the `ready` fixture with a real Mark reviewed press:
"you reviewed these change and the lane has not moved since" (the typo), "you reviewed 1 file here" beside
"0 of 1 marked seen this session", and "agent finished — not verified / no check has run on this revision" with
nothing saying why (`B9-before.png`). *Cause:* the footer tally counted only the session's ephemeral marks
(`locallyReviewed`) while the decision row spoke the persisted whole-task mark, and the verdict never said that
only a check THIS CANVAS watched exit counts (readiness.4 keeps the agent's own runs apart, correctly). *Fix:* ONE
state per file. A file the task's CURRENT mark covers is `reviewed` (its check mark titled "recorded by Mark
reviewed", and the session "mark seen" toggle is not offered for it); otherwise the session's `seen`. The tally
counts that same state — "1 of 1 seen" — so it can never contradict the mark. A stale or unknown mark, or an
accepted task, covers nothing. The typo is fixed ("this change" / "these changes"). Under a verdict that is not
`verified`, one line says what verified asks for — "Verified means you reviewed this revision, a check this canvas
ran passed on it, and nothing is left open. Tests the agent ran itself are its account, not a check this canvas
saw." — with a **Run checks…** verb (when the canvas can run one and nothing passed) that opens the ONE Run checks
form below and scrolls it into view (`B9-after.png`, `B9-after-run-checks.png`). `verificationOf`'s words are
unchanged (pinned by `review-comment.4`, `prBody`, orchestration). *Check:* `verify:review reviewed.copy.1` (number
agreement, never "these change"). The per-file state and the footer copy have no DOM check: no suite selected the
footer or the seen toggle before this, and a P2 copy-and-state change was not worth a fourth Electron seed; say so.

**B7 (P2), the return covers only terminals.** *Reproduced:* the `merged` fixture launched, stopped (main records
last-exit on SIGTERM) and relaunched on the pre-fix build shows no notice at all (`B7-before.png`) — main's record
lists pty ids only, so a chat + review task gets nothing. *Fix:* the EXISTING notice, extended: `reopenTaskLines`
(`shared/persistence.ts`) adds one `task` line per outcome — needs you (ready / shared / blocked), finished (merged),
asleep (working/empty with its conversation on the canvas) — after the terminal lines, `info` tone (Got it clears
it), each with a **show** per task (up to three) that goes to its conversation, or else its review. Tasks are those
created before this launch (Resume's M315 rule) with a panel to show; the list is live because a task's outcome
needs its lane read, which lands after boot. The notice still appears only when main has a last-exit record, so a
harness mount moves nothing. No persisted key was added. (`B7-after.png`: "“Add a greeting file” finished — merged
into main as cb60bae · show".) The outcome and detail rules live in shared (`reopenTaskOutcome`,
`reopenTaskDetail`), because `verify:rail state.2` forbids a state word as a display literal in Canvas. *Check:*
`verify:layout reopen.task.1`. persist.1–5 unchanged and green.

**Noticed, not fixed (outside the IDs):** in `B7-after.png` the command pill ("1 selected") overlaps the reopen
notice's Got it at 1200×800. The accepted review still shows the follow-up/recipe blocks, which say nothing wrong.

**Goldens expected to move:** any scene with a review node's footer — the tally now reads "N of M seen" (`kinds`,
`kinds-dark`, `across`, `header`); any scene whose review verdict is not verified gains the "Verified means" line.
No scene seeds an accepted task or a reopen record, so B2's row and B7's lines move no golden; `navigator-panels`
only if its fixture has a merged item (it does not, as read).

**Suites (M401), all with `TC_VERIFY_SUFFIX=m401` under the shared lock, app stopped.** Plain tier all green:
`verify:review` (incl. `accepted.1`, `accepted.lane.1`, `reviewed.copy.1`, `review-comment.4`, `readiness.4`),
`verify:rail` 260/260 (after moving the reopen outcome rules into shared — `state.2` caught a state word spelled in
Canvas), `verify:layout` 284/284, `verify:first-run`, `verify:orchestration`. `npm run affected` (56 suites): 53
passed. `verify:panels:product` green including `review.accepted.1`, 181.8 s of 230 s (79%). The three reds —
`panels:shell` (`106`, plus one of `98`/`98b`/`126`/`127` per run, headroom 90–98%), `panels:agents` (`attention.1`,
`template.1`, headroom 99–100%) and `panels:flowchart` (`flowchart.app.10`) — were each re-run alone and then run
on the BASELINE build (this commit stashed, same worktree, same machine, load 4.6–7): the baseline is red on the same
checks (`shell` 106/126/127 in two runs of two, `agents` attention.1 + template.1, `flowchart.app.10`). So none is
M401's; `attention.1`, `shell 106/126/127` and `flowchart.app.10` are NOT in the M396 baseline list and look
environmental on this machine today (the M399 run was green on them) — the lead's gate should re-measure them. Two
earlier product runs (mine and the baseline's) went red on `work.action.1`/`review.task.2` with "no-panel" at load
8–14 and green on the third; recorded, not diagnosed.

#### M401 follow-up (critic)

A fresh critic read 00b50cdc. Its material findings, each fixed here:

1. **B7 nagged on every launch.** `reopenTasks` filtered `createdAt < APP_OPENED_AT`, which stays true forever, and
   "Got it" lasts only for the session, so every launch re-announced every old task. *Fix:* `reopenTaskNews`
   (`shared/persistence.ts`) keeps a task line only if its fact moved after the last exit (`LastExit.at`, already
   recorded) and before this launch opened. `finished` is judged by `merged.at`, and `needs-you`/`asleep` by the
   item's `updatedAt`. When there is no exit time, or no time on the task, `finished` and `asleep` are dropped and
   only `needs-you` stays. No persisted key was added. The upper bound, `openedAt`, is new and was not in the brief.
   The notice is live, so without it the person's own acts in this session (Mark reviewed, a merge) would appear as
   "news". *What this means, for the lead:* nothing in the app patches a work item while its renderer is gone. So
   after a normal quit the task lines are now almost always empty. In practice they show only after a crash (no
   exit record: `needs-you` only) or after a main-side patch while the window was closed. A lane that a tmux agent
   changed while the app was closed does not count as news, because `updatedAt` does not see it. Seeing it would
   need a persisted per-task handoff digest, and the brief ruled that out. *Check:* `verify:layout reopen.task.2`
   runs the real filter and the real line builder over two launches' worth of the same five tasks. Launch 1 reports
   only what moved between exit and open. Launch 2, with nothing changed, reports nothing. With no exit time, only
   needs-you stays. A fact from this launch is not a return.
2. **The Close confirm.** At rest the verb is now a plain word verb (no `review-node__primary`) labelled **Close
   conversation…**, because that is all it closes. The armed **Close** now uses `review-node__discard-confirm`
   (red outline, not the filled primary), because it stops an agent. The DOM aliases (`close-task`,
   `data-review-close-confirm`) are unchanged.
3. `PaletteActions.beginRemoveWorktree` now declares `after?: () => void` (`palette/commands.ts`), and presets.ts
   takes it from the declared shape. *Check:* `review.accepted.1` goes on to press Remove lane, answers the
   palette's confirm with Enter, and asserts the result: the confirm named `tc/m401`, the worktree directory is
   gone, Remove lane is disabled with "the lane was removed", and the detail reads "its lane has been removed". It
   also asserts the new rest label, that the verb is not primary, and the armed Close's class.
4. **The B9 line.** `VERIFIED_MEANS` is now "Only a check this canvas runs counts — the agent's own runs don't.".
   The verdict's Run checks door is removed, along with its plumbing (`runChecksAsk`, the scroll-into-view effect
   and the inline-verb CSS). The Run checks form's own door is the only one left.

Minor: `review-readiness.ts`'s doc comment is back on `ReviewHandoffState`. **One word: "seen"**, for the tally
("N of M seen") and for both row states (recorded: "seen, recorded"; session: "seen this session"). "Reviewed" stays
the name of the one persisted act, Mark reviewed, so a session toggle never sounds like the recorded fact. The
toggle already said "mark seen". The merge sentence showed twice on an accepted review, once in the head's note and
once in the verdict. The note is no longer rendered when the task is accepted, and the verdict's line carries
`data-review-task-detail`.

**Goldens expected to move:** any scene with a verdict that is not verified (the shorter line, no Run checks verb).
The accepted row and the reopen lines appear in no scene.

**Suites (follow-up):** `npm run build` green. All 43 plain suites `npm run affected` selects are green, among them
`verify:layout` 285/285 (`reopen.task.2`), `verify:review`, `verify:rail` and `verify:meta`. **`verify:panels:product`
(the extended `review.accepted.1`) was NOT run.** `/tmp/tc-electron-lock` was held from 06:27 until past 07:37 by the
main checkout's Electron tier (`verify-panels-shell`, still running), and the one-hour wait for it expired. That
check is owed.

#### M401 lead decision: the B7 filter (landed in M403's first commit)

`reopenTaskNews` filtered too hard (after a normal quit the task lines were almost always empty). Decided by the
lead and applied: **needs you** is a current fact, shown on every launch while the task's handoff is still ready or
blocked (recomputed live), as long as the need predates this launch; **finished** is told once, only when
`merged.at > LastExit.at` (and before this launch); **asleep** is dropped (every chat's process ends with the app, so
it was true of every conversation). `shared` stays in needs-you: the outcome function already calls it that and
the decision did not say otherwise. *Check:* `verify:layout reopen.task.2` rewritten ON PURPOSE — launch 1 says
needs-you b+c and finished a; launch 2 (nothing changed) still says needs-you b+c and no finished; no exit time →
needs-you only; a need that arose during this launch is not a return; asleep never. The owed `review.accepted.1`
(the extended one) ran green in M403's `verify:panels:product` run.

### M402 — one placement rule for every create door (B4), the review opens whole (B3), the rim's geometry

Reproduced both in the real built app (slot 1, CDP 9210, window 1200×800, navigator open — canvas host 852×744),
against the task the M400 builder left in `/tmp/tc-b1-repo` (its lane `tc/c2-…`, one committed README change).
The userData was snapshotted before the first drive (`/tmp/tcc-1.bak-m402-before`) and restored for the after-drive,
so before and after start from the same canvas. Screenshots: `B3-before.png`, `B3-before-flight.png`, `B3-after.png`,
`B3-after-flight.png`, `B4-before.png`, `B4-before-workcard.png`, `B4-after.png`, `B4-after-workcard.png`,
`B4-after-cmdn-{1,2,3}.png`.

**B4 (P1), new objects land on top, and the rule depends on the door.** *Reproduced:* Show on canvas put the task's
work card over the terminal and the chat (`B4-before-workcard`); two ⌘N presses cascaded two login shells into the
task's dashed region, over its review (`B4-before`). *Cause:* as the finding says — ⌘N, the sheet, preset spawns, files,
⌘K New note, work/GitHub/Jira cards, watchers, workflows, memory, browser, relay, capture, skill and new chats went
through `cascadeCentre` (exact-centre test only); stickies, shapes, pictures and "+ Create" went through M395's
`freeSpot`, which saw neither a group's FRAME (28 + 34 past its members, more than its 24 gap — how a chat landed in the
starter's "Examples") nor a task's dashed region; "+ Create"'s `spotFor` read `panelsRef` outside the updater.
*Fix — the rule:* `placement.ts`'s `placeNew` (pure), applied by `place-new.ts`'s `placePanel` to a panel the door
minted at the point it asks for, inside the door's `setPanels` updater over `current`:
1. obstacles = every panel's `occupiedRect` + the frame of every group the object is not in + (Canvas passes) every
   dashed TASK region, except for an anchored object, which joins its parent's task;
2. `anchored` (a review beside its agent, a capture beside its pane, a dispatched lane's chat beside its card, a checks
   watcher under its chat): the free spot nearest the point beside the parent, wherever the parent is;
3. otherwise the free spot nearest the view's centre wholly in view and clear of the floating chrome; if the view has
   no room, the nearest free spot anywhere;
4. `cascadeCentre` only when nothing within reach is free (the full-view fallback, 80 rings);
5. then `useViewport`'s `reveal`: no camera move when the object is already wholly in view at a readable scale;
   otherwise a flight that centres it at `max(scale, READABLE_SCALE)` (its fit if it is too big for that), landed in the
   largest part of the canvas the chrome leaves (the minimap reserved). A pool's mint is `quiet` (no flight for a mint
   nobody pressed for); a review lands `lit` (the attention jump's arrival glow).
`Canvas.tsx`'s `placer()` reads the DOM (chrome, view) and the groups/regions once, outside the updater, and returns
the function the updater calls — the batching rule kept. Every `cascadeCentre` door in Canvas, `useBoardVerbs`
(dispatch, checks watcher) and `useFlowchartVerbs` (shapes) now goes through it; "+ Create" hands every kind to its
door's own placement (no `spotFor`, no `exact`), so ⌘K and Create put the same object in the same place. A point a
person GAVE (double-click, drop, the starter's layout, `at` from a caller) stays exact.
*The ⌘N cascade decision:* changed, and its load-bearing entry updated (`docs/load-bearing.md`, "`Cmd+N` cascades" and
"A new AUTHORED object goes to free space"). The old reason was "overlap is the NORMAL state of a working canvas, so an
overlap rule would step nearly every press away from where the user is looking." That held while an object placed off
the centre was an object nobody saw. It no longer holds: every create door ends with the reveal, so the step away is
seen, and the measured cost of the old rule was a new terminal burying the one under it.
*Measured after:* the work card lands in free space above the chat (`B4-after-workcard`); three ⌘N presses land three
terminals clear of each other and of the task region, each flown to at 80% (`B4-after-cmdn-*`, `B4-after`: the only
overlap on that canvas, n1/c2, is the pre-existing one from before the drive).
*Not done, with reasons:* the lineup/swarm/template ARRANGEMENTS keep their fixed offsets (the planner's "place the
arrangement as one bounding box" is a larger change to `useBoardVerbs`' seat loop; its members are minted outside the
placer). `recover.ts` keeps the cascade (it restores, it does not create). A skill panel's point is the drop's (exact
by M395's rule) and keeps its cascade.

**The rim (the M399 + A4-redo critic, item 1).** *Cause:* the 16px name strip of a live chromeless terminal sits above
its rect, and snap, the placer, the marquee and group bounds read the rect. *Fix:* `panels.ts`'s `TERMINAL_RIM` and
`occupiedRect(panel)` (every terminal, not only a live one — the tier is a zoom-time fact, placement must hold at every
zoom), read by the placer (obstacles AND the new object's own box), the marquee (`useCanvasPointer`), group bounds
(`groups.ts`'s `groupRect`, so a group frame encloses its top terminal's name), and the drag snap: `arrange.ts`'s
`smartSnap` takes `rimOf`, applied to the STACKING pairs only (my top on your bottom, my bottom on your top) — top-to-top
alignment still lines up the frames a person sees. The cascade itself is centre-based and needs no rect. The title is
capped at `calc(50% - var(--sp-6))`, clear of the north port at the frame's middle. *Decision:* a snap no longer pulls a
lower terminal flush under an upper one; dropped there by hand without snapping, it still may overlap (the person's
choice).

**B3 (P1), the review opens clipped.** *Reproduced* (`B3-before`): the task review was 960×760 world in an 852×744
canvas at 100% — its ⋯/refresh/fill/close off the right edge, the diff cut, the minimap over its heading; with one file
the row wrapped the diff BESIDE the stretched file name (measured: the diff 260px of 916). *Cause:* the fixed
`TASK_REVIEW_SIZE`; the flight went through `centreOn`, whose oversized branch skipped `safely`; `safely`'s move
(`clearOfOverlays`) only goes up or left, so a target under a top-right minimap stayed there; the map's `needed` is
judged per in-between frame, so a flight brought it in over the target; `.review-node__file` wraps, so the stack
layout's hunks sat beside the row. *Fix:* `safe-area.ts`'s `sizeToView` sizes a review at mint to the largest part of the
canvas the chrome leaves (minimap reserved) at the reveal's scale, clamped to `REVIEW_MIN` (520×400) … `TASK_REVIEW_SIZE`
/ `REVIEW_W×H`; it is placed by the rule beside its agent and flown to by the reveal, which lands it in that free frame
(`viewport.ts`'s `freeFrames`, extracted from `clearFraming` unchanged); `centreOn`'s oversized branch now goes through
`safely` on its leading part; the minimap keeps its take-off state during a flight (hidden stays hidden, shown tucks
aside — `MinimapOverlay`'s `flying`); the stack layout's diff takes a full line under its row, and the rail's file column
is `clamp(160px, 24%, 220px)`. *Measured after* (`B3-after`): the review 820×566 at (364,176)–(1184,742) inside the
852×744 host, below the minimap (1028,68)–(1188,168); every header control's centre in the host and hit by
`elementFromPoint` inside the review; the diff the full width of the row; mid-flight the map is a tucked tile
(`B3-after-flight`).

**Checks added (scoped ids):** `verify:viewport place.rule.1` (a group's frame is an obstacle, a member-to-be may
enter it), `place.rule.2` (⌘N ×3 pure: none overlap, rims included, the first centred), `place.rule.3` (anchored beside
a far-off parent, clear of a review already there), `place.rim.1` (occupiedRect + group frame enclose the rim),
`place.rim.2` (a snapped stack leaves the rim; a near-flush drop is not pulled flush; top-to-top still aligns frames),
`place.reveal.1` (no move in view; readable scale from far; fit when too big). `verify:panels:core place.free.1` (⌘N ×3
in empty world space: no two overlap, measured from the DOM, each on screen after its press). `verify:panels:kinds
place.snap.rim.1` (two live terminals, the lower dragged by its NAME to 3px past the rim line with snapping on: the gap
is TERMINAL_RIM and `elementFromPoint` on the upper one's bottom row under the lower name answers the UPPER panel).
`verify:panels:product place.group.1` (after the starter, a chat opened through `beginNewChat` does not overlap the
"Examples" group's painted frame or any panel). `verify:panels:product review.fit.1` (B3: the harness window set to 1200×800, the card's Review pressed, the reveal
landed: the review's frame inside the canvas host and every header control's centre in the host and answered by
`elementFromPoint` inside the review, never the minimap). Its first run was RED on the fixed build and found a second
defect: with the harness's narrower canvas (592px, rail and inspector open) no free frame held the sized review at
100% by a few px, and the fallback `safely` lifted it under a top-right minimap. So the reveal now takes the free frame
that allows the largest scale up to its own (`useViewport`'s `inFreeFrame`, `shrink`; it landed at 0.999), and
`centreOn` — whose `safely` move only goes up or left — lands a fitting panel in the largest free frame at the SAME
scale when the move leaves it covered (its keep-the-zoom contract unchanged).

**Checks changed deliberately (each for the reason named):**
- `panels:core 7` — "centred on the view" became "the free spot nearest the centre, overlapping nothing (occupied
  rects), on screen": the seed s01 overlaps a 720×460 rect at the view's centre.
- `panels:core 8` — types into check 7's panel BY ID with the camera where 7's reveal left it; it used to reach that
  panel only because the cascade laid it over s01's centre (s01's seed command echoes nothing).
- `panels:core 51` — the second press lands CLEAR of the first (no CASCADE_STEP); the first is centred across and
  lifted only as far as the HUD/pill require (≤160 world px).
- `panels:core fit.1` — A is clicked while it is on screen (before B's press flies the camera); B added by the
  dispatched shift press.
- `panels:core rest.1` — resets to INITIAL and picks an on-screen, hit-testable frame.
- `panels:kinds 175` — the first ON-SCREEN, hit-testable panel, not the first in the DOM.
- `panels:kinds broadcast.1` — frames the pair (select both, palette Zoom to fit) before its real clicks; B is dragged
  out of A's way only when it covers A's chrome.
- `panels:shell 107` — the reload's camera is centred on the subject (no longer near the origin).
- `panels:shell 114` — frames the subject (rail row) so its shell is live before writing, back to the node, refresh.
- `panels:shell 115` — frames the node again after the peer's spawn flew the camera to the peer.
- `panels:product note.1` — resets to INITIAL before its elementFromPoint (the note-adds' reveals moved the camera).
- Not changed, checked: `panels:kinds 142/144b` (green), `panels:shell 90/100b` (green), `verify:viewport 51–55/78` and
  `revamp.place.1–.2` (green: cascadeCentre and freeSpot are unchanged), `verify:groups` (green),
  `verify:flowchart arrange.*` (green — `rimOf` defaults to 0).

**Suites (this milestone's final tree).** Plain: `verify:viewport` 193/193, `groups` 18/18, `flowchart` 169/169, `styles`
93/93, `meta` 51/51 (after the kinds watchdog comment kept its "// measured" form, `panels-split.1`). Electron, each
alone: `panels:core` 87/87 (63.8 s), `panels:kinds` 53/53 (53.1 s; its watchdog RE-PINNED 60000 → 68000 — two green runs
53.1 s / 53.8 s put `headroom.1` at 89.7%; the added check and the reveal flights are the growth), `panels:shell`
105/105 (83.2 s), `panels:product` 135/135 twice in a row (180.8 s, 180.9 s — note `starter.1` is GREEN now, M399's A5),
`panels:agents` 85/86 (only `template.1`, baseline), `panels:flowchart` 16/16 (38.4 s). `npm run affected` (earlier in
the milestone, before review.fit.1): 55/56, the one red `panels:agents template.1` (baseline).
*Hangs, measured, not called flakes by assumption:* `panels:product` hit its watchdog twice in nine runs (once hung
awaiting a reload in the D07 block, once in a `TC_ONLY` run); the next three full runs were green. `panels:orchestrate`
was 37/37 twice (140 s, in and out of `affected`) and then hung at different checks in three runs at load 5–16 — and
hung the same way on the BASELINE build (my changes stashed, rebuilt: watchdog at 29 checks, load 16). So the
orchestrate hang is not this milestone's; the product hangs are unattributed.
*Goldens expected to move:* every scene with a live terminal whose title is long (the rim title's `max-width`);
`group*` (a group whose top member is a terminal grows 16px at its top, `occupiedRect`); any scene that creates an
object at shot time (the object is placed by the rule and the camera may fly: `starter`, `palette*` if a row mints,
`chat` if its chat is minted, `spawn-sheet`/`start-work` if they spawn); review scenes where a review is opened at
shot time (sized to the canvas, the one-file diff full width, the rail's file column 160–220px): `review*`, `merged`,
`focus*`; `minimap`-bearing scenes only if shot mid-flight.
*Not done:* the lineup/swarm/template arrangements (above); a flight-time golden for the minimap. The A4 rim for an
agent terminal (`claude` in a PTY) was not driven with a real agent (M397's note stands).

#### M402 follow-up (critic)

The critic's "M402 → material" items 1–5 and the cheap minors. Not re-driven in the app (both slots were taken); every
item is pinned by a check instead, measured in Electron where the defect is a live one. (The stray `||||||| f5e642c9`
merge marker that closed the M402 section above is removed.)

1. **The rim is taller below 100%.** *Cause:* the strip is 16 SCREEN px at every zoom under 100% (M144's counter-scale
   grows it upward by `--chrome-scale`, clamped 1–2.5), so in the world it is 16 × that — 32 at 50% — while
   `occupiedRect` and the snap's `rimOf` used a fixed 16. *Fix:* `panels.ts`'s `terminalRimAt(scale)` and
   `CHROME_SCALE_MAX`; `occupiedRect(panel, rimAbove = TERMINAL_RIM)`. The drag snap (`Canvas.tsx`'s `snapNow`) and the
   marquee (`useCanvasPointer`) read the rim at the CURRENT zoom; a placement reserves the tallest live rim,
   `place-new.ts`'s `PLACE_RIM` = `terminalRimAt(LIVE_MIN_SCALE)` = 32 (below the near tier a terminal is a card, no rim).
   *Decision:* group frames keep the 100% rim and are documented as holding at every zoom: the frame's top is 78 world
   units over the frame and its header's foot 44, the strip at the counter-scale's ceiling 40. Minor folded in: a
   multi-move's `rimOf('selection')` read `p.rect.y === rect.y` against the MOVED bounds, which pre-drag rects never
   match; it now takes the members' topmost pre-drag y.
2. **Creating an object yanked the camera.** *Cause:* `revealTarget` moved the camera unless `scale >= min(0.8, fits)`,
   so ⌘N at a 50% overview zoomed to 80% for a panel already on screen. *Fix — the least move:* `viewport.ts`'s
   `revealTarget(vp, rect, size, { floor, covered, keepClear })`: at any scale from the near tier's floor (LIVE_MIN_SCALE,
   passed in — lod.ts imports viewport.ts), NO move when the object is in view and clear of the chrome as it shows;
   otherwise the smallest PAN at the same scale into the free frame (`freeFrames`, the minimap reserved) needing the
   shortest move, or the view when none holds it (too big: its leading corner in). Only below the floor (it would be a
   card) the old flight to READABLE_SCALE. `useViewport`'s `reveal` feeds it the chrome. *Quiet doors:* a new
   `place-quiet.ts` (a depth, released in `finally`, so it spans a step's awaits): the executor's `runAgentPlan` (the
   agent's line AND a workflow action node) runs each step under `quietly`, and `Canvas.tsx`'s `placer` treats that as
   `quiet` — no reveal — and passes `preferView`, so an ANCHORED quiet object tries a spot in view first
   (`placement.ts`'s `placeNew`). *Accepted cost:* a person's press landing during an agent step's await is quiet too
   (it still lands in view). The watcher doors needed nothing more: they place in view, which now moves no camera.
   Minor folded in: `pendingRevealRef` is a LIST — N objects made in one tick are revealed together (their bounds).
3. **A review's persisted size carried the press-time zoom.** *Fix:* `sizeToView(host, max, min)` takes no viewport;
   its pure half `viewport.ts`'s `sizeForCanvas` reads the free canvas at 100%. *Decision:* fully independent rather than
   the critic's `clamp(scale, 0.8, 1)`, because the size persists — any scale term makes two presses of the same
   review at 80% and 100% mint different boxes for good.
4. **A review of an agent inside a group was pushed out of the frame.** *Fix:* `PlaceHow.parentId`; `placePanel`
   treats the parent's group's frame as no obstacle. Passed by every anchored door: `openReview`, the task review, the
   across review, a capture, a dispatched lane's chat, a checks watcher.
5. **Check 7's and 51's y pins.** Restored to 1px on BOTH axes against the spot computed in the harness —
   `scripts/lib/place-probe.cjs`'s `measurePlacement` (before the press: the view, the chrome as the placer measures it,
   every store rect) and `expectedSpot` (after: the pure `placeNew` and `PLACE_RIM`, bundled into `panels-entry.cjs`).
   What this pins beyond verify:viewport is that the live door feeds the rule what the canvas shows.

*Minors:* the minimap now freezes `needed` itself during a flight (the live value led `shownPresence`), done.
`panels:product`'s hang lead was REAL: the D07 and M401 blocks' five reloads awaited `once('did-finish-load')` with no
bound; `reloadWithin(wc, 20000)` resolves on load, on a failed main-frame load (not ERR_ABORTED) or at the bound, logging
which, so the checks after it fail by name. *Not done:* `beginNewChat`'s `clearOfChrome` after placement (another builder
is editing `beginNewChat`; left for them — the rule already clears the chrome, so the call is at worst a no-op or a
small step); `fitAll`/`tidy`/`align` reading `occupiedRect` (a separate change to arrange.ts's tidy, out of this scope).

*Checks (scoped ids):* `verify:viewport place.reveal.1` rewritten (no move in view at 1 AND at a 50% overview; the pan
out of view is exactly the least distance, same scale, at 100% and 50%; from 0.3 a readable flight; too big, the leading
corner at the margin), `place.reveal.2` (in view but under the chrome: panned clear, never rescaled), `place.rim.3`
(the rim at 1/2/0.5/0.1, the 50% snap stops at 32, PLACE_RIM), `place.rule.4` (a review beside an agent inside a group
stays inside its frame with `parentId`, pushed out without), `review.size.1` (the size is the free canvas at 100%, no
scale input, capped and floored). `panels:core 7` and `51` pinned to 1px (above); `panels:core place.still.1` (⌘N at a
0.50–0.53 overview in empty world space: the rule's spot in view, the camera EXACTLY unchanged past a flight's length,
the panel on screen where the rule put it). `panels:kinds place.snap.rim.2` (its own live pair in empty world space at
0.50–0.53, the lower dragged by its name to 5 world px short of the measured rim: the gap equals the strip's MEASURED
world height, the name starts at or below the upper frame's bottom, and elementFromPoint on the upper one's bottom row
answers the upper panel). First run measured two harness facts: zoomed out over the fixture the live budget CARDED the
lower terminal (hence the pair in empty space), and the chrome's own box of a selected terminal is 37px (the controls),
so the strip is measured from the name.

*Suites (this follow-up's tree):* plain `verify:viewport` 197/197, `groups` 18/18, `flowchart` 169/169, `styles` 93/93,
`meta` 51/51, `deck` 44/44 (`deck.origin.1`, a source-shape check, updated for the `quietly` wrapper), `verbs` 30/30,
`onboarding` 21/21, `canvas-sync` 98/98, `jobs` 17/17, `first-run` 29/29, `workflow-schema` 17/17. Electron: NOT yet
green. One `panels:kinds` run (load ~70) was 46/54: `place.snap.rim.2` red for the two harness facts above (both fixed
since, not re-run), `link-draw.1–6` red (m24 fixture panels absent after its reload; unattributed, not re-run) and
`headroom.1` 96%; a second run hit the watchdog at check 133 at load 71–83. `panels:core` (checks 7, 51,
`place.still.1`), `panels:kinds`, `panels:product` and `panels:shell` are OWED on a quiet machine.

### M403 — the permission mode said where a task starts (B5), the guide inside its conversation (B6), Ask a question kept (B8)

Built in the main checkout on `m397-daily-loop`, app slot 1. Two commits: the first carries the M399/M400 critic
follow-ups and the lead's B7 filter decision (their notes are under M399, M400 and M401 above); this section is the
second. Screenshots in `/tmp/tc-daily-loop-shots/`: `B5-before`, `B5-after`, `B6-before`, `B6-after`, `B8-before-palette`, `B8-before-named`, `B8-after-palette`, `B8-after-create`, `B8-after-named`. The before shots were taken on HEAD `3f9c01be` (this work stashed, rebuilt, slot 1 fresh at 1200×800); two tiny real first starts ran in throwaway repos (`/tmp/tc-m403-repo`, `-b`: "Reply with the single word ok. Do not change any files." — the agent answered `ok`, nothing changed). HOME is not fenced: the real `~/.claude/settings.json` says `defaultMode: auto`, which is the case B5 is about.

**B5 (P2), the inherited permission mode is invisible.** *Reproduced* (`B5-before`): with the real settings in auto mode, "+ New task" → Change showed "✓ claude asks before a command runs", and nothing on the sheet said which mode applies. *After* (`B5-after`): "Claude Code decides for itself when to ask — auto mode, set in ~/.claude/settings.json" under who, and the fit row reads the same, unmet (amber). The first after-drive said "this repository's .claude/settings.json" for `~`: a folder that IS home reads home's file as both its user and its project arm, so the same path is now counted once, as the user's (`toolbox.mode.1` pins it).
*Cause:* `agent-session-args.ts` passes `--permission-prompt-tool stdio` and no `--permission-mode` (kept — lb 3358),
so `permissions.defaultMode` in the person's own settings decides; nothing read it, and `backend-fit.ts`'s
permissions row promised "claude asks before a command runs" unconditionally. The chat header's `auto` is a door to
the bounded Auto run, and read as a mode.
*Fix:*
- `toolbox-scan.ts`'s `parsePermissionCounts` projects `defaultMode` (a known `PERMISSION_MODES` word or ABSENT —
  `"default"`, a future word, a number are absent; the projector rule, lb 1705). No new door: the existing
  `toolbox:read`.
- `shared/toolbox.ts`: `effectivePermissionMode` (read order user → project → local, last wins; `local: false` for a
  lane, because `settings.local.json` is gitignored and a worktree never has it; managed settings are not read, so
  the words say "your settings"), `PERMISSION_MODE_WORDS` (does it ask, in plain words) and `permissionModeLine`.
- The New task sheet reads the chosen repository (or `~` before one is chosen — the TOOLBOX home, fenced by
  `TC_TOOLBOX_HOME` in every harness) once per folder, and says ONE line under who, for the claude row only:
  e.g. "Claude Code decides for itself when to ask — auto mode, set in ~/.claude/settings.json", or "Claude Code asks
  before it runs a command or edits a file — your settings set no permission mode".
- The permissions fit row is judged by the mode (`backendFit`'s new `mode`): auto, dontAsk and bypassPermissions are
  said as what they are and the row is unmet (the lane reads degraded) — no promise of asking; absent, manual,
  acceptEdits and plan keep it.
- The chat's button reads **Auto run…** (aria-label too); `data-chat-auto-open` kept.
*Decisions:* only the sheet says the line — the launcher's three steps and step-3 sentence are on the Keep list, and
the launcher's start runs through the same executor; the launcher gains nothing here (recorded, not done). A folder
the toolbox reader cannot read says nothing rather than guessing. The read can run `claude plugin list` once per
new folder on a cache miss (the toolbox door's existing behaviour).
*Checks:* `verify:toolbox toolbox.mode.1` (projection, precedence, local left out, the line's words) and
`toolbox.mode.2` (under a fence the `~` read is the fence's, never the real home's `auto`); `verify:agent-session
fit.mode.1`; `verify:panels:product start.mode.1` (the fence says auto → the sheet's line and the fit row, then the
fence file is put back).

**B6 (P2), the progress coachmark covers the composer.** *Reproduced* (`B6-before`): on a real first start the guide measured (597,668)–(999,767) over the composer (533,639)–(1065,753) at 1200×800 — the caption lay across the message field its sentence points to. *After* (`B6-after`): the strip sits under the header, (153→222) px, the composer (610→723) px, no floating hint.
*Cause:* `FirstTaskHint` rendered outside `.world`, anchored under (or flipped over) its panel and clamped into the
host, so on an ordinary window it sat over the composer's Send/Answer.
*Fix:* the same component with `strip`, handed to its ChatNode as `guide` (Canvas's `firstTaskStrip`; the floating
mount is gone), rendered as the first child of the chat body: `position: absolute` over the top of the transcript,
the body `position: relative` only while it is there, the transcript padded by the strip's measured height
(`--guide-h`, set on the body by the strip and removed with it). Permanent (with its panel until Got it — the old
"step aside while another panel is selected" rule has nothing to guard inside the panel), quiet (the panel surface,
one hairline, `--t-xs`). Got it and the review verb are unchanged. The body's box and the composer never move (the
M236 frame rule).
*Check:* `verify:panels:product first.strip.1`, on the real first start of `onboarding.intent.e2e.1`: the strip is
inside `.chat__body`, computed `absolute`, no hint outside the panel, no overlap with the composer or any of its
buttons (each hit-tested by `elementFromPoint`), and after a Got it press the body and composer rects are identical.

**B8 (P2), "Ask a question" disappears after first use.** *Reproduced*: ⌘K "ask a question" selected "Agents working at once", a setting (`B8-before-palette`); a folderless chat from the launcher's Ask kept the name "chat · c1" after its first message was answered (`B8-before-named`). *After*: "ask a question" selects "Ask a question (new chat, no folder) — claude" (`B8-after-palette`); the Create sheet has Ask a question beside Task | Panel (`B8-after-create`); the same first message names the chat "What is two plus two? Answer in one…" in the header and the navigator (`B8-after-named`).
*Fix:* (1) ⌘K: the no-folder chat rows lead with the launcher's words — "Ask a question (new chat, no folder) —
claude" — and "ask a question"/"ask" select them; the old words still find them; the id and the no-folder fact are
unchanged (`sandbox.1`). (2) Create: the sheet "+ Create" opens carries **Ask a question** beside Task | Panel (a word
verb, not a third tab: it opens a folderless chat on the installed engine and closes the sheet; disabled by name
with `REASON_NO_CLAUDE` when no engine was found). (3) A chat with NO folder is named after its first message
(`chatNameFromMessage`: first non-blank line, flattened, cut at a word with an ellipsis at 40) the moment its first
user turn exists — a plain title write, not a history step, never over a title already set. *Decision:* only
folderless chats are renamed; a chat in a folder already has an honest name (teammate · place).
*Checks:* `verify:palette ask.alias.1`, `verify:rail chat.name.2`, `verify:panels:product ask.create.1` (a real press
on the sheet's Ask a question → a sandbox chat record, the sheet closed). Planned and not kept: `chat.name.1` (the first message sent →
the header and the stored title read its words) — *dropped*: in the panels harness a sandbox chat cannot send (main's fake session answers a recycled panel id with a STALE session's folder, beginNewChat's M120 note; the composer is replaced by "no such directory"), and a transcript turn written behind it is not hydrated without a live session. Measured in two runs; the naming is pinned pure (`chat.name.2`) and was driven in the real app (above). A comment in the suite says so.

**Goldens expected to move:** `start-work` (the mode line under who — the fence's "your settings set no permission
mode"; the filled Start task; the who line/mint name "Claude Code · …"), `spawn-sheet` and any New panel sheet scene
(Ask a question in the head), every chat scene whose header shows the Auto door (`chat`, `kinds`, `kinds-dark`,
`header`, first-run scenes: "Auto run…" is wider than "auto"), any scene with the first-task guide (it is now inside
the panel), `palette*` scenes listing the no-folder rows.

**Seen while driving, not fixed (outside the IDs):** with "Auto run…" the chat header at the default chat width clips
its last control ("Open terminal sessio…", `B6-after`) — D5's header template is where that belongs.

**Suites (M403, both commits' tree).** Plain: `verify:palette` 172/172, `onboarding` 22/22, `layout` 285/285,
`toolbox` 109/109, `agent-session` 188/188, `rail` 261/261, `review` 163/163, `first-run` 29/29, `styles` 93/93,
`meta` 51/51. Electron, each alone under the lock: `verify:panels:agents` 85/86 — only `template.1` (baseline);
`verify:panels:product` **142/142** (186.9 s of 230 s, 81%), including `pill.dismiss.1/.2`, `start.door.1/.2`,
`start.primary.1`, `start.refuse.1`, `start.mode.1`, `first.strip.1`, `ask.create.1` and the extended
`review.accepted.1` owed by M401. Earlier product runs on the way: one red on my own draft leak (`start.door.1`/
`start.primary.1` — `start.refuse.1` left a plain-door draft in the harness's persistent localStorage; it is now
cleared before door.1 and after refuse.1), and one run with `workflow.wire.1`, `wfx.ui.1`, `workflow.inspect.1` red
(checks that run BEFORE any M403 block and passed in the three other runs; re-run alone: green) — unattributed,
recorded, not called a flake by assumption. `npm run affected` was NOT run as a whole: the machine sat at load 70
with three builders, and the lock was contended; the suites above are the ones the change reaches.

**Boundary critic follow-up (on `5a74d5d7` and `792135a6`).** Main checkout, `m397-daily-loop`.

1. **SECURITY: a symlink to home got past the home refusal and granted home.** *Reproduced* in plain node:
   `isHomeDir(<link to a temp home>, <that home>)` is `false`, so main's `git:status` said `home: false` for
   `/tmp/h → $HOME`. `firstWorkRepoAnswer` returned the canonical home, and the mint granted it. main did not stop
   it either: `saveTeammate` took any absolute place. *Fix:* `home-dir.ts` gains `wholeMachinePlace` (home or `/`,
   judged on `realpathSync.native` of the place, and on the typed spelling too), `statusPlaceFacts` (the `git:status`
   handler's `real` + `home`, now judged on the realpath and moved out of `ipc.ts` so a plain-node check can pass it
   a fake home), and `teammatePlaceRefusal`. **main is now the authority:** `saveTeammate` throws (its existing
   refusal shape) when a save ADDS a place that is home or `/`. *Decision on existing records:* the parser is
   unchanged, so a saved layout whose teammate holds home still loads. A re-save keeps a place the STORED record
   already holds, so renaming such a teammate never throws. Only a new place is judged. Removing the old grant is
   the person's, in the Teammates pane. Nothing persisted is rewritten. The Teammates pane's Add place now says a
   refusal as a toast ("Place not added"), where it used to be an unhandled rejection that looked like nothing
   happening. *Check:* `verify:onboarding onboarding.home.1` makes real links on disk into a temp dir passed as
   home. The link to home is refused as home through `statusPlaceFacts` → `firstWorkRepoAnswer`, and by
   `teammatePlaceRefusal`. `/` and a link to `/` are refused. A folder under home passes. A place the old record
   holds is kept.
2. **The expanded pill swallowed a terminal's Escape.** *Cause:* M403's `pill.dismiss.2` kept the pill up through
   ANY press on a panel, and `escapeBelongsElsewhere` leaves an `.xterm` target to the pill. So the sequence click
   into a terminal, then Esc, collapsed the pill in the capture phase, and the agent never saw `\x1b`. *Fix:* only a
   MODIFIED press on a panel (Shift or Cmd, the gestures that add to a selection) keeps the pill up. A plain press
   collapses it at once, without restoring focus. The marquee rule on bare canvas is unchanged. *Checks:*
   `verify:panels:product pill.esc.1`: the pill is open, a real plain click lands in the terminal, the pill is
   collapsed, and the next real Escape reaches the PTY as `\x1b`. `pill.dismiss.2`'s panel press is now a real
   Shift-press. The lb entry for CommandPill is amended.
3. **The fit row used the previous folder's mode.** The mode joined the start context whenever any read had
   answered, so for one read a new folder was judged by the old folder's mode. *Fix:* `StartWorkSheet` computes the
   folder first (`startWorkRoot` reads only root, repos and wanted) and passes `permissionMode` only when
   `modeRead.cwd === modeCwd`. *Check:* none added. The race lasts one toolbox read inside a React render, and
   `start.mode.1` pins the settled state.
4. **The no-mode line was overconfident.** *Fix:* `permissionModeLine(null)` now reads "…asks before it runs a
   command or edits a file, unless a managed policy says otherwise — your settings set no permission mode". The
   projector records a `defaultMode` key that is not a known word as `defaultModeOther`: `"default"` is kept as its
   own value, and anything else (a future word, a number) is `unrecognised`. It never records the raw value.
   `effectivePermissionMode` lets either one win its place in the read order. An unrecognised mode in the project
   file therefore stops the user file's `auto` from showing through, named as the mode that applies. The line says
   "default mode, set in …" for an explicit `default`, and nothing for an unrecognised mode. `fitPermissionMode`
   maps a default to null (asks), and maps an unrecognised mode to not-read. *Limit, recorded:* with a mode it
   cannot read, the fit row falls back to its pre-M403 wording ("asks before a command runs"). *Check:*
   `verify:toolbox toolbox.mode.3`, and the wording of `toolbox.mode.1` was amended.
5. *Minor, landed:* `first.strip.1` has a small-panel arm. The same conversation is dragged to the panel floor by
   its real `.panel__resize--se`, the strip is still there, every composer button wins `elementFromPoint`, and
   Got it is judged at that size. The CSS makes that true: while the strip is up the composer is `z-index: 3`
   (already positioned and opaque), so a guide that wraps taller than a short body cannot cover Send or Answer.
6. *Minor, decided, not changed:* an armed review accept (`role=alertdialog`) keeps the expanded pill's Esc until
   it is cleared. It is a layer and the topmost one, so the first Esc disarms it. That is the rule the pill follows
   for every other open layer, and it is what a person expects. The pill's next Esc closes the pill.

**Suites (follow-up).** Plain: `onboarding` 23/23, `toolbox` 110/110, `subagent` 32/32, `teammates` 26/26,
`orchestration` 145/145, `verbs` 30/30, `electron` 4/4, `toast` 10/10, `team` 30/30, `meta` 51/51, `styles` 94/94,
`palette` 172/172, `layout` 286/286, `first-run` 29/29, `agent-session` 188/188, `ipc` 1/1. Electron, alone under
the lock: `verify:panels:product` **145/146**, 194.5 s of 230 s (85%). `first.strip.1` (with the small arm),
`pill.dismiss.1/.2` and `pill.esc.1` passed. The one red is `names.agree.1` (M404's; it reports the dock tooltips
"Hide Board" etc.), which touches nothing here. It is not mine and is left to the M404 owner. The first draft of the
small arm dragged to the 160px HEIGHT floor as well. There Send is clipped below the body with or without the strip,
so the arm is width only; that chat-floor fact is recorded here and not fixed. Three earlier product runs died at
the watchdog mid-suite, before the pill block, while the machine sat at load 56 with ~4k free pages. They are
unattributed and were re-run on a quiet machine.

**Goldens expected to move:** any `start-work` scene that shows the no-mode line (now longer, with the managed-policy
hedge). The composer's z-index changes no pixels unless the strip overlaps it.

### M404 — one name per place, no duplicate doors, People only when there are people (C1, C2, C3)

Worktree `tc-m404-names`, branch `m404-names` off `843e02f3`. App driven on slot 2 (CDP 9220).

**C1 · one name per place — reproduced, landed (copy only).** Reproduced by clicking each dock pane in the
real app and reading the button's `aria-label`, its tooltip, the pane heading and the pane's Hide control from the
DOM (`/tmp/tc-daily-loop-shots/C1-before.png`): Tasks → BOARD, Notes → VAULT, Services → CONNECTIONS inside a
dock group also called Connections, every pane's collapse said "Hide the navigator", and two of those
(Files, Connections) rendered `(⌘\\)` — a doubled backslash, because a JSX attribute string is not a JS string and
does not unescape. Cause: each surface wrote its own literal, and nothing compared them.
Names chosen, each with its reason:
- **Board** (dock "Tasks" → "Board"). "Task" is the noun of New task and of Orchestrate's task list; this pane is
  the GitHub/Jira board, which its heading, its empty sentence and ⌘K's "Open board" already said.
- **Notes** (pane "Vault" → "Notes"). A `note` is a Markdown file and this pane lists exactly those. "Vault" stays
  the code's word (`VaultPane`, `data-vault-pane`, `navigator: 'vault'`, `useVault`).
- **Connections** (dock "Services" → "Connections"). The pane heading and ⌘K's "Manage connections…" already said
  it. The dock GROUP around it is renamed **Setup** — what those two panes are for, set up once — so one word
  names one place. (C4 may later move them into Settings; the name survives that.)
- **Hide <Pane>** on every pane's collapse control (was "Hide the navigator"), with `(⌘\)` rendered once, correctly.
- **People** (top segment "Team" → "People", and the page's heading). "Team" beside the dock's "Teammates" read as
  one thing twice; Teammates are AGENT identities (the model's own word, used by the sheet, dispatch and routines —
  renaming it would be a far larger copy change), so the PEOPLE view takes the plainer word. Code id `team` stays.
- **Orchestrate** everywhere: ⌘K "Show Orchestration" → "Show Orchestrate", View menu "Orchestration view" →
  "Orchestrate". The segment, which the prompt called the name, was already "Orchestrate".
- **The crumb is a switcher**: a chevron (`ChevronDown`), a hairline at rest, `.shell__crumb--switcher`,
  `data-crumb="workspace"`, tooltip "Switch workspace — or add, rename and see history in the Workspaces list". It
  opens the Workspaces pane (the list IS the switcher); the name clips inside, never the chevron.
- **Default workspace name — STOPPED, recorded for the lead.** The fresh default is `defaultWorkspace()` in
  `src/shared/layout-schema/types.ts`, which is the persistence module AND is also the repair path `parseLayout` uses
  for an EXISTING layout that has no usable workspace (`workspaces.ts` ~481); `parseWorkspace`'s fallback for an
  absent name is `'Canvas'` too. Changing either changes what an existing file loads as, so per the brief it was not
  done. What did change is the one renderer-side fresh name: deleting the last workspace mints a replacement, now
  named **Workspace** (was `'Canvas'`, `palette-actions/workspaces.ts`). The suggested name for the lead's decision is
  also "Workspace" (the crumb then reads "Workspace ▾", which says what it switches). No persisted name is rewritten.
- Palette rows kept their titles where they already carried the name (Open board, Manage connections…, Manage
  teammates…, Manage workspaces…): the agreement rule is "the row names the place", and renaming those would ripple
  into search checks for nothing.

**C2 · duplicate doors in prime chrome — reproduced, landed.** `npm run lb -- Dock` read first (one destination model
at two densities; the dock's `overflow: visible` / `z-index: 910`; nothing there pins membership). Removed from the
dock: **Orchestrate** (the top segment is its door; ⌘K "Show Orchestrate" stays) and **Workspaces** (the switcher
crumb is its door; ⌘K "Manage workspaces…" stays). `.dock__*` classes and every other `data-dock` id are unchanged.
**⌘\ conflict resolved:** ⌘\ shows or hides WHICHEVER pane the navigator holds (`useShellChrome` → `toggleNavigator`),
so the dock's Panels claiming it was false whenever Files or Notes was showing. Panels no longer carries ⌘\; each
pane's own Hide control carries it. The View menu's "Merged view" (a duplicate of the Workspaces pane row the
finding names) and "Orchestrate" rows were LEFT: the direction is to take duplicates out of the dock, the View menu
is not rest chrome, and `.shell__merge` is clicked from outside the menu by three harnesses.
Harness updates (deliberate, recorded): every `[data-dock="orchestration"]` click in `verify-panels-orchestrate`,
`verify-panels-shell` (`toggleOrch`; `orch-page.1`'s wording) and `shot.cjs` now presses the top segment —
`[data-seg="orchestration"]:not([aria-pressed="true"])` to open, and
`.shell__center-toggle:has([data-seg="orchestration"][aria-pressed="true"]) [data-seg="canvas"]` to leave (it
matches exactly when the old pressed dock button did). `SegmentedControl` gained a `data-seg={id}` hook for this: an
option can now come and go (C3), so pressing a place by position would be wrong. Every `[data-dock="workspaces"]`
click (`verify-panels-agents`, `verify-panels-product`, `shot.cjs`) now clicks `[data-crumb="workspace"]`;
`verify-panels-agents`' real-dock-click check presses Notes (`vault`) where it pressed Workspaces.
`verify:styles shell.recommendations.1`'s dock word list had gone vacuous ('Canvas' and 'Tasks' matched only
comments); it now pins `label: 'Setup'`, `'Board'`, `'Notes'`, `'Connections'` etc. `dock.1` needed no change — it pins
the dock's styling, not its membership — so membership is pinned by the new `dock.dup.1`. The lb entry's group list
(Work, Content, Connections, System) was corrected to Setup.

**C3 · People (was Team) only when there are people — reproduced, landed.** Reproduced signed out: the Team segment
opened a full page reading "not signed in — run `tc login` or sign in from the app first" with no button
(`C3-before.png`). Now the segment shows only when an account is signed in (`accounts.sessions.length > 0`) or the
active workspace is shared (`shared.view !== null`, passed from Canvas as `sharedWorkspace`), and stays while the page
is showing so a pressed place never vanishes under the person. The new ⌘K row **Show People** (`canvas.people`; there
was no palette row for this view before — the prompt assumed one) is always present. Signed out, the page's empty
state is a sentence and a real **Sign in with GitHub** button that calls `accounts.signIn` — the same door as the top
bar's account menu — disabled WITH its reason when accounts are unconfigured (never hidden), and the refusal line
naming `tc login` is not shown beside it. The button was not pressed in the live app (it opens a real browser OAuth).

**Four doors.** `verify:verbs` 30/30 (no verb's door was the dock). Every removed chrome door stays in ⌘K, and
`dock.dup.1` finds both rows by search.

**Checks added (scoped ids, all measured in the running shell, `verify:panels:product`, signed out, before M345's
block turns the harness account on):**
- `names.agree.1` — for each dock pane: button `aria-label` = visible label = `Hide X` tooltip = the pane's Hide
  control's name = the pane heading (Files excepted: its heading is the folder, a fact), and where a ⌘K row opens it
  (Board, Connections, Teammates) a row found by searching the name names it.
- `dock.dup.1` — no `orchestration`/`workspaces` in the dock; the segment and the crumb are PAINTED
  (`elementFromPoint`); the crumb has its chevron; "Show Orchestrate" and "Manage workspaces…" are found in ⌘K; no dock
  control claims ⌘\.
- `team.segment.1` — no People segment signed out; ⌘K "Show People" opens the page; its sign-in button is painted,
  reads "Sign in with GitHub", is disabled with the harness's reason; the segment is pressed while shown and gone after
  leaving; present once the harness signs in.

Screenshots: `C1-before/after.png`, `C1-after-crumb.png` (crumb → Workspaces pane), `C2-before/after.png`,
`C3-before.png`, `C3-after.png` (People page signed out), `C3-after-rest.png` (no People segment at rest).

*Goldens expected to move:* effectively EVERY scene — the top bar loses its third segment for a signed-out harness
and the crumb gains its switcher chrome, and the dock loses two buttons (so every button below Board moves up).
Scenes that sign in (`account-menu`, `share-*`, `shared-*`, `team-ask`) keep a segment, now reading "People".
Pane headings change in the Notes/Vault and Connections scenes (e.g. `integrations`), and `teammate` shows "Hide
Teammates". Scene intents that name "Team" or the dock's Orchestrate were not rewritten here.

*Suites:* plain tier green — `verify:verbs` 30/30, `palette` 169/169, `styles` 93/93, `meta` 51/51, `team` 30/30,
`account` 61/61, `presence` 33/33, `onboarding` 21/21, `first-run` 29/29, `canvas-sync` 98/98; `tsc -p
tsconfig.web.json` clean; build clean. **The Electron tier was NOT run.** `/tmp/tc-electron-lock` (another holder's,
created 06:27) was never released in over two hours, and by 08:50 no Electron process was running under it — it looks
stale, but it is not this builder's to remove. So `names.agree.1`, `dock.dup.1` and `team.segment.1`, and the
harness selector rewrites in `verify:panels:{product,shell,agents,orchestrate}` and `shot.cjs`, are UNRUN: they were
exercised only by hand against the live app (the same DOM reads, on slot 2). The lead owes a run of those four
suites before merging, with `TC_VERIFY_SUFFIX` set.

**M404 follow-up (critic).** Built in the worktree without launching the app or running an Electron suite (the lead
runs those at integration). `npm run lb -- layout-schema` read first.
1. *Default workspace name: DECIDED "Workspace", fresh layout only.* `defaultWorkspace(name = 'Canvas')` takes the
   name; `defaultSnapshot()` passes the new `FRESH_WORKSPACE_NAME` ("Workspace", exported from `@shared/layout-schema`).
   That covers a first launch (the store on a path with no file) and a file that is not JSON or not an object ("starting
   from defaults"). Every repair keeps 'Canvas': `parseLayout`'s no-usable-workspace branch, the store's
   `activeWorkspace()` repair and never-zero guard, and `parseWorkspace`'s absent-name fallback. A stored name loads as
   written, and no saved file changes. The renderer's delete-the-last-workspace replacement now reads
   `FRESH_WORKSPACE_NAME` rather than a second literal, and its stale "'Canvas' matches main's default" comment is
   corrected. *Check:* `verify:layout workspace.default.1` pins fresh = "Workspace" (both `defaultSnapshot()` and a
   real store on a missing file), and stored "Canvas", absent name, the no-workspace repair = 'Canvas', and a stored
   "auth refactor" = as written. No existing check pinned the fresh name (every `name: 'Canvas'` in the suites is a
   stored fixture, which is the point).
2. *"Vault" inside Notes, and the other retired words.* Copy only, keys kept: the empty states (`no notes folder yet — choose a
   folder of markdown notes…`, `the notes folder could not be read…`), VaultPane's refresh ("Refresh Notes" / "Read the
   notes folder again") and over-the-cap line, the palette text line and setting label "Notes folder", the setting's
   description ("…the Notes pane lists…"), `shell.navigator`'s description (the panes by their names), useVault's
   read error, main's `vault-read.ts` refusal ("there is no notes folder at …", which shows in the pane), and
   verb-table's two plan refusals. The sweep also found `Navigator pane: vault` as the palette row's title. The enum's
   stored values are keys, so `SettingDef.valueLabels` (display only) makes that row say "Notes" / "Connections" / "Board".
   People: TeamView's back button ("Back to People", "People"), canvas-ops' refusal ("a People view snapshot…"), and
   the account menu's sign-in tooltip. The one "Services" left is SetupSheet's (a setup record's dev servers, a
   different thing), and it is allowlisted by name. Orchestrate's "Tasks" is the task list, not the board, so it stays.
   `verify-panels-product`'s vault arm now matches `/no notes folder yet/`. *Check:* `verify:styles names.words.1` scans
   every prose literal in `src/renderer` and `src/shared` as text (a spaced string that isn't a class list or template,
   a lone Title-case word, or JSX text; `searchText`/`keywords` lines are aliases on purpose) for Vault, Services,
   Team, Show Orchestration, Orchestration view, Open board and Hide the navigator. It has a planted-sentence
   self-test. Against HEAD's `empty-states.ts` it goes red with both lines.
3. *People page:* aria-label "People". The empty line is now "Nobody else is on a shared workspace right now." The
   `account.sign-in` subtitle is "to share workspaces and see who in your organization is working".
4. *⌘\ discoverability:* a View ▸ Layout row, **Navigator ⌘\** (checked while the navigator shows, `data-view-navigator`,
   a new `PanelLeft` icon mirroring Context pane's), wired to `chrome.toggleNavigator`, the chord's own handler. I chose it over the
   dock tooltip because `dock.dup.1` rules that no dock control claims ⌘\. A pressed-pane tooltip would re-open exactly
   what C2 closed.
Minor: ⌘K "Show Orchestrate" → **Open Orchestrate** (`dock.dup.1`'s search updated, Dock comments too), "Open board" →
**Open Board**.
*Suites (plain tier, all 43 `affected` maps):* green, including `layout` 284/284, `styles` 94/94, `palette` 169/169,
`team` 30/30, `verbs` 30/30, `meta` 51/51. `npm run build` is clean. *Owed to the lead:* the Electron tier. `names.agree.1`,
`dock.dup.1` and `team.segment.1` are still unrun, and `dock.dup.1` now searches "Open Orchestrate". *Goldens expected to
move:* every scene whose crumb shows a fresh layout's name. The harness starts fresh, so "Canvas ▾" becomes "Workspace ▾" wherever the
crumb is in frame. Also the vault/notes scenes' empty or refusal sentences, and `account-menu`'s sign-in tooltip if it's captured.

### M405 — every shell has a name, and teaching text sits under the work (D2, D3)

Worktree `tc-m405-titles`, branch `m405-titles` off `3f9c01be`. Slot 2 (CDP 9220). Screenshots in
`/tmp/tc-daily-loop-shots/`: `D2-before`, `D2-before-navigator`, `D2-before-palette`, `D2-after`, `D2-after-home`,
`D2-after-rename-field`, `D3-before`, `D3-before-overlap`, `D3-after-overlap`, `D3-after-far`.

**D2 (P1), every shell is titled `/bin/zsh`.** *Reproduced:* ⌘N ×3 on an empty canvas: the rim read `/bin/zsh` three
times, the navigator three `/bin/zsh` rows, the palette three `zsh` rows (`D2-before*`). *Cause:* four places walked
the same chain, `title ?? resolved command ?? spec.command ?? 'login shell'` (TerminalPanel's header, `railLabel`,
`panelName`, the inspector heading through `railLabel`), and a login shell's resolved command is the one fact every
default terminal shares. *Fix:* `palette/panel-name.ts`'s `terminalBaseName(spec)` names an untitled terminal by its
SPAWN directory through `displayPath(cwd, cwd)` (the path rule's root-is-its-basename arm), `home` for `~` (main's
`autoName` spelling, for its reason), and a command someone NAMED rides in front as the far card's kicker
(`claude — api`, `FAR_TITLE_SEPARATOR`). `terminalNames(panels)` adds `autoName`'s ordinal where two read alike (`home`,
`home 2`, `home 3`), numbered in ARRAY order. The rim (Canvas passes `defaultTitle` from one `terminalNames` over
`displayPanels`), the navigator (`buildRailRows` computes it over the same list), the palette's Go-to rows
(`useRailModels`, over `panelsRef` in array order before the spatial reorder), the edge indicators and the inspector
heading (given the list) all read the same name. The resolved command and the FULL path moved to the name's tooltip
(`/bin/zsh in /Users/…/api`), never the rim at rest. A persisted, user-given `title` is untouched and wins everywhere;
nothing is written back into `title`, and the layout format does not move.
*Rename in place:* a double-click on the rim name (M397/M402's 16px strip) swaps it for a field in the title's own box
(`.pf__title-input`, carries `.pf__title` so the rim's tab and cap apply), focused with the name selected; Enter or blur
commits, Escape keeps the name, empty is a cancel. Bare keys stay in the field (`fieldKeepsKey`, the draft rule); a ⌘
chord that is not a text edit reaches the canvas. The commit is `renamePanel(id, name)`, extracted from the palette's
`beginRenamePanel` so both doors share one history entry path (verify:verbs: excluded with `beginRenamePanel`, same
reason). Merged view: no rename. *Measured after (`D2-after`):* shells in `~`, `~`, `~`, `/Users/alexnieves`, `/tmp`
and the worktree read `home`, `home 2`, `home 3`, `home 4`, `tmp`, `tc-m405-titles` on the rim and in the navigator;
rename in place → `api server` on both; keys typed into the field did not reach the canvas.
*Decisions:* (1) **cwd + ordinal, not last command** — a last command needs shell integration that a plain shell
may lack and changes on every Enter; a directory is identity. (2) **The spawn cwd, not the live one** — a name that
followed every `cd` would change under the person and reorder a search, and `panelLabel`'s note already declines a
present-tense claim in a label; the live cwd stays the inspector's "now in". (3) **A login shell drops its program**
(`home`, not `zsh — home`): the program is exactly what does not tell shells apart; a named command keeps it. (4) The
ordinal renumbers when an earlier twin closes (Finder's `untitled 2` behaviour); a stable per-panel number would need
a persisted field, which D2 did not justify. `panelLabel` (canvas-constants, the long `command — cwd (id)` form the
inspector and older checks read) is unchanged on purpose.
*Checks:* `verify:rail title.default.1` (three shells in three cwds → three names, no `/`; three in one cwd → `home`,
`home 2`, `home 3` with a titled one keeping its words; `buildRailRows` labels equal `panelName` with the same list's
name). `verify:panels:core title.default.2` (three real command-less shells spawned in three temp directories: three
distinct rim names, each its directory's basename, the full path on the tooltip, the navigator row equal) and
`title.rename.1` (a dblclick on the rim name opens a focused field holding the name; Enter renames; the navigator row
follows). *Checks changed deliberately:* `verify:rail 2/3/4` (the place leads; the resolved/spec command now answer
only for a spec with no cwd; `claude — home` for a named command), `verify:rail 20` (the inspector heading is the place,
`home 2` with the list), `verify:panels:core 31/44/45` (the resolved-command settle is read on the title's TOOLTIP, where
that fact now lives — same assertion, new home).

**D3 (P1), teaching overlays outrank the work.** *Reproduced (`D3-before-overlap`):* the starter laid out, the chat
dragged over the terminal and note examples: both captions painted ON TOP of the chat's body. *Cause:* the starter's
captions are ordinary panel-anchored annotations, painted in `.annotation-layer` (z 5000, above every panel on
purpose — a margin note must be read). *Fix:* `shared/starter.ts`'s `isStarterCaption` recognises a caption by what it
is — a panel-anchored label whose text is a manifest caption — so every canvas laid out since M181 is recognised with
no new persisted mark (cost, recorded: a person who types a caption's exact sentence gets caption behaviour).
`AnnotationLayer` paints two SVGs from one painter: captions in `.annotation-layer--starter` at z 1 (above a group
frame's 0, under every panel), everything else unchanged at 5000. The caption layer fades to `opacity: 0; visibility:
hidden` in the summary/block/cluster tiers (the critique's 16%-larger-than-57% caption), reduced-motion honoured. And
a caption RETIRES (its record removed) when its object is first selected — following the caption is dismissing it, the
launcher tip's rule; there is no other "dismiss the starter" gesture, so this is the closest the product allows
without adding a door. A person's notes never retire. *Measured after:* `D3-after-overlap` (the chat covers both
captions), selecting the image example removed its caption only, at 16% (`D3-after-far`) the caption layer is hidden.
*Found, not fixed (out of scope):* NO annotation label is a hit target anywhere — its box overflows a 1px SVG, so
`elementFromPoint` over any label (caption or note, covered or not) answers the canvas or the panel under it. Measured on
the real app: all four starter captions, alone on the canvas, hit-tested as `canvas`. So a label's click-to-select /
double-click-to-edit (M93) is unreachable by a real pointer. That is why the D3 check measures PIXELS.
*Check:* `verify:panels:product starter.caption.under.1` — seeded: a caption and a person's note on `cu1`, both under
`cu2`'s BODY, and a caption on `cu3` with nothing over it. Each label's rect is captured twice (`capturePage`), as
painted and with its own layer hidden: the covered caption paints NOTHING (and `elementFromPoint` answers `cu2`), the
covered note still paints (z 5000 kept), the open caption paints (the measure sees captions at all); a press on `cu1`'s
chrome retires its caption and keeps the note; at 0.2 the caption layer is `hidden` and the note layer `visible`. The
first cut put the labels under `cu2`'s HEADER and read `paints: true` — the header's glass lets what is under it
through, blurred, by design — so the covering is measured over the body.

**Suites.** Plain (all 44 on the branch's list): green, incl. `verify:rail` 261/261, `styles` 93/93, `meta` 51/51,
`palette` 169/169, `layout` 285/285, `viewport` 193/193, `verbs` 30/30 (after `renamePanel` joined the excluded list).
Electron, each under the lock: `panels:core` 89/89 (66.4 s, 89% of its watchdog at load 21–32 — the two added checks
cost ~3 s; re-pin if it crosses 90% at normal load). The other three were each run on the M405 build AND on
`3f9c01be`'s src (same scripts, rebuilt), alone under the lock, at load 4–8. Every Electron part ran at 90–100% of its
watchdog on BOTH builds today, so the baseline was measured, not assumed:
- `panels:product` 132/137 (229.8 s). The reds were `codex.1`, `tool.3`, `editor.1d`, `workflow.run.1` and headroom.
  **All red on the baseline run too** (which also had `workflow.wire.1`, `wfx.ui.1` and a watchdog). On the baseline,
  `starter.caption.under.1` is RED: the covered caption paints, nothing retires, and there's no caption layer at the
  far tier. So the check discriminates. `starter.1` is green.
- `panels:kinds` 46/53: `link-draw.1–.6` and headroom. **The same 46/53 on the baseline** (the seeded m24 terminals are
  not in the DOM after the reload; unattributed, not M405's).
- `panels:shell`: `106` (the inspector's Open review mints nothing; **red on the baseline**), `126`/`127` (link
  gesture; **red on the baseline**), and a watchdog at 96 s (baseline 95.9 s, 100%). `117` (project prompts from the
  live cwd) was red in 2 of 7 M405 runs and 0 of 3 baseline runs. It's unattributed: nothing M405 changed is on its
  path (a slot click, the live-cwd field, the palette's prompt rows), and I haven't called it a flake.
  **`107` was M405's to fix, in the fixture.** It was red in 4 of 4 runs on the M405 build. The seeded review `r92`
  never reached main's store: it was absent from `workspace.list` for 30 s after the reload. A renderer layout save
  that was still in flight landed after `layoutStore.save(seed)` and overwrote the seed, so the check minted the `r92`
  it forbids. Instrumenting the sequence (a few store reads) made it pass. *Check changed deliberately:* `107` now
  `settle()`s and flushes before writing the seed, and it is green since.
- `npm run affected`: not run as a whole. Its list is the branch against main (every suite), and every suite on it
  was run as above.
*Goldens expected to move:* every scene with an untitled live or carded terminal (`/bin/zsh` → its directory):
`kinds`, `kinds-dark`, `header`, `trail`, `attention`, `palette*`, `flip`, `overview`, `group*`, `merged`,
`zoomed-out*`, `compact`, `wide`, `navigator-files`, `focus*`; `starter` (captions under panels, and hidden if shot
in a far tier); any `zoomed-out*` scene that shows starter captions.
*Owed / for the lead:* a real-Mac pass of rename in place with a trackpad double-click; the annotation hit-test
defect above (a new finding, not D3); the ledger's line 713 holds a stray merge marker (`||||||| f5e642c9`) from an
earlier merge, left untouched.

### M407 — labels take a click, one name per terminal on every surface, captions retire only when followed (M405 critic)

Main checkout on `m397-daily-loop` off `72ab3ebc`, slot 1 (CDP 9210). The fix batch from a fresh critic of M405 (items 1,
2, 3, 5 and the minors). **Item 4 (rename double-click vs drag) is not here**: it moved to D1's milestone, which
follows this one. Screenshots in `/tmp/tc-daily-loop-shots/`: `M93-before`, `M93-after`, `D2b-after`, `D3b-before`,
`D3b-after`.

**1. No annotation label is a click target (M93, older than M405).** *Reproduced* on the real app, starter laid out:
all four caption labels hit-tested `canvas` at their centres, and a real CDP click on one selected nothing
(`M93-before`). *Cause:* `.annotation__host` is a `foreignObject` of 1×1 with its label overflowing it. Chromium
paints a foreignObject's overflow but never hit-tests it, so M93's click-to-select and double-click-to-edit were
unreachable by a real pointer on every label, a person's own notes included. *Fix (styles.css):* the host gets a
real box per tier (340×40 near, 1120×80 summary, 2420×140 block: the widest label plus its outline, at the tier's
font). The host stays `pointer-events: none`, so the empty part of the box takes nothing. *Measured after:* all
visible labels hit-test as the label, a real click selects (`M93-after`), and a real double-click opens the editor.
The covered-caption arm of `starter.caption.under.1` still answers `cu2`, because the starter layer is under the
panels, so the box does not reach through a panel. *Check:* `verify:panels:product annotation.click.1`: real
`sendInputEvent` clicks at a caption's and a note's centre hit the label and select it, and a real double-click
opens the note's editor.

**2. The ordinal reached only some surfaces.** *Cause:* the name with its ordinal needs the whole list, and about
twenty labels hold one panel and call `railLabel(p, undefined)` (hand-off header, activity feed, Orchestrate's
titles, the link banner, runs' skip notes, the Watch tile, the prompt `{{panel}}` built-in). They said `home` where
the rim said `home 2`. The palette's Go-to rows also computed their own `terminalNames` over `panelsRef`, and the
inspector computed its own over `panels`. *Fix:* Canvas computes `terminalNames` ONCE (over `displayPanels`, the list
the rim shows) and hands the map to `buildRailRows` (a new optional `names` parameter that defaults to naming its own
list) and to `useRailModels`'s Go-to rows (`deps.terminalNameOf`). It also PUBLISHES the map (`publishTerminalNames`).
`railLabel` and `panelName` read the published name when no name is handed in, and a handed-in name still wins. The
inspector heading prefers the published name. *Decision:* one module-level book, not a `nameOf` threaded through ~10
hooks' signatures. A renderer holds one canvas, every present and future single-panel caller is covered without
anyone remembering to pass it, and in plain node nothing publishes, so the answer is M405's (the place alone). The
cost, recorded: a caller rendered before Canvas's first render reads the unnumbered place for that one render.
*Check:* `verify:rail names.everywhere.1` (railLabel/panelName with no list read the published `home 2`; a
handed-in name wins; unpublished it is `home`).
*Minor, same cause:* in the merged view the rim numbered `displayPanels` while the palette numbered `panelsRef`. Now
both read the one map.

**3. Same basename, different folders, read as twins, and closing one renumbered the rest.** *Fix
(`terminalNames`):* when two untitled terminals share a base name but not a folder, the PLACE is lengthened by parent
segments until the folders read apart (`a/api`, `b/api`; `x/one/api` against `y/one/api`). A named command stays in
front (`claude — a/api`), and a bare `~` tail is still `home`. An ordinal is only for the SAME folder, and it is
session-stable: `SESSION_ORDINALS` maps name+panel id → number. A panel keeps its number and a new panel takes the
lowest free one, so closing `home` leaves `home 2` as it is, and the next shell there is `home` again. The key
includes the name, so a panel read in two lists (a workspace and the merged view) keeps each list's number instead
of the two flipping each other's. No layout-format change: nothing is persisted, and a relaunch numbers afresh in
array order. *Measured after (`D2b-after`):* shells in `/tmp/m407/a/api`, `/tmp/m407/b/api` and three in `~` read
`a/api`, `b/api`, `home`, `home 2`, `home 3` on the rim and in the navigator. No D2b-before was taken. M405's own
ledger records the `api`, `api 2` reading, and the stable-ordinal arm was not driven live: the canvas close control
was not reachable by the driver at the card tier. It is pinned in plain node. *Check:* `verify:rail
names.parent.1` (parents, deeper collision, the kicker kept, `home`/`home 2`/`home 3` → close `home` → `home 2`,
`home 3` → a new one → `home`).

**5. Captions retired on any selection, and not undoably.** *Cause:* M405's retirement was an effect on
`selectedIds`. A marquee that swept an example up retired its caption, and so did a selection restored by a
workspace switch. The panel history holds panels only, so ⌘Z could not bring a caption back. *Fix (Canvas.tsx):* the
effect is gone. `retireCaptionsOf(id)` runs from `selectAndRaise`'s single, non-additive path: a press on the object,
or Go to it. It does not run on the group-drag press on a member of a multi-selection, and it does not run for a
marquee, an additive shift-press or a restored selection. The retirement is its own undo entry (`captionUndoRef`),
pinned to the history's `present` as it stood right after the press (the same press may raise, which is one push).
⌘Z restores the captions while that is still the present, meaning while the retirement is the newest thing. Once a
later edit moves the panels, ⌘Z walks them back first and the caption returns on the press after. ⌘⇧Z re-retires,
and a new `commitHistory` drops the caption redo as it drops the panels' future. *Measured after:* a real press on
the note example retired its caption and no other (`D3b-before` → `D3b-after`). Undo could not be driven live: the
driver's keys do not reach the menu accelerator, and the window could not be made frontmost for System Events. It is
covered by the check. *Check:* `verify:panels:product starter.caption.retire.2`: a real marquee over two captioned
examples selects both and retires nothing, a ground press clears the selection, a real press on one header retires
its caption only, `edit:undo` brings it back, and `edit:redo` retires it again. `starter.caption.under.1`'s
dispatched chrome press still retires (it reaches `selectAndRaise`).

**Minor: a titled terminal lost its full-path tooltip.** The rim's tooltip is now `<title> — <command> in <path>` for
a titled terminal. The title still leads it whole (M106's rule), and an untitled one keeps `<command> in <path>`.
*Check changed deliberately:* `verify:panels:product header.1` accepted only a title attribute that ENDED at the
title. It now asserts that the attribute starts with the full title text, followed by an optional `— …`.
*Ledger note (the critic's):* the canvas PNG export now shows folder basenames in terminal titles, which is
within the PNG's no-gate decision (pixels, not text).

**Found, not fixed (out of scope):** in the real app, a click on the HUD's `Zoom in` sometimes SELECTS a panel
(traced: `""` → `im5` after the second press, and `wf4` on another run). A selection that arrives this way goes
through the canvas's hit-test → `onSelectPanel`, which is a direct selection by this milestone's rule, so it
retires that object's caption. That is how two captions vanished during driving. It is pre-existing: M405's effect
retired on it too. It is not diagnosed here. Candidates are a press/release pair split by the HUD re-laying out
between them, or a background hit-test on the release.

**Suites.** Plain: `rail` 264/264, `meta` 51/51 (after the watchdog comment kept its `// measured` form), `styles`
94/94, `palette` 172/172, `layout` 286/286, `viewport` 197/197, `verbs` 30/30, `ipc` 1/1. Electron, each alone under
the lock, at load avg 20–340:
- `panels:product` 147/149. `names.agree.1` is red: the dock-pane palette read, M406's unattributed red with its harness fix in
  the triage patch. `headroom.1` went red at 208.7 s of 230 s (91%), so **`WATCHDOG_MS` was re-pinned to 285000**
  (~1.35×). The first run's `header.1` red was this milestone's (the tooltip) and was fixed as recorded above.
- `panels:core` 86/90. `7`, `51`, `place.still.1` and `headroom.1` are the M406 placement-probe reds (window centre
  against host centre, fixed in the triage patch). None of them is on this milestone's path. `title.default.2` and
  `title.rename.1` are green.
- `panels:kinds` 54/54, green (M405 recorded 46/53 on both builds).
- `panels:shell` 101/105. `95`, `95b`, `95c` and `96` are red: the Workspaces pane's rail rows, `clickRail` matched
  nothing. **They are red identically on `72ab3ebc`'s build in a scratch worktree**, so they are baseline and not
  M407's. `106`, `117`, `126` and `127` were green in both runs.
- The two new checks were not run against the baseline build. The M405 ledger measured labels answering `canvas`,
  so `annotation.click.1` would read `hit: canvas`, and M405's effect retires on the marquee.
*Goldens expected to move:* any scene with a titled terminal changes only its tooltip, which a PNG does not show. A
scene with two untitled shells whose folders share a basename would now read by parent. None of the fixture scenes
is known to have one, so no scene is expected to move. The label host change is invisible (the host box paints
nothing).

### M408 — grab and resize, and one right-click menu from the shared verb lists (D1)

Main checkout on `m397-daily-loop` off `268c877c`, slot 1 (CDP 9210, window 1200×800). Planner map:
`scratchpad/plans/D1.md` (line numbers re-checked after M407). Screenshots in `/tmp/tc-daily-loop-shots/`:
`D1-start`, `D1-before`, `D1-before-strip-drag`, `D1-after-strip-drag`, `D1-after-grips`, `D1-after-ctx-terminal`,
`D1-after-ctx-canvas`. One commit (the drag handle, slop and grips did not need landing apart from the menu: the
menu's checks share the core block).

**D1 (P1), grab and resize.** *Reproduced:* a live terminal `home` at 59%. `elementFromPoint` at the strip's empty
part (right of the name) answered `canvas`; a real drag from there moved nothing and swept a marquee that selected
the panel (`D1-before-strip-drag`). No grip painted on a selected panel; the east and south link ports sat centred ON
the 8px resize bands (z 4 over 2). `grep onContextMenu src/renderer` found nothing.
*Causes and fixes:*
1. *The strip.* Since M397's follow-up the name strip is ABOVE the frame (`bottom: 100%`) and covers no cell, but it
   kept the chromeless rule's `pointer-events: none`, so only the name and state word took a press. Now
   `.pf--kind-terminal:has(.panel__slot) .pf__chrome { pointer-events: auto; cursor: grab }`; its children keep the
   old rule, so a hidden control is still inert and a press where it sits lands on the strip and drags. *Cost,
   recorded:* the 16px band no longer starts a marquee, and where a neighbour sits closer above than the band (the
   M402 rim note: between the near floor and 67%), the band takes presses over that neighbour's foot.
2. *Controls and buttons.* `beginMove` (PanelFrame) read no `button` and every control's `shellControl` only prevents
   default, so a press on ⋯ / fill / the trail bubbled into a move, and a right- or ⌃-press dragged. Now a press
   whose target is inside `button, input, a, [role=menu]`, or that is not a plain primary press, still SELECTS (the
   context menu is about what was pressed, Finder's rule) but begins no gesture. The resize grips take the same
   button rule. (The load-bearing entry "no panel chrome handler checks `event.button`" is now false of the chrome
   and the grips; the capture-phase middle-drag claim it justifies is unchanged and still needed for every other
   kind's own handlers.)
3. *The slop.* `usePanelDrag` gains `DRAG_SLOP_PX = 3` (screen px, measured as world distance × scale from the
   press's world origin). It only DELAYS the first frame: `originWorld` and `originRect` are never rebased, so the
   frame that crosses computes from the origin (`applyDrag`'s rule) and the panel jumps to the cursor instead of
   lagging it. And a gesture that never crossed commits NOTHING: `onCommit` used to push a history entry for every
   click on a chrome (⌘Z spent undoing a click), two per rename double-click. The raise a press makes still commits
   itself in `selectAndRaise`.
4. *The grips.* A `::after` mark inside each `.panel__resize` (a 2×24 bar mid-east and mid-south, an L in the
   corner, `--line-strong`), so it rides the handle's counter-scale and sits exactly where the press lands. Opacity 0
   at rest, 1 on `.panel--selected` or the handle's own `:hover` (no fraction, styles 3). A terminal still has no n
   grip (the strip is its move handle); no w/sw grips were added (ResizeEdge supports them, the frame never rendered
   them — not this finding).
5. *The ports.* East and south now stand `calc(var(--sp-4) * var(--chrome-scale, 1) + var(--sp-1))` inside the edge:
   the band's width times the same counter-scale the band wears, plus a hairline, so at every zoom the band is the
   edge and the dot is past it. North and west have no band and stay flush. Still inside the frame (the overflow
   clip), still hover/linking-only. **`link-draw.1–6` read the live port box and stayed green unchanged** (kinds
   54/54).
*Measured after:* a real drag from the strip's empty part moved the panel exactly (+40, +30)
(`D1-after-strip-drag`); the grips show on selection (`D1-after-grips`); at the east edge's middle
`elementFromPoint` answers `.panel__resize--e` and the port's right edge (619) is left of the band's left (628).

**Carried: rename double-click vs drag (the M405 critic's item 4).** The name span does not stop mousedown, so both
presses of a double-click reach `beginMove`. The slop makes each a click (no move, and now no history).
`title.rename.1` now brings its panel into view by its navigator row, presses once (the selecting press may RAISE,
which is its own entry), then double-clicks by `sendInputEvent` (clickCount 1, then 2): the field opens, and the
panel's rect and the history depth (a new read-only `window.__m408HistoryDepth`) are unchanged.

**Carried: HUD Zoom in selects a panel (`im5`, `wf4`).** *Reproduced:* nothing selected, one real click on Zoom in
→ `c1` (the chat under the HUD) selected; over the ground it deselected instead. *Cause:* `shellControl` deliberately
does not stop propagation (the palette's outside-click), so the HUD button's mousedown bubbled to the canvas host's
`onMouseDown`, which hit-tests the WORLD point under the button and selects whatever lies there (or deselects and
starts a marquee). The capture slot already stood down for the screen controls; its bubble half never did. *Fix
(useCanvasPointer):* one `SCREEN_CONTROLS` list (`.command-pill, .new-object-row, .canvas-hud, .minimap,
[data-annotate-strip], [data-context-for]`) read by both handlers. A secondary press on the ground now starts no
marquee/stroke/label either (it selects the card it lands on). This was also the mechanism behind M407's "two
captions vanished while driving". *Measured after:* six real Zoom in/out clicks, selection `none` throughout.

**The context menu.** *Decision — one list per family, not one list for everything:* the ⋯ menu and the pill offer
different things (one object's frame verbs; a selection's arranging verbs), so `canvas/object-verbs.ts` (pure)
holds `panelVerbs(facts)` — the ⋯ menu's task section, advanced doors, Fill view / Restore size and the palette's
door, each carrying the DOM attribute the suites already select on — and `selectionVerbs(facts)`, the pill's
priority-ordered action row moved verbatim out of `CommandPill`. The ⋯ menu (PanelFrame) and the pill now RENDER
from them (markup, attributes and copy unchanged), and the right-click menu renders the same lists, so none of the
three can drift. Panel rows run through `runPanelVerb` against the one `PanelMarks` (whose task verbs are the
palette's actions); selection rows through `runSelectionVerb` against `PaletteActions`, the executor.
*Surface:* `CanvasContextMenu` through the Menu primitive (Radix; `modal={false}`, no Portal, `INERT_PLACEMENT`),
in SCREEN space as a sibling of `.world`, a zero-size trigger at the press point, `data-context-for` (a panel id or
`canvas`), flipped to the press's other side at the canvas's right/bottom edge, the ⋯ menu's opaque `--s-3` ground
(the View menu's glass let the panel's text read through its rows — looked at), `--e-3` (`verify:styles shadow.1`'s
overlay list gained it). The primitive gained `pointerOpen`: a right-click is a pointer open that never touched the
trigger, so without it the menu took focus out of xterm on open and handed it to the invisible anchor on close. The
pill and the HUD step out while it is open (the M395 yield rule, extended — the menu is not inside `.world`).
*Rows:* a panel → select it, then for a terminal Copy (disabled with its reason when nothing is selected) and Paste
(Terminal.app/iTerm2/Ghostty lead with these), then exactly `panelVerbs`, then the pill's Close as "Close panel"; a
panel inside a multi-selection → the pill's selection verbs (less Fit) for all; the ground → Paste, New object…
(the HUD Create's sheet), Fit. One `contextmenu` listener on the host, BUBBLE phase, so xterm's right-click word
selection has run and Copy can see it; editables, Monaco and `[data-edit-owner]` keep their own right-click (xterm's
helper textarea excepted — xterm parks it under the pointer, so the next right-click targets it). A program with
mouse reporting on (`.xterm.enable-mouse-events`: tmux, vim) keeps the plain right-click; ⌥-right-click opens the
menu (iTerm2's rule). *Paste is `paste()`, never `write()`:* `useCanvasClipboard`'s two handlers were lifted into
named `copy`/`paste` functions that the accelerator subscriptions AND the menu call (`editRef`); the menu reads the
clipboard's text with `navigator.clipboard.readText()` (main hands the accelerator its text; nothing else read it in
the renderer), and an empty read falls into the same no-text arm (a picture on the clipboard still lands).
*Skipped, with reasons:* "New ▸ <kind> here" at the press point — every create door's placement is B4's one rule,
and an `at` needs `createObject`'s signature in `palette/commands.ts`, which the parallel M409 builder owns; the
ground menu offers New object… (the Create sheet) instead. No `@radix-ui/react-context-menu` was added (only the
dropdown is installed; the primitive door covers it). Groups, annotations and flowchart shapes get the ground's or
the panel's menu by whatever `[data-panel-id]` they sit in; no per-kind menus.
*Observed, not this milestone's:* a menu Paste into the live login shell showed a literal `[200~…~` — xterm's
`paste()` brackets when the shell asked for bracketed paste. It is the ⌘V route (`handle.paste`) exactly; a real-Mac
comparison with ⌘V on the same shell is owed.

**Checks added** (all `verify:panels:core`, real `sendInputEvent` input, one live terminal at 100%):
`grab.strip.1` (the strip's empty part hit-tests as the chrome and a drag moves the panel 1:1 — red before: the
point answered `canvas`), `grab.slop.1` (a 2px wobble moves nothing and adds no history), `grab.button.1` (a drag
from ⋯ and a right-press drag from the name leave the panel), `grip.1` (grip opacity 0/0/0 at rest, 1/1/1 selected;
east/south edge middles answer the resize bands; the east port clear of its band), `hud.pass.1` (Zoom in / Zoom out
by real click never change the selection), `ctx.panel.1` (Copy, Paste, then exactly the ⋯ menu's row labels, then
Close; the keyboard stays in xterm; Escape closes), `ctx.paste.1` (the menu's Paste lands the clipboard's text in
that terminal), `ctx.term.1` (mouse mode: plain right-click opens nothing, ⌥-right-click opens it), `ctx.canvas.1`
(Paste, New object…, Fit; pill and HUD hidden while open).
*Checks changed deliberately:* `title.rename.1` (real double-click, rect and history asserted — above);
`chromeless.paint.1` (the rest arm asserted the point under a hidden ⋯ is not in the CHROME; the strip is now the
move handle, so it asserts the point is not the ⋯ BUTTON — the contract, "an unseen control eats nothing", is
unchanged); `verify:panels:product revamp.snap.2` (its 1px nudge is now a click under the slop; a 4px drag, still
inside the 8px threshold, provokes the same snap to 500); `verify:styles shadow.1` (the overlay list).
*Fixtures settled deliberately:* `panels:agents attention.1` and `panels:product`'s `work.action.1` seed now wait for
the camera to stop before seeding and reloading — keyboard.1's existing rule. Both follow a check that ends on a
camera flight (search.1's Enter, board.1's row click), and on this build the reload's `did-finish-load` went missing
mid-flight (agents: 3 of 4 runs, always at attention.1; product: 2 of 4, always at that reload; the baseline build
hung once in 4 agents runs, elsewhere). The cause is not established beyond that timing; with the settle, agents
2/2 and product 3/3 ran through.
*Watchdog:* `panels:core` re-pinned 75000 → 105000 (alone under the lock: 83.7, 82.1, 79.8 s; the baseline at
`268c877c` already ran 70.5 s of 75 s, `headroom.1` red).

**Suites** (Electron each alone under the lock; baseline = `268c877c` built in a scratch worktree, since removed):
- `panels:core` 96/99: `7`, `51`, `place.still.1` — **red identically on the baseline** (the M406 placement-probe
  reds); every M408 check green, `headroom.1` 73–75%.
- `panels:product` 148/149: `names.agree.1` — **red identically on the baseline** (M406's). 207.8 s of 285 s.
- `panels:agents` 85/86: `template.1` — the recorded baseline red.
- `panels:shell` 101/105: `95`, `95b`, `95c`, `96` — **red identically on the baseline**.
- `panels:kinds` 54/54, `panels:flowchart` 16/16, `panels:orchestrate` 37/37, `canvas` 7/7, `xterm` 11/11.
- Plain: `styles` (after shadow.1's list), `primitives`, `pill`, `verbs`, `meta` (after the watchdog comment kept its
  `// measured` form), `palette`, `viewport`, `rail` — all green. `npm run affected` lists the whole branch against
  main (every suite); the suites above are the ones this change reaches.
- Process note: my first `npm run build` (for reproduction) ran while `/tmp/tc-electron-lock` was held by the M409
  builder's suite in `/tmp/tc-m409-base` — a different checkout and `out/`, so nothing of theirs was rebuilt; every
  later build and Electron run here took the lock first.
*Goldens expected to move:* any scene with a SELECTED panel (grips now paint: `header`, `kinds*` if a selection is
shot, `focus*`, `trail`, `attention`, `group*`) and any scene that shows link ports on hover (east/south dots moved
inward). No scene opens the context menu.
*Owed / for the lead:* a real-Mac pass of the trackpad right-click (two-finger) and ⌃-click, ⌥-right-click in tmux,
and the menu Paste vs ⌘V on the same shell; the load-bearing entry on middle-drag still says "no panel chrome
handler checks `event.button`" — true of the other kinds' handlers, no longer of PanelFrame's; left for the lead to
reword or not.

### M409 — ⌘K rests on what can run, ranks what the words name, and has Undo (C5)

**C5 (P1), ⌘K is the real map, and it was bloated.** *Reproduced* on the real app, slot 2, a fresh profile
(`rm -rf /tmp/tcc-2`), ⌘K from the top bar, counted in the DOM (`.palette__row`): **184 rows at rest, 83 refused**; the
seat on row 19 (`workflow.open.builtin-review-repo`) with the list at `scrollTop` 223.5 and its first visible row cut in
half under the sticky PANELS header (`C5-rest-before`). "add a" → **174 rows** (52 refused), selecting "Add a sticky
note" 28th (`C5-adda-before`); "undo" → **123 rows** and no Undo row, selecting `setting.agents.budgetWindowPercent`
("Stop at this % of the usage window") 79th (`C5-undo-before`). *After*, same fresh profile and build: **98 rows at
rest, 7 refused**, the seat 3rd, `scrollTop` 0 (`C5-rest-after`); "add a" → **28 rows**, "Add a sticky note" selected,
`scrollTop` 0 (`C5-adda-after`); "undo" → **12 rows**, and after one ⌘N the Undo row is selected — Enter removed the
shell, "redo" + Enter put it back (`C5-undo-after`; with nothing to undo it reads "nothing to undo", `C5-undo-after-nothing`).
"deck edit" + Enter opens the verb line prefilled `deck-edit ` with its grammar under the field (`C5-verbline-after`).

*Causes, and fixes, by the finding's five parts.*
1. **Dead rows at rest.** Every refused row was shown at rest by design (M74/M92/M185: "a row that disappears is
   indistinguishable from a feature that was never built"). *Fix:* `commands/with-reason.ts`'s `hiddenAtRestIf(missing)`,
   spread into each row literal **row by row**, the argument naming the missing SUBJECT: no captured panel
   (open-as-chat, replay, open-in-terminal, the lock/pin/maximise pairs, link, toolbox, both reviews, export-text,
   prompt rows, auto ×5), no selection of the right kind (workflow ×10 + node.test, align ×6, distribute ×2, layout ×2,
   duplicate, shape ×2, flowchart.plan, note.tint, publish ×3, deck.export-pptx, agent.cap, review.comment, work.review,
   task ×4, image.replace, group-selection, broadcast), no group, no folder (memory, watcher, the folder-bound
   `object.create.*`), no CLI (chat.sandbox rows, a preset not on the PATH — an UNREAD pack preset stays, its fix is
   beside it), nothing to act on (tidy under two panels, camera back/forward, the active workspace's switch row,
   Undo/Redo with an empty stack). `filterCommands` is untouched. *Decision:* the rule is "no subject", never "any
   reason" — a row refused for a STATE of a subject that exists stays at rest with its reason ("already locked",
   "not started"), which is M92's teaching and what `verify:panels:product` lock.1 reads (`rowState('panel.unlock')`
   at rest with focus). *Kept visible, refused, on purpose:* Rename (check 31) and Restart beside it, New note… (85/86),
   New chat… (the :2182 check), GitHub/Jira (M88/M89), Manage prompts/worktrees (49), Environment….
2. **CLI grammar as copy.** Nine rows' subtitles WERE the grammar (`deck-edit <panel> <slide> <markdown>`), and
   seven more said "type cap-agent <panel> …". *Fix:* the nine grammar rows are `hiddenAtRest: true` with plain
   subtitles; every verb-line row now calls `beginRunVerb('<verb>')`, which opens the line PREFILLED with the verb and
   shows `<verb> <args> — <hint>` from `VERBS` on a new standing line under the field (`InputMode.hint`,
   `.palette__line-hint`; not the placeholder — the field starts non-empty). The workflow rows' `<key> <dx> <dy>`
   subtitles became words. Every literal `id: '…'` is kept (`closure.v9.1` reads the file as text); `Run a verb…`
   stays at rest (verbs.1).
3. **Near-duplicates.** `New Note` (instant, named by the time) vs `New note…` (asks the name): `object.create.note`
   rests in search, both carry a subtitle saying how they differ. `New Terminal` vs `Login shell` (⌘N) vs `New
   panel…`: three different verbs, so nothing is merged — `object.create.terminal` rests in search with "a shell in the
   selected panel's folder, else home". `Zoom to fit` vs `Fit task` vs the HUD's `Fit all`: `canvas.zoom-fit` is now
   titled for what it frames in the HUD's words — **Fit all**, or **Fit selection** with one — "zoom to fit" still
   finds it (searchText). `Fit task` is a different verb (the task, and it lights the lens) and keeps its name.
   *Doors:* `verify:verbs` 30/30, `closure.v9.1` green — every verb keeps its palette row.
4. **Undo/Redo rows.** `Canvas.tsx`'s edit:undo/redo step is lifted into `undoCanvas`/`redoCanvas` (`useCallback`s
   over `applyHistory`); the IPC path keeps `shouldIgnoreKeys` and `serveDraftEdit` in front of it (panels 37/123),
   the palette rows call it bare (the palette is closing). `canvas.undo`/`canvas.redo` carry ⌘Z/⌘⇧Z chips, refuse
   "nothing to undo/redo" from two booleans Canvas passes (`canUndo`/`canRedo`, read off the history state for that
   only — the history comment says why nothing may undo against a render's snapshot). Both actions join
   `EXCLUDED_ACTIONS` with a reason (a plan never rewinds a person's history) — `closure.1` green.
5. **Ranking.** `fuzzyMatch` skips spaces, so "add a" was "adda", a subsequence of nearly every long searchText.
   *Fix:* `fuzzy.ts`'s `wordStarts` (each term, in order, starts a word) and `initialsStart` ("np" → New panel);
   `matchCommand` adds a tier — title word-starts +150, title initials +100, haystack word-starts +80 — and a row with
   no tier and no lead is WEAK; `filterCommands` keeps at most `WEAK_CAP` = 5 weak rows (the best-scoring), at the top
   level only (inside a scope the query is a term). Section-first sorting is unchanged (load-bearing-recovered 404).
   `LEAD_BONUS` 200 → 400 so the tier cannot let a rival catch a lead ("Preview: start the dev server" for "start").
6. **The half-clipped top row.** `Palette.tsx`'s scroll effect ran `scrollIntoView({ block: 'nearest' })` on the
   seat too, parking a seat below the first screen at the bottom edge. *Fix:* a RE-SEAT (open, query, scope) leaves the
   list at 0 when the seat is on the first screen, else brings the row to the top (`block: 'start'`, under its header
   by the existing scroll-margin); arrow steps keep 'nearest'.

*Checks added:* `verify:palette` `palette.rest.1` (fresh profile ≤100 rows, ≤12 refused and each one a kept decision,
first runnable ≤ 8th; with focus and a selection the rows come back), `palette.rest.2` (all 99 rows hidden at rest are
found by their own title with the same reason), `palette.verbs.2` (no `<arg>` in any subtitle with every subject
present; the nine rest in search; deck.edit → `beginRunVerb('deck-edit')`), `palette.dup.1`, `palette.undo.1`,
`palette.rank.1` ("add a" ≤ 40, selects "Add a…"), `palette.rank.2` (the cap on 20 synthetic scatter rows; none in a
scope). `verify:panels:core` `palette.scroll.1` MEASURES: at rest the seat is fully visible and a first-screen seat
leaves `scrollTop` 0; for the first query whose seat is past the first screen, no row straddles the sticky header's
lower edge. *Checks changed deliberately:* `verify:palette` 48 (the two new chips), `zoom.fit.1` (Fit all / Fit
selection, found by "zoom to fit"); `verify:panels:core` fit.1 runs the row by its new title "Fit selection".
`task.rank.1` green unchanged. **`palette.scroll.1` discriminates:** run on 72ab3ebc's build (a scratch worktree, the
check copied in) it is RED — the "manage" seat sat 334 px down, at the bottom edge — and green here (the "credential"
seat is in the list's last screen, which the check allows: a row there cannot rise past the end).

*Suites.* Plain: all 44 on the branch's list green (`palette` 179/179, `verbs` 30/30, `styles` 94/94, `meta` 51/51);
`verify:relay` went red 3 times once under a 6-wide parallel run and was 56/56 alone — untouched by M409. Electron, each
alone under the lock (`TC_VERIFY_SUFFIX=m409`), each red compared against the SAME part on 72ab3ebc's build run the same
way: `panels:core` 88/91 — `7`, `51`, `place.still.1` (⌘N placement), all three **red on the baseline too**; headroom
went to 94% once with `palette.scroll.1` added under another builder's load, so `WATCHDOG_MS` is re-pinned 75 → 85 s
(green after). `panels:product` 143/147 — `codex.1`, `editor.1d`, `workflow.run.1`, headroom 97% — **all red on the
baseline** (which also had `names.agree.1`); lockpin.1 (the at-rest `rowState('panel.unlock')` read) and annot.1 green.
A first product run also had `review.fit.1`, `work.action.1`, `review.task.2` red with the D07 cards absent from the DOM
after the reload (`final d07A="no-panel"`) and then the watchdog; all three were green on the re-run and on the
baseline — the seeding miss the M405 section records for `panels:kinds`, not the palette. `panels:agents` 83/86 —
`attention.1` (`seededJ:false`), `template.1`, headroom 100% — **all red on the baseline** (which also hit its
watchdog). `panels:shell` 99/105 — `95`, `95b`, `95c`, `96` (rail workspace rows), `106`, headroom 95% — **identical
on the baseline**.
*Goldens expected to move:* `palette`, `palette-dark`, `palette-query` (fewer rows at rest, a different seat, `Fit
all` for `Zoom to fit`, the Undo/Redo rows); nothing else renders the palette.
*For the lead:* whether `New Terminal` should rest in search (it did not merge — three verbs, three rows); the swarm
rows' "a Explore" copy.

*Not done, and why:* `New task as a Explore swarm…` ("a Explore") and the four swarm/four recipe/five preview rows at
rest are grammar and density outside C5's list; left. `panel.goto.*` rows are untouched.

#### M409 follow-up (critic)

1. **No focus is not no subject.** The lock/pin/maximise pairs, Link, Toolbox, Open review, Review every
   worktree and Export panel output hid at rest on `capturedId === null` — with panels on the canvas and none
   clicked into, the verb vanished though its subject was one click away. *Fix:* `hiddenAtRestIf(ctx.panels.length
   === 0)`; the reasons are unchanged ("click into a panel first"). `with-reason.ts`'s comment records the rule.
   *Check:* `palette.rest.3` (two panels, no focus: the six rows rest, Open review with `REASON_NO_FOCUS`; an empty
   canvas drops them). Open-as-chat, Replay and Open in terminal keep the capturedId gate: their subject is a KIND
   (a claude terminal, a chat) that `PanelRow` cannot promise from "some panel exists".
2. **Undo vs the draft owner.** Titles are "Undo canvas change" / "Redo canvas change" (ids kept). The rows call
   `undoCanvas` bare, while the menu's ⌘Z goes to a focused draft first (`serveDraftEdit`) and stands down behind
   a covering view (`shouldIgnoreKeys`). *Fix:* `usePalette` captures `capturedDraft` at OPEN from a `draftHeld`
   callback Canvas passes (`focusedDraft() !== null` — the same DOM rule `serveDraftEdit` uses, so Monaco, the rich
   note, checklist/sheet editors and every plain field count); Canvas passes `canvasCovered` from
   `canvasCoveredRef`. Either refuses both rows by name ("the editor has its own ⌘Z — this would rewind the canvas
   behind it" / "the canvas is covered — go back to it to undo there"). *Check:* `palette.undo.2`.
3. **The weak cap.** `isWeakMatch` now exempts any row whose TITLE holds the query as a subsequence — the letters
   light in the row, so it is an abbreviation typed on purpose; only scatter across hidden searchText/subtitle is
   capped. "add a" 28 → 33 rows, "undo" still ≤ 15. *Check:* `palette.rank.3` ("rnme" finds Rename, "gh" finds Open
   GitHub work, twenty title-scatter rows all stay; RED with the exemption removed — kept 5). `palette.rank.2`'s
   synthetic rows moved their scatter into searchText (they had it in the title, which is now exempt).

*Minor.* **Install hint:** one Ask-a-question row per missing ENGINE (by binary; acp rides copilot) stays at rest
refused with its `noCli` install sentence; `palette.rest.1` allows those and requires one per binary (fresh
profile: 12 refused, at the bound). **Fit all:** the title says Fit selection only when the selection holds a panel
(`zoomTarget`'s arm), and the row rests in search on an empty canvas, where it resets and Reset zoom is the row
(`zoom.fit.1` adds the stale-selection case). **closure.v9.1:** its comment says why reading ids as text stays
honest with rows hidden at rest — `palette.rest.2` proves every hidden row is found by its title. *Skipped:*
deck/sheet grammar rows keep `hiddenAtRest: true` — `PanelRow` has no deck/sheet/checklist fact (all are `file`),
and these verbs name their panel on the line, not the selection. The template seat: with a template the first
runnable row at rest is `template.new.*`; the only other runnable panel-section row is "Which agents can…", a
scope door and no better a seat, so the order is left.
