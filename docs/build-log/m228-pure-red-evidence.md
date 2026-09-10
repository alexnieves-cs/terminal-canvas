# M228 — red-first evidence

`rim.1` was written in M227 and **held back** to this milestone, because a check that requires a
surface to USE the rim pair cannot be satisfied by a milestone that changes no surface. It was
restored into `scripts/verify-styles.cjs` and watched failing three times, each time for a
different and correct reason, as the implementation was built up.

**1. The tokens exist; nothing wears them** (before any surface changed):

```
FAIL rim.1 the rim pair is declared in both theme blocks, both halves are used, and no one
           surface wears both
       {"both":true,"rimUsed":false,"innerUsed":true,"wearsBoth":[]}
```

`both: true` is M227's work showing through — the declaration half was already done, so the RED
is specifically about application, which is what this milestone is.

**2. The check was wrong, and said so.** After the frame wore the rim at all eight sites,
`rim.1` still reported `rimUsed: false`. That was not a bug in the CSS. The sites wear
`var(--rim-top)`, the recipe on bare `:root`, and the check grepped for `var(--rim)` in a body
rule — so it went red against a **correct** stylesheet.

This is the same failure mode `depth.1` was built to avoid one milestone earlier (a bare
`startsWith` would have made `.pf` "contain" `.pf__body`), met from the other direction. The
lesson is worth stating plainly, because the tempting move is the wrong one: when a check is
inconvenient, bend the code; when a check is **wrong**, fix the check. Those are different
findings and only the second licenses editing the check. Here the check asserted a *spelling*
where it meant a *fact*.

The rewrite follows the indirection and is **stricter** than the original: it additionally pins
that `--rim-top` is declared on bare `:root` and **resolves to `var(--rim)`**. Without that arm,
folding a literal into the recipe would take the rim out of the theme blocks and no check in the
repository would notice — check 1 does not read bare `:root`, and `theme.1` only compares the two
theme blocks with each other.

**3. Proven able to fail.** A check rewritten to go green is the check most likely to have been
rewritten into vacuity, so three mutations were run against the finished stylesheet:

```
mutation 1 — one surface wears BOTH halves
  FAIL {"recipeOk":true,"rimSites":10,"wellSites":2,"wearsBoth":[".panel__slot"]}

mutation 2 — the recipe folds in a literal, taking the rim out of the theme blocks
  FAIL {"recipe":"inset 0 1px 0 rgba(255,255,255,.9)","recipeOk":false,"rimSites":9}

mutation 3 — the frame loses its rim
  FAIL {"recipeOk":true,"rimSites":0,"wellSites":2}
```

Three reds, three different causes, each named in the detail. The check is live.

---

## The paint checks, and the two things a green suite was hiding

`rim.1` reads the stylesheet. It proves a rule was written. M149's lesson is that this is not
the same as proving anything painted, and this milestone produced two proofs of that in one
sitting. Both were found by **mutation-testing the paint checks** — delete the rim pair,
rebuild, re-measure — and neither was visible to any text-level check.

### 1. `box-shadow: inset` on `.panel__slot` never painted at all

The first implementation put `--rim-inner` directly on `.panel__slot`. `verify:styles` went
green. A paint check sampling the well's first row read **exactly `--well`**, unchanged, with
the shadow declared.

An inset box-shadow paints between an element's background and its **content**, and xterm's
canvases *are* the slot's content: they cover it completely. The recess had to move to
`.panel__slot::after` at `z-index: 11` (xterm's own layers run to 10, and `.pf__body`'s
`isolation: isolate` keeps that number local), with `pointer-events: none` — the one mistake
here that no screenshot could show.

### 2. `--rim` was a second name for `--edge-light`

M226's brief argued the two could not collide: "`--edge-light` keeps its own two sites and
`--rim` is what the FRAME wears, so the two never argue over one name." A paint check measured
them **stacked at one y**:

```
with --edge-light alone (rim deleted):  [59,67,86] [59,67,86] [39,42,51] x4
with --rim added over it:               [59,67,86] [59,67,86] [45,48,57] x4
```

`.pf__chrome` has carried `inset 0 1px 0 var(--edge-light)` since M109, and the chrome's top
edge **is** the frame's top edge. The two tokens' values agreed to within .03 alpha in both
themes. `--rim` was struck and `--rim-top` now resolves to `--edge-light`.

The rule this run works under — "a new value is a NEW token, never a re-spelling" — was right.
The reasoning that applied it was wrong, and it was wrong in a way that reads as careful:
it named sites, distinguished roles, and was written down. Only pixels could settle it.

### 3. Both paint checks were VACUOUS on their first two cuts

This is the part worth keeping. Both checks passed against a stylesheet with the rim pair
deleted:

```
mutation: rim pair removed entirely
  PASS rim.paint.1  ... "runs":2 ...      ← the second run was --edge-light, always there
  PASS well.paint.1 ... [7,8,13] x2 ...   ← that band was the chrome's border-bottom
```

They had been asserting **that a band exists**. A lit band at a frame's top edge is also the
`--frame-line` border; a dark band at a slot's top edge is also the chrome's border-bottom
above it. Neither check could have failed for the reason it claimed.

The fix was to make both **differential** — sample two points on the same surface and compare:

- `rim.paint.1` — the top inner edge against the **right** inner edge of the same panel. The
  right, not the left: `.pf::before` hangs a 14px tone glow off the left edge and would poison
  the reference.
- `well.paint.1` — the well's first row against the same well below its blur, on the same fill.

Every sample point is validated with `elementFromPoint` before it is captured, because a
coordinate inside an element's rect is not a coordinate where that element *paints* — an
overlapping panel or a HUD can own the pixel, and a check that captures blind reports the
neighbour's colour with total confidence.

After the rewrite, the mutation gives `well.paint.1` a clean red (`sink: 0` against `6.79`).
`rim.paint.1` still passes under mutation and **is recorded as an invariant rather than a
delta**: the lit top edge predates M228. What M228 changes is whose property it is — `.panel`'s
rather than whichever child happens to sit at the top — so the check's real job starts in
Act III, when the chrome stops being that child.

### The general lesson

A check that has never been made to fail is not a check. Three of the four written in this
milestone were green and meaningless until they were mutated, and every one of them looked
careful.
