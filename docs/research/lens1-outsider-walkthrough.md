# Lens 1 — Outsider cognitive walkthrough

**Persona.** Staff engineer, ~40-person startup, macOS. Already runs `claude` in tmux
with git worktrees; Cursor open in another window. Technically fluent, impatient.
Downloaded this because someone posted it. ~20 minutes of goodwill.

**Task I came to do.** *"Work two unrelated bugs in my repo in parallel, and review both
diffs before I commit either."*

**Read constraint I operated under.** I read only `README.md`, `package.json`,
`out/shots/manifest.json`, and 20 of the PNGs in `out/shots/`. I did **not** open
`CLAUDE.md`, `docs/load-bearing*.md`, `docs/superpowers/**`, `docs/build-log/**`,
`docs/ideas-backlog.md`, or any file under `src/`. Where I wanted context and could not
get it, I wrote the wanting down instead of resolving it — that is the point of the
exercise. Everything below is what a stranger can actually see.

---

## 0. The first 60 seconds of README

Lines 7–9 land, immediately and well: *"An infinite canvas where every node is a live
terminal running a coding-agent CLI. Think Figma, but the objects are terminals."* That is
the best sentence in the project. I understood the product from it and I wanted it.

Then the next thing I hit is line 11–16 — a status block whose second clause is *"The app
is unsigned … Gatekeeper will object"* and whose third clause points me at
`docs/load-bearing.md` for what the test suite cannot prove. Two sentences in, the README
is talking to me about its own verification epistemology. I am not there yet. I want to
know if it can hold two agents on two branches.

What I actually did with the next 45 seconds: I scrolled the **"What it does"** bullet
list. It is 27 bullets and roughly 130 lines. I read the first three and skimmed for nouns.
The ones I stopped on:

- line 132, **"A git worktree per panel."** — this is my task. This is why I would install it.
- line 51, **"A review layer."** — this is the second half of my task.
- line 44, **"Type once into many."** — I did not ask for this but it is a genuinely new capability.

The ones that made me suspicious: by bullet 20 I am reading about vaults, camera trails,
bookmarks, OSC 133 command boundaries and a run ledger, and I have not yet been told how to
open my repository. **The README's information architecture is a feature inventory sorted
by build order, not a path from "I have a repo and two bugs" to "I am working."** There is
no "here is the 3-minute version" and no screenshot embedded anywhere — `## What it looks
like` (line 146) *describes six PNGs in prose* rather than showing them. For a visual-first
product that is a self-inflicted wound: the strongest asset this project has is that it
looks like nothing else, and the README makes you read 700 words about pictures you cannot
see.

Total README: **982 lines.** I would have stopped at ~60 in real life.

---

## 1. Time to first value

**Honest answer: it does not clearly happen inside 20 minutes, and it is close.**

The moment *exists* — I can point at it — but the path to it is not discoverable from
where the app puts me.

The moment is **`verbs.png`**: a review node open on the canvas showing a real unified diff
(`-export const port = 8080` / `+export const port = 8081`, `src/health.ts new`), with the
context pane beside it reading `2 files changed`, `RUN run 1 · 3 panels · 2m 0s · $0.21`,
and a `COST` block with input/output/cache-read token counts. **That is something my tmux
setup cannot give me**: per-agent attributed diff, spatially adjacent to the conversation
that produced it, priced. Second-strongest is **`across.png`** — `review: every worktree of
repo`, `3 worktrees · 2 with changes`, main tree plus `tc/api-20260904-1100` plus
`tc/tests-20260904-1102`, each with its own file list and counts. That is literally the
review half of my task rendered as one object, and I currently do it with three terminal
tabs and `git -C`.

Why I probably do not get there in 20 minutes:

1. **The launcher does not have my task on it.** `launcher.png` offers three cards — *New
   panel…*, *Chat with Claude…*, *Open a file…* — and four `>` lines: `Start Login shell…
   in ~`, `Start Claude… in ~`, `Chat with Codex…` (disabled), `New note…` (disabled).
   Every enabled door points at `~`. **There is no "open a repository" and no folder
   picker on the first screen.** My task starts with a repo. The app starts in my home
   directory.
2. **The worktree feature is not on any first-run surface.** README line 132 promises "a
   git worktree per panel" and says the door is a *preset* called *Claude in a fresh
   worktree*. That preset is not on the launcher, not visible in `palette.png`, and not
   in the `WHAT` field of `spawn-sheet.png` (which shows the two recent temp paths).
   The only place I ever see worktrees offered is `lineup.png` — a `LANES` checkbox
   labelled *"agents in their own worktrees"* inside a spawn sheet opened on
   `lineup: Workbench — an agent, a shell, and a browser at localhost:3000`. **I would
   never type the word "lineup" looking for parallel worktrees.** The feature I came for
   is behind a noun I have no reason to guess.
3. **The `across` review refuses the second half of my task by name.** In `across.png` the
   `Commit` control is greyed and the body says *"one worktree at a time — open that
   worktree's own review to commit or discard."* My sentence was "review both diffs
   **before I commit either**" — so the review is fine and the commit is a per-worktree
   trip. That is defensible and it is even well-worded, but it means the object that
   looked like it solved my task solves 60% of it.

**Best case** (I get lucky and find the lineup row): first value around minute 12–14, at
the point where two agent panels sit side by side with two distinct review nodes. **Modal
case:** I spawn `Start Claude… in ~`, get one terminal that is a worse tmux, and close it.

---

## 2. The quit points, ranked

**Q1 — `no tmux — sessions end on reload`, permanently, in the status bar.**
*Seen:* `launcher.png` bottom-right, and in **every other screenshot in `out/shots/`**.
*Assumed:* "This app is going to lose my agents." I have tmux installed; I read this as the
app being broken, not as an optional dependency being absent from *its* PATH — and the
README's own line 456 tells me GUI apps get a bare PATH, so I now suspect it just cannot
see my `brew` tmux. *Needed:* this message should not be a permanent resident of the chrome.
It should be a dismissible first-run notice with a **fix** attached (`brew install tmux`,
or "found no tmux on the login PATH — Environment… in ⌘K"), the same way the codex line
right above it names its fix. As shipped, the single most-repeated string in the entire
product surface is a warning about data loss.

**Q2 — Gatekeeper, before the app has earned anything.**
*Seen:* README lines 202–217. `xattr -dr com.apple.quarantine /Applications/Terminal\ Canvas.app`,
followed by *"Only do this because you have read the source or trust its author."*
*Assumed:* I am being asked to disable a security control for an unproven app by an author I
do not know, in minute 2 of 20. *Needed:* lead with `npm run dev` from source (which is
three commands and needs no developer account, per line 221) as the **default** path for
this audience, and put the `.dmg` second. Right now the download is first and the source
build is a footnote under it.

**Q3 — the launcher's `WHERE` is `~` and there is no repository door.**
*Seen:* `launcher.png` (`Start Claude… in ~`), `spawn-sheet.png` (`WHERE: ~`, with a
suggestion list of two `/private/var/folders/hl/3nv4zlv11vg6kxy1rp3lm3040000gn/T/tc shot
fixtures PIeOTn` paths).
*Assumed:* this is a terminal launcher, not a repo tool. *Needed:* a "Choose a repository…"
door on the launcher that opens a folder picker, detects git, and offers *"start two agents
in separate worktrees"* as a one-click shape. The machinery for that exists (`lineup`,
`LANES`) and is invisible.

**Q4 — half the launcher card is an error about a CLI I do not use.**
*Seen:* `launcher.png` — `Chat with Codex…` disabled, plus a full paragraph
`codex not found — install it so it is on the login PATH · asked /bin/zsh · checked 2
folders — Environment… in ⌘K [Check again]`.
*Assumed:* the app is unhappy. *Needed:* the "no dead ends" policy (README line 62) is a
good policy, but on a **first run** the effect is that the largest block of text on the
welcome screen is a failure report about an optional dependency. Collapse it to one dim line.

**Q5 — the canvas in every screenshot is a pile, not a canvas.**
*Seen:* `kinds.png`, `overview.png`, `inspector-detail.png`, `search.png`, `memory.png`.
Panels overlap and occlude each other constantly: in `overview.png` the `claude — api (2)`
panel sits on top of a chat, which sits on top of a review node, which sits on top of a
GitHub panel; three separate `SUBAGENTS` cards are stranded in the gaps. In `memory.png`
five panels are mutually clipped.
*Assumed:* "infinite canvas" in practice means "floating windows with no window manager."
The Figma comparison in line 8 sets an expectation of *arrangement*, and the demo canvas —
which is the author's own curated fixture — is messier than my tmux grid. *Needed:* the
seeded fixture should look like a canvas someone would want. If `Tidy` (visible in
`palette-query.png`) fixes this, run it before the screenshot.

**Q6 — zooming out destroys the thing zooming out is for.**
*Seen:* `zoomed-out.png` at 22%. The panel titles are unreadable, and the entire canvas
content is a small cluster in the lower-middle of a screen that is ~75% empty grey.
The manifest promises *"cards become summaries whose title and state are still legible"* —
at this zoom they are not. `merged.png` has the same problem plus a `docs` workspace lane
that is cut off at the right edge of the frame.
*Assumed:* the overview mode does not overview. *Needed:* either `fit` should actually fit
(it is right there in the status strip and evidently was not used), or the summary tier
needs a much larger title floor.

**Q7 — the palette's fuzzy match returns garbage at the top.**
*Seen:* `palette-query.png`, query `group`. The top three rows under PANELS are
`Review every worktree of chat: /private/var/folders/hl/3nv4zl…`,
`Open review of chat: /private/var/folders/hl/3nv4zlv11vg6kxy1rp3lm3040000gn/T/tc shot
fixtures PIeOTn/repo (ch…`, `Open toolbox for chat: /private/var/…`. The letters g-r-o-u-p
are highlighted *scattered across a temp directory hash*. The three rows that actually
concern groups (`Card group`, `Remove group`, `Group 1 panel…`) are pushed to the bottom
under CANVAS.
*Assumed:* search is noise. *Needed:* do not fuzzy-match into filesystem paths, or weight
title matches far above path matches. This is the first surface a keyboard user touches and
it fails on the manifest's own chosen demo query.

**Q8 — the compact breakpoint occludes the canvas.**
*Seen:* `compact.png` at 1000px. The `worker a` context drawer covers the `tests` panel
entirely and clips `server.ts`. The manifest says *"the canvas keeps the width"* — visually
it does not; it is behind a drawer.

**Q9 — `Commit` is disabled on the object that answered my question.**
*Seen:* `across.png`. Covered above. Lower-ranked because the refusal is *named*, which is
genuinely better than most apps.

**Q10 — the README length itself.** 982 lines with no images, no quickstart, and an
Architecture section containing a 60-line IPC channel diagram (lines 350–412). That diagram
is for contributors and it is above the "Things that are non-obvious" prose that a user
might want. I would not have found line 132 (worktrees) if I had not been looking for it.

---

## 3. Assumed knowledge — every element I cannot infer

Exhaustive and petty, as asked. Grouped by screenshot.

**`launcher.png`**
- The seven-icon left dock. From top: a 2×2 grid, a stack/layers glyph, a folder, a pencil,
  a chain link, **a second 2×2 grid nearly identical to the first**, and a card/rows glyph.
  No labels, no visible tooltips. Two of the seven are visually the same icon. I cannot name
  a single one of them from the picture. (Cross-referencing other shots: layers = Workspaces,
  folder = Files, grid#1 = Panels, grid#2 = Teammates, card = Board, link = ?, pencil = ?.
  I had to reverse-engineer that from five other screenshots.)
- `0 live` / `0 quiet` in the bottom-left corner. Live *what*? Quiet is not a state word
  used anywhere else on this screen.
- `0, 0` in the status strip. (World cursor coordinates, I eventually guessed.)
- `fit` next to the zoom control — fit what to what?
- `hints fade once you have used them` — hints to what? Which of the things on screen is a hint?
- `New note… — start a panel first — a note is saved in its directory`. Why does a note
  require a panel? A note is the one thing I would expect to need nothing.
- The bell icon bottom-left with no count.
- Top bar: an unlabelled sun/brightness icon and an unlabelled split-rectangle icon.
- The `≡`-ish glyph immediately right of `New panel… ⌘⇧N`.

**`kinds.png`**
- **`fill`** in every panel's chrome. Fill what? (Later shots put `Fill` next to `Lock` and
  `Pin` in the action bar, so I infer maximise — but "fill" is not the word for that.)
- The padlock glyph beside `claude — api` and the pushpin beside `tests` in the rail. Also
  a padlock *and* a `Lock` button *and* a pinned/pin control — three affordances, three
  places, no legend.
- `⋯` on every frame.
- The `±` prefix on review-node rows in the rail, `≡` on memory, a clock on watcher, a globe
  on browser, a speech bubble on chat, a grid on Jira, a target on GitHub. Nine kind glyphs,
  none labelled.
- Rail state words in a single column: `idle`, `asleep · start`, `not started`, `working`,
  `needs you`, plus `click to start` on the card body and `starting` in `overview.png`.
  That is **six or seven state words for what I model as three** (running / waiting / dead).
- `flaky since the watchdog change` floating in a pill near `tests` — an annotation? a tag?
  a note? It has no frame and no owner.
- `the api pair — worker b takes over on exit 0` floating unattached between panels.
- `2 in 1 group` in the toolbox chrome.
- `95 B · 4 lines` in a file panel's chrome next to a pencil and a refresh glyph.

**`chat.png`**
- `repo · main claude` as a chrome strip — three separate facts, no separators explaining
  which is which.
- **`auto`** as a bare chrome button. Auto what?
- **`to terminal`** as a chrome verb. Converts this chat into a terminal? Sends this to a
  terminal? Opens the same session in a terminal?
- **`3 remembered`** in `memory.png`'s chrome — remembered by whom, readable where?
- The word **`thought`** on its own line under `YOU`, with no content. Collapsed reasoning?
  An empty state? It reads like a rendering bug.
- `TOOL Read …/src/server.ts` with a `diff` link on the right and `show result` beneath.

**`board.png`**
- Four columns `TODO / WORKING / REVIEW / DONE` with counts. Which of these can I drag into?
  (Only two, per the manifest — invisible in the image except as a dashed edge I did not
  notice until told.)
- `Show on canvas` on one card, `On board` on another card in `graph.png`, `Add to board` on
  a third in `github.png`. **Three phrasings for what I believe are two operations.**
- `teammate :ada lane :claude — api (chat)` printed inside a work card as two colon-prefixed
  key-values. `lane` here means "the chat panel doing the work". In `lineup.png` `LANES`
  means "worktrees". In `merged.png` lanes are per-workspace columns. **One noun, three
  referents.**

**`graph.png`**
- `RULE: after a turn` in a select, and `on exit 0` printed on the edge in the canvas.
  Are those the same vocabulary? (I think yes; the words do not match.)
- `LAST: never fired`.
- `LABEL: none — the rule is shown on the line`.
- The Tools tab in `compact.png` calls these **`AUTOMATIONS`**; the README calls them
  **handoffs**; the inspector calls the object an **`EDGE`**. Three names, one thing.

**`runs.png` / workspaces pane**
- `RUNS / auto · complete / 1 panel · 25s · — / working [Run again]` and
  `run 1 / 3 panels · 2m 0s · $0.21 / idle [Run again]`. A *run* that is `idle`; a run named
  `auto · complete` where "complete" turns out to be a **mode name**, not a status, sitting
  directly above a real status. I read `auto · complete` as "the auto run completed" and I
  was wrong.
- `HISTORY — no snapshots yet — one is kept a minute after each save`. Snapshots of the
  layout? of the repo? of the agent? This sits under RUNS, which primes me for "run history".

**`inspector-detail.png`**
- `COMMAND · AS ASKED /bin/sh` — as asked by whom, as opposed to what?
- **`FONT SIZE 13 (default)`** as one of three fields in the identity pane of a review node.
  Font size is the third most important fact about this panel?
- The action bar shape changes between screenshots: `Lock / Pin / Fill / Open as chat /
  Rename… / Save as preset / Link to… / Close` here, versus **ten** buttons in `verbs.png`
  (`Allow Bash / Deny / Restart / Lock / Pin / Fill / Open in terminal / Rename… /
  Save as preset(disabled) / Link to… / Close`). I cannot predict what will be there.
- An unlabelled empty text input directly above the action bar in every inspector shot.

**`spawn-sheet.png`**
- `HOW: default mode ∨ | default effort ∨ | default model ∨` — three selects, no hint text,
  all reading "default". Mode of what? Effort is a Codex concept; I would not know that.
- The `WHERE` suggestions are labelled `recent` and `open panel` on the right — those are
  *provenance* labels I read as *actions*.

**`teammate.png`**
- `ada — 1 place · 1 svc · sche…` truncated mid-word in the row.
- `GitHub — granted — not connected` with a `revoke` button, directly above
  `Jira — not connected` with a `grant` button. **Granted and not-connected at once** is a
  two-axis state rendered as one line; I read it as a contradiction.
- `may be messaged by other teammates` — other teammates are other configured personas, i.e.
  other prompts. This checkbox implies a multi-agent messaging system I have seen no other
  evidence of.
- `ROUTINES · RUNS WHILE THE APP IS OPEN — NOT WHILE IT IS CLOSED` in caps, then
  `nightly review · every 10m · missed at 01:55 PM — the app was closed`. A routine called
  "nightly" that runs every 10 minutes. (Fixture, but it is the fixture in the shipped shot.)
- `PLACES: …gn/T/tc shot fixtures PIeOTn/repo/ [remove] [add a place…]`. "Place" is a
  security boundary, and nothing on this pane says so.

**`memory.png`**
- A `decided ∨` select next to `what this repository decided` and an `Add` button, with rows
  tagged `FAILED / TRIED / DECIDED`. A three-value taxonomy I am expected to author against
  with no explanation of who reads it.

**Everywhere**
- The minimap in the top-right corner appears in ~12 shots with no border label, no
  close control, and in `across.png` it **occludes the GitHub panel's buttons**.
- `SUBAGENTS — 3 panels share this repository, so their subagents cannot be told apart` as a
  free-floating grey card with no frame, appearing 1–3 times per canvas. The manifest says
  this is deliberate and "should read as a deliberate card, not a rendering error." **It
  reads as a rendering error.** It has no title bar, no close, no owner, and it says the
  feature is off.
- `4 panels share this repository, so changes cannot be attributed` appears in the inspector,
  in review node bodies, and as those cards — with the count differing between panels in the
  same screenshot (`3`, `4`, and `5` across `kinds.png`/`palette.png`/`search.png`).

---

## 4. The vocabulary problem

**Landed immediately** (I already had the concept, the word matched):
panel, terminal, canvas, zoom/pan, workspace, preset, palette, review, diff, worktree,
group, search.

**Landed with one screenshot of effort:**
chat panel, board (kanban), teammate (a persona/prompt), watcher (a file-watch task runner),
memory (a project decision log), routine (a cron), template (a scaffold).

**Did not land:**
- **lane** — three meanings (worktree, the chat doing a work item, a merged-view column).
- **lineup** — the single most important noun for my task and the one I would never guess.
  "Lineup" and "seat" are a metaphor from nowhere.
- **place** — a folder allow-list. The word carries no security connotation at all.
- **run** vs **routine** vs **auto mode** vs **watcher** — four different "a thing happens
  without me" concepts, each with its own record, its own pane, and its own vocabulary.
- **handoff** vs **edge** vs **automation** vs **rule** — one concept, four names, three of
  which appear in the UI.
- **flip / fill / pin / lock / card** — five view verbs, none of which is the word I'd use.
- **vault** — I did not encounter it in any screenshot I opened, only in the README and
  manifest, and I cannot tell it apart from "a folder of markdown files."
- **supervisor** — a chat that reads the canvas. Distinct from teammate, routine and auto.
- **quiet** (in `0 live / 0 quiet`) — never defined.
- **broker / audit / grant / integration** — four nouns for "the app has your GitHub token."

**How many concepts must I hold before the app is usable?**

For my specific task — two agents, two worktrees, two reviews, then commit — I count
**eleven**: panel, kind, workspace, preset, spawn sheet, lineup + lanes(=worktree), review
node, the state vocabulary (asleep/idle/working/needs-you/not-started), the palette,
the context pane's three tabs, and *card vs live* (because a panel I can see may not be
running). That is already more than I will hold in 20 minutes.

For the app as advertised, the honest count of distinct, non-derivable nouns is
**~35–40**. The README's "What it does" list alone introduces 27 of them in 27 bullets.
This is the central product problem: **the app has roughly the concept count of an operating
system and the onboarding surface of a text editor.** Every one of those nouns is
individually well-designed — the disabled-with-a-reason discipline is real and visible in
`palette-query.png`, `across.png` and `verbs.png`, and it is better than most shipped
software. But a good reason attached to a noun I do not have does not help me.

---

## 5. What I would tell the author at a bar

> "You built the thing I actually want — two agents in two worktrees with attributed diffs
> side by side — and then you buried it under thirty nouns and a first screen that opens in
> my home directory and tells me tmux is missing; put a 'choose a repository' button on the
> launcher, make it spawn two worktree agents in one click, and delete every other word
> until someone gets there in ninety seconds."
