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
