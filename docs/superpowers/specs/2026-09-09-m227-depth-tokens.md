# M227 — the depth tokens

**Act I of the v11 visual run.** Brief: [`2026-09-09-m226-obsidian-amplified-brief.md`](2026-09-09-m226-obsidian-amplified-brief.md) §1–§2.

## What this milestone is

Four tokens land in both theme blocks and **nothing on screen changes**.

- `--glass-0` — the recessed well.
- `--glass-3` — floating overlays (menu, popover, palette, sheet).
- ~~`--rim` — the 1px specular top edge of a raised surface.~~ **STRUCK in M228**: it was a
  second name for `--edge-light`, which has meant exactly this since M109. See the brief §2.
- `--rim-inner` — the inset shadow that makes a well read as recessed.

## Why nothing changes

The token layer is **inert until it is spent**, and this milestone is the evidence for that
claim rather than an assertion of it: `verify:visual` runs with the tokens declared and proves
**zero golden drift**. If a token landing moved a pixel, something is reading it that should
not be, and the next four acts would be building on a surface that already shifted.

`--glass-1` and `--glass-2` keep their M109/M163 values **exactly**. That is what keeps every
existing golden a valid comparison, which is the reason this direction was chosen over a fresh
palette: an overshoot shows up as a pixel number against a scene you can still read.

## What it may not do

- No `.panel__*` selector changes, no surface changes of any kind.
- No re-spelling of an existing token. **This milestone broke that rule and M228 caught it**:
  `--rim` *was* `--edge-light` renamed, and the argument recorded here for why it was not (that
  the two had different sites) did not survive contact with a paint check. The rule was right;
  the reasoning applying it was not, and no text-level check could tell the difference — only
  pixels could.
- Every measured token stays six-digit hex. `verify:panels` parses `--line-strong` with `toRgb`
  and skips an rgba, so a glass fill is a NEW NAME, never a re-spelling into rgba.
- `--amber` stays a literal; `--well` still equals the xterm background for the same theme.

## Checks

- **`depth.1` (new).** The glass ramp declares all four levels in both blocks, and elevation is
  **monotonic**: a surface sits on `--glass-N` only inside a surface below `N`. Checked as text
  over `styles.css` — for every pair of glass-bearing rules where one selector begins with the
  other followed by a combinator, the descendant's level must be strictly greater. The
  combinator is required: a bare prefix test would make `.pf` "contain" `.pf__body`, a BEM
  sibling, and the check would fail on a correct stylesheet.
  Its blind spot is stated in its own comment: containment that exists only in the DOM.
- **`obsidian.1` extended.** It is a FLOOR (it filters for MISSING names), so adding the four
  cannot break it — but a load-bearing token that no check pins is a token a later run deletes
  without noticing, so all four join its list.
- **`rim.1`** is written here and **held to M228**, where the pair is applied: a check that
  requires a surface to USE the pair cannot be satisfied by a milestone that changes no surface,
  and writing it to pass vacuously is worse than landing it one milestone later.
- **check 11 (contrast)** re-run after the token change. It reads six-digit hex only, so the four
  new rgba/shadow tokens are not measured — that is stated, not assumed.
- **`theme.1`** — parity across both blocks.
- **`verify:visual`** — zero drift.

## Acceptance

`node scripts/verify-styles.cjs` green including `depth.1`, and `verify:visual` reporting every
scene unchanged within both budgets.
