# M225–M229 — Act 0 and Act I: the baseline, the brief, and the material

The v11 visual run's first two acts. The run's resumable state is
[`m225-m243-ledger.md`](m225-m243-ledger.md); this log is the narrative, and where the two
disagree, the ledger is right.

Branch `m225-visual-baseline`, off `main` at `24165b7`. Nothing pushed.

---

## What shipped

| # | Milestone | What landed |
|---|---|---|
| M225 | baseline | `verify` exit 0 across 38 suites, `verify:packaged` 12/12; all 58 goldens walked by four fresh-context critics; the zero-diff proof, and the two things it caught |
| M226 | the brief | [`2026-09-09-m226-obsidian-amplified-brief.md`](../superpowers/specs/2026-09-09-m226-obsidian-amplified-brief.md) — the elevation scale in both themes, the rim recipe, the edge-flow state table with each signal's existing source, the chromeless frame rule with its per-kind exception list, the motion budget, the aura's activity term |
| M227 | the depth tokens | `--glass-0`, `--glass-3`, `--rim-inner` (and `--rim`, struck in M228) in both blocks, landed ALONE; `depth.1`; `obsidian.1` extended |
| M228 | the rim pair, applied | `--rim-top` on the frame and the launcher, `--rim-inner` on the terminal well and the launcher's well; `rim.1`, `rim.paint.1`, `well.paint.1` |
| M229 | light that responds | the aura answers `wants-you` and an open run through one registered custom property on one element; `aura.1`, `aura.paint.1` |

## The three things this act learned, which the next four acts inherit

### 1. A check that has never been made to fail is not a check

Four checks were written across M227–M229. **Three of them were green and meaningless** until
they were mutated — delete the change, rebuild, re-measure:

- `rim.paint.1` and `well.paint.1` both passed against a stylesheet with the rim pair deleted.
  They asserted *that a band exists* at an edge; a lit band at a frame's top edge is also the
  `--frame-line` border, and a dark band at a slot's top edge is also the chrome's
  `border-bottom` above it. Both were rewritten as **differentials** — two points on the same
  surface, compared — with every sample point validated by `elementFromPoint` first.
- `rim.1`'s first cut went red against a *correct* stylesheet, because it asserted a spelling
  (`var(--rim)` at the site) where it meant a fact (the surface wears a rim).

Mutation-testing every new check is now a standing step for the rest of the run.

### 2. Two instruments are blind here, each for its own reason, and neither says so

- **`verify:styles` reads text.** It proves a rule was written. M228 shipped
  `box-shadow: var(--rim-inner)` on `.panel__slot`, `verify:styles` went green, and the rule
  **painted nothing at all** — an inset shadow paints between an element's background and its
  content, and xterm's canvases *are* the slot's content. The recess had to move to
  `.panel__slot::after` at `z-index: 11`.
- **`verify:visual` cannot see a hairline, and that is arithmetic.** A 1px feature contributes
  one row to a halved golden: 32 of 1024 pixels in a 32px tile (3.1% against a 35% budget), and
  far under the 0.5% frame budget. `verify:visual` reported **60/60** with the rim pair applied
  to every panel in every scene. **A green visual suite is silent about M228** — not
  confirmation of it. The scenes it answers were forced through the gate by hand.

Both facts are now written into the checks' own comments, so the next reader does not have to
rediscover them.

### 3. A carefully-argued design decision can still be wrong, and only pixels settle it

M226's brief declared `--rim` beside `--edge-light` and argued they could not collide:
"`--edge-light` keeps its own two sites and `--rim` is what the FRAME wears, so the two never
argue over one name." It named sites. It distinguished roles. It was written down.

`.pf__chrome` has carried `inset 0 1px 0 var(--edge-light)` since M109, and the chrome's top
edge **is** the frame's top edge. A paint check measured the two stacked at one y — `39,42,51`
with `--edge-light` alone, `45,48,57` with `--rim` over it — with values agreeing to within .03
alpha in both themes. `--rim` is struck in the brief with the measurement beside it.

## Baseline findings recorded in the ledger

- **Two goldens (`kinds`, `kinds-dark`) were already stale on `main`** — M202's `WorkNode.tsx`
  change landed without regenerating them. Rebaselined here through the full gate, with the
  critic's sentence attributing the change to M202.
- **The shot fixture baked an ephemeral port** into every capture (`listen(0)`), about 171
  differing pixels — under both budgets, so the suite never said a word. Fixed to prefer a
  fixed port and fall back.
- **All 58 scenes walked**, one sentence each on what is flat, collapsing to five themes and a
  defect list, each with FIX-in-act-N or DECLINE-with-a-reason.
