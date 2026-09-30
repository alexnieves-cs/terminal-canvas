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
