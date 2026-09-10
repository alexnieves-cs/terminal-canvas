# Terminal Canvas — the v11 run: Obsidian amplified, in goal mode

**How to run this:** open a fresh Claude Code session in `~/Documents/terminal-canvas`, type
`/goal`, and paste this entire document as the goal description. Nobody is at the keyboard
afterwards. Every decision a prior run would have asked a person is a recorded default below;
where two designs are defensible, pick one, write the reason in the ledger, and move. The
evaluator cannot tell "deliberating" from "stuck", and only one earns its turns.

This is the eleventh run on this codebase. M1–M192 shipped 5.0.0; M193–M224 are **reserved**
by the v10 product guide (`docs/product-development-guide-2026-09-08.md`, D01–D20) and are
being worked separately — **do not take a number in that range, do not implement a D-item, and
do not renumber anything.** This run is a parallel act on the visual layer only.

Ten runs made the canvas trustworthy, wide, capable, and — since v8 — legible as a product.
**None of them made it feel advanced.** The material is honest and flat: two glass tokens used
conservatively, one resting shadow, edges that are geometry and carry no information, a
terminal panel wearing a six-control toolbar above its content. That is this run's one job.

---

## The goal condition — what the evaluator is actually checking

After every turn a small fast model reads the transcript and asks whether this is true yet.
Keep it true-or-false:

> `main` is at a new tagged version (5.1.0 — no seam changes in this run; if one becomes
> unavoidable, 6.0.0 and say so), clean, with `npm run verify` printing every suite's tally at
> exit 0 and `npm run verify:packaged` green, both pasted in the final message. Acts 0 through
> V below are each fully closed — a spec, a plan, red-first checks watched failing, a
> fresh-context critic AND a fresh-context verifier per milestone, a build log per act, no owed
> item silently dropped. **Every golden under `verify/visual/goldens/` that changed was changed
> on purpose, with a fresh-context critic's written sentence for that specific scene recorded in
> the ledger before `UPDATE_GOLDENS=1` ran.** The brief written in Act 0 is finished and every
> one of its principles is either implemented or struck through with a reason. `CLAUDE.md` and
> `README.md` are reconciled. Nothing was pushed to `origin` and no GitHub release was created.
> The final message states, per act, what shipped, what was declined and why, and whether `main`
> is shippable right now.

If a suite is red, if a claim has no command and exit code beside it, **if a single golden
changed without a critic sentence naming that scene**, or if an act was entered and left
half-built, the condition is **not** met — keep working. If everything reachable is done,
report and stop; padding is as much a failure as quitting early.

---

## The brief — the three decisions already made, so you do not re-litigate them

A person chose these. They are inputs, not options.

### 1. Amplify Obsidian; do not replace it

Dark stays the flagship, `--iris` cyan stays the accent, glass over blur, 12px corners, system
SF. What changes is **depth and response**, not identity. Every existing golden therefore
remains a valid comparison, which is the whole reason this direction was chosen over a fresh
palette: a change that overshoots shows up as a pixel number against a scene you can still read.

Concretely, the four things to push:

- **A real glass stack.** Today `--glass-1` / `--glass-2` are two flat fills. Depth becomes
  *tokens*, so it propagates through `--panel-bg`'s existing alias without touching one
  `.panel__*` selector.
- **Light that responds.** `.canvas__aura` follows the camera at 0.12 and nothing else. It
  should also answer to what the canvas is *doing*.
- **Edges that carry data, not just geometry.** See §2.
- **Panel chrome as composition, not a toolbar row.** See §3.

### 2. Edges mean FLOW — payload in transit, never continuous health

An edge animates **only when something crosses it**. At rest it is a quiet line with no motion.
This was chosen over a continuously-tinted "health" grammar deliberately: continuous ambient
motion across every edge contradicts the rest rule, and it has no honest reduced-motion
degradation.

The six states, each from a signal that **already exists on the wire today**:

| State | Source that already exists | Visual |
|---|---|---|
| rest | — | the current quiet line, **no motion** |
| armed | a run is live and the edge is in its component (`useRuns`, `componentOf`) | line lifts to `--iris-dim`, static |
| firing | `useHandoff.ts:226–230` records `{ kind: 'fired', … }` | a bright packet travels `t: 0 → 1` along the existing cubic |
| arrived | a join arrival (`useHandoff.ts:159–167`) | the **target's** `.pf::before` rim flashes once |
| waiting | `joinAdvance`, 2 of 3 sources in | armed edges breathe at `--dur-breath`; unarrived edges stay at rest |
| blocked | the target is `wants-you` (`panel-state.ts`) | the edge holds `--amber`, no travel |

**The travel is analytic, not measured.** `link-geometry.ts` already yields `c1x/c1y/c2x/c2y`,
and `LinkLayer` already places the label at `t = 0.5` via `(P0 + 3C1 + 3C2 + P3) / 8` with no
`getPointAtLength` and no laid-out DOM — its own comment records why. A packet is that same
`bez()` at animated `t`. **One shared `requestAnimationFrame` for the whole layer**, never one
per edge, and no rAF at all while nothing is armed.

### 3. The terminal panel goes chromeless / edge-to-edge

At rest a terminal panel is: a rounded glass rim, a small state-toned dot, the name at low
emphasis floating over the first row, and terminal content running to the edge. Controls appear
on hover / focus / selection over a gradient scrim so the text underneath stays legible.

This is **not a new mechanism** — `styles.css:4365–4366` already does exactly this for a `note`
in `text` form. It is that precedent extended.

**But there is one trap the note form does not hit, and getting it wrong is silent.**
`.pf__chrome` is currently a flex *sibling* of `.pf__body`, so at opacity 0 it still occupies a
box. That is deliberate (M44's reach rule: the box, the name and the tab order survive). For a
terminal, "edge-to-edge" means the body must own the full height — so the chrome must become
**absolutely positioned over** the body, and the body must be given the full block size.

> **If you instead collapse the chrome's box on hover, xterm refits and fires a SIGWINCH into
> the running agent on every mouse-over.** A resize storm with no visible error and no red
> suite. Absolute positioning is the only safe version of chromeless here. **Write the red check
> for this first** (hover a live terminal panel; assert the xterm rows/cols and the body's
> measured block size are unchanged across the hover), and watch it fail against the naive
> implementation before you write the fix.

---

## Ground rules that do not change

- **The Obsidian brief (M109–M111) is amended, not replaced.** A new colour, radius, spacing or
  blur value is a **NEW token declared in BOTH theme blocks** (`verify:styles theme.1`), never a
  re-spelling of an existing name. A *re-valuation* of an existing token is one theme's, and it
  is recorded in the ledger with the finding that forced it.
- **`--amber` stays a literal. `--well` equals the xterm background** for the same theme
  (`verify:panels theme.1` pins the dark literal). Re-run the contrast check
  (`verify:styles 11`) after every token change and keep it green. Every measured token stays
  six-digit hex — `verify:panels` parses `--line-strong` with `toRgb` and skips an rgba, so a
  glass fill is a NEW NAME, never a re-spelling into rgba.
- **`.pf__body` is never transformed** (`verify:panels frame.2` / `frame.3`). Absolute chrome
  does not transform the body, so this holds — keep it holding.
- **Every DOM alias survives.** `.panel`, `.panel__chrome`, `.panel__title`, `.panel__close`,
  `.panel__slot`, `.panel__card`, `.panel__resize`, and every `*-node__*` hook — roughly two
  hundred checks select on them. **Restyle the classes; never rename them.**
- **Terminals stay terminals.** xterm's cell metrics, the pointer correction, OSC 133, the PTY
  flush gate, dormancy tiers and the WebGL budget are untouched. The terminal *frame* gets the
  new material; the cells inside it do not change size, face or palette.
- **Opacity is 0 or 1** (`verify:styles` check 3). Softness comes from a gradient scrim, a
  `color-mix`, or a token — never from a fractional opacity on a control.
- **Hover-revealed controls stay keyboard-reachable and named** (M44's rule). Hiding a control
  at rest never removes it from the tab order or its `aria-label`. A scripted click must land
  without a hover.
- **One resting shadow.** `--lift` stays the only one (`verify:styles shadow.1` names its
  sites). Depth comes from the rim pair, not from stacking shadows — which is also why it stays
  cheap: a border and an inset box-shadow do not composite.
- **Blur is paid at the near tiers only** (`blur.1`). A forty-panel canvas with
  `backdrop-filter` on every card is the one way to make this app feel *worse*. Any new blur
  site inherits that gate.
- **Motion respects `prefers-reduced-motion`, and degrades by reporting.** With motion off a
  fire still *reports* — the edge highlights for `--dur-2` and releases — it simply does not
  travel. **The event is never lost, only the animation.** The `reduced-motion` golden scene is
  the proof.
- **The face rule, the rest rule, the path rule, the metrics rule and "words, not codes"
  (v8, M162) are unchanged and still checked.** This run adds material; it does not spend those.
- **No new runtime dependency.** No Tailwind, no component library, no icon font, no animation
  library. The renderer's CSP is `default-src 'self'` and is not relaxed. `icons.tsx` grows if a
  milestone needs a glyph.
- **The verify harness is the contract.** Red-first checks for every milestone, watched failing.
  A new check takes a **scoped string id** (`depth.1`, `edge.flow.2`), never the next global
  integer.
- **No pushes, no releases.** Tag locally, draft the release body, stop.

### Harness facts this repo has already paid for — do not rediscover them

- **Never run two Electron verify chains at once** (the load-flake rule). Kill the verify tmux
  server between runs. Each worktree gets its own `TC_VERIFY_SUFFIX`.
- **Real-Electron suites run under the SYSTEM `TMPDIR`.** A long repository-local path wraps in
  a 78-column terminal and moves goldens' painted fixture paths past the tile budget — this
  produced three false reds in M180.
- **The shot window's content is pinned to the goldens' 1440x865.** macOS clamps a window to the
  work area at creation only.
- **The fixture directory is a FIXED name.** A per-run suffix in a printed path moved goldens
  past the tile budget on some runs and not others.
- **A check that THROWS aborts the run**, so every check below it never executes and its RED is
  not evidence. Read `docs/verify-suites.md` before adding or debugging a check.
- **A DOM read is not a paint check.** M149 found two surfaces (the `⋯` menu, the attention
  popover) that were open in the DOM and invisible for two whole versions, both because a new
  stacking context was introduced by a transform or a blur. **This run introduces both.**
  Every new elevated surface gets an `elementFromPoint` paint check, not a query check.

### The style checks you will actually touch, and what they do

Verified against `scripts/verify-styles.cjs` on 2026-09-09; re-read them before you plan
around them.

- **`obsidian.1` is a FLOOR, not an exact set.** It filters for *missing* names out of
  `['--glass-1','--glass-2','--edge-light','--bezel','--lift','--aura-1','--aura-2','--on-iris','--blur']`.
  Adding `--glass-0` and `--glass-3` cannot break it. **Extend its `GLASS` array anyway** — a
  new load-bearing token that no check pins is a token a later run deletes without noticing.
- **`theme.1` is the parity gate.** Every new token in both blocks, or it goes red.
- **check 3** — no fractional opacity used to dim text.
- **check 11** — measured contrast for every text and accent token against every ground, in
  every theme block. Run it after every token change.
- **`shadow.1`** — one resting shadow (`--lift`) on the frame and the launcher only;
  `--e-1`/`--e-2` unused in the body, `--e-3`/`--e-4` only on overlays. Act IV's `--glass-3`
  surfaces are the overlay tier; keep them inside that rule rather than widening it.
- **`blur.1`** — the panel blurs through `--blur` at the near tiers, the far tiers set
  `backdrop-filter: none`, the HUD never blurs. Any new blur site inherits all three arms.
- **`far.1`** — the block tier and the minimap share one `color-mix` fill of the tone over
  `--s-1`. M241 keeps them sharing it.

---

---

## THE GOLDEN GATE — read this twice

This is the rule most likely to be rationalised away, because obeying it is slower than not.

`verify/visual/goldens/` holds a golden per declared scene (read the count off disk; do not
restate it in prose — `verify:meta` pins one golden per scene, and `verify:meta` 23 exists
because hand-written counts in this repo have drifted before). A restyle of this size will
change most of them.

**`UPDATE_GOLDENS=1` is forbidden until, for the specific scene being rebaselined, a
fresh-context critic has looked at the diff image and written a sentence into the ledger saying
what changed and why that is correct.**

- The critic is a **fresh-context subagent** handed the before PNG, the after PNG and the diff
  image from `out/visual/`. It is not you, and it does not get this prompt.
- A blind re-baseline is, by this repo's own rule, **a regression that cannot be seen** — and it
  fails the goal condition outright.
- A change that is UNDER the pixel budget but that MATTERS is forced through the same gate by
  deleting that golden, with its sentence.
- Goal mode's failure mode here is specific and predictable: when the visual suite is red, the
  cheapest way to make it green is to rebaseline everything. **That is the failure. Do not.**

---

## Milestone numbering

M192 is the last number this run may build on. **M193–M224 are reserved** (v10 / D01–D20).
This run starts at **M225** and runs to **M243**. One branch per act, named for its first
milestone (`m225-visual-baseline`), merged to `main` at the act's close with the act's build log
in `docs/build-log/`.

Before the first line changes, confirm `main` is clean. The v10 work may have uncommitted
files (an M201 review-readiness spec, plan and `src/shared/review-readiness.ts` were in flight
when this prompt was written). **Do not commit, revert, or build on someone else's uncommitted
work.** If the tree is dirty, stash nothing — start this run in a `git worktree` of its own
(`superpowers:using-git-worktrees`), with its own `TC_VERIFY_SUFFIX`.

---

## The acts

### Act 0 — the baseline and the brief (M225–M226)

- **M225 · baseline.** `npm run verify` and `npm run verify:packaged` green before a line
  changes; paste the tallies into the ledger with the commit sha. Regenerate the goldens once
  with nothing changed to prove the harness is stable at zero diff. **Look at every golden.**
  Record, per scene, one sentence on what is flat about it — that list is Act V's audit input.
- **M226 · the brief.** `docs/superpowers/specs/2026-09-09-m226-obsidian-amplified-brief.md`.
  It contains: the elevation scale with every token's value in **both** themes; the rim
  recipe; the edge-flow state table with the exact source of each signal; the chromeless frame
  rule (which kinds get it, which keep a header, and why); the motion budget (what may move, for
  how long, and what happens under reduced motion); and the findings from M225 each with a
  disposition (FIX in act N / DECLINE and why). `verify:styles` gains a check per rule that can
  be checked mechanically.

### Act I — the material (M227–M229)

- **M227 · the depth tokens.** `--glass-0` (the recessed well), `--glass-3` (floating overlays:
  menu, popover, palette), `--rim` (the 1px specular top edge on a raised surface), `--rim-inner`
  (the inset shadow that makes a well read as recessed). Both theme blocks. **No surface changes
  in this milestone** — tokens land alone so that `verify:visual` proves zero golden drift, which
  is the evidence that the token layer is inert until spent.
  New check `depth.1`: **elevation is monotonic** — a surface may sit on `--glass-N` only if its
  parent is `< N`. Checkable as text over `styles.css`, so it cannot rot into a convention.
- **M228 · the rim pair, applied.** The frame gets `--rim`; the terminal well and every recessed
  surface get `--rim-inner`. Re-run `verify:styles` 11 (contrast). This is the first milestone
  whose goldens move — the golden gate applies in full from here.
- **M229 · light that responds.** `.canvas__aura` gains a second, cheap term: activity. Armed
  runs and `wants-you` panels warm the ground fractionally; an idle canvas is unchanged from
  today. **Budget it**: no per-panel layer, no per-frame layout read, and nothing at all at the
  far tiers. If it cannot be done inside one existing composited layer, **decline it in writing**
  and move — a beautiful aura that costs frames during a drag is a net loss.

### Act II — reactive edges (M230–M233)

- **M230 · the pure model, red-first.** `shared/edge-activity.ts`: a pure reducer taking handoff
  events, run state and panel states, keyed `from:to`, answering an `EdgeActivity` union of the
  six states. Plain-node checks appended to an existing plain-node suite. **If you add a new
  suite, update `package.json`'s `verify` chain and any `verify:meta` pin in the same commit** —
  a suite that exists and is never chained is a suite that is never run.
  Follow the absent / malformed / unknown rule and the three-state rule; an edge with no signal
  is `rest`, which is a different fact from an edge whose source has exited.
- **M231 · the store and the wire.** `useEdgeActivity.ts` — a **module-level store keyed by
  edge, subscribed per edge**, caching its snapshot object, and **cleared at every
  panel-removing call site**. It must NOT ride `registry.version()`: that counter carries
  tier/status/focus/exit and nothing higher-frequency, and edge activity is precisely the
  high-frequency thing that rule exists to keep off it.
- **M232 · the layer.** `LinkLayer` renders the six states. One shared rAF for the layer, none
  while nothing is armed, the packet at analytic `t`. **Culled at `cardDetail === 'tail'`** — a
  far-view canvas draws quiet lines and does not animate packets nobody can resolve. The hit
  stroke's rules are untouched: it still never calls `stopPropagation`, and the badge is still
  the one element that consumes.
- **M233 · arrival, blocking, and reduced motion.** The target's rim flash reuses `.pf::before`
  (M109's state-edge glow) rather than a second mechanism. The blocked amber. The reduced-motion
  arm, with the `reduced-motion` golden as its proof. A new scene for a firing edge and one for
  a waiting join — a state with no golden is a state no critic ever sees.

### Act III — the chromeless terminal (M234–M236)

- **M234 · the resize check, red first.** Write the SIGWINCH check described in §3 above and
  **watch it fail** against a naive collapse-the-box implementation. Then make the chrome
  absolute and the body full-height, and watch it pass. Add the `elementFromPoint` paint check
  for the chrome at both rest and hover — M149's lesson is that a query check stays green
  through exactly this class of bug.
- **M235 · the frame at rest.** The state dot, the name at low emphasis, the gradient scrim, the
  controls on hover / focus / selection. Legibility over the first terminal row is the acceptance
  test, and it is a critic's judgement on a golden, not a number.
- **M236 · the frame rule, reconciled.** Write down which kinds are chromeless and which keep a
  header, and why. A rule with an exception list is fine; a rule that is silently per-kind is
  how the frame drifted before M47 unified it. Update `CLAUDE.md`'s frame entry.

### Act IV — the material through the shell (M237–M241)

Each of these is: apply the Act I stack, walk the affected goldens, one critic sentence per
changed scene. Decline anything that fights the rest rule rather than bending the rest rule.

- **M237 · rail and dock.**
- **M238 · inspector and context pane.**
- **M239 · composer and chat surfaces.** The conversation rules from v8 hold: the user's turn a
  soft bubble, the assistant unboxed prose at a readable measure, a tool call one collapsed row.
- **M240 · palette, launcher and sheets.** These are the `--glass-3` tier; they are also the
  surfaces most likely to acquire a stacking-context bug. Paint checks, not query checks.
- **M241 · the far view, minimap and card tiers.** The block tier and the minimap share one
  `color-mix` (`far.1`) — keep them sharing it.

### Act V — the finish (M242–M243)

- **M242 · the audit.** Walk every golden with a fresh-context critic, as M149 did. Record what
  the walk finds in `docs/visual-audit-5.1.md`, including defects that predate this run. Fix
  what is in scope; list what is not with a reason.
- **M243 · the reconcile.** `CLAUDE.md` (the material section, the frame entry, the load-bearing
  additions), `README.md`'s milestone table, the ledger closed, `npm run verify` and
  `npm run verify:packaged` green and pasted, tag `v5.1.0` locally, draft the release body, stop.

---

## The ledger

Keep `docs/build-log/m225-m243-ledger.md` open from the first turn: per milestone — spec path,
plan path, the red check names and the evidence they were watched failing, the critic's findings
and dispositions, the verifier's verdict, **every golden scene touched with the critic's
sentence for that scene**, and the commit. Compaction will happen mid-run; the ledger, not
memory, is the source of truth. Rebuild your understanding from it, then `CLAUDE.md`, then the
Act 0 brief, then README's table, in that order.

## The final message

Paste both tallies with exit codes. List the acts with shipped / declined / owed. Name the tag.
Say in one sentence whether `main` is shippable right now and what a human still has to do
(push, release). Stop.
