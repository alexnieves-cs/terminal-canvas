# M47 — One panel frame

**Status:** designed 2026-09-01. Adopts §5 of the "M23" interface-
architecture spec; semantic zoom (§6) is deferred to M57 per the scope
amendment, which deprioritised it.

## What this milestone is for

Five panel kinds ship five hand-rolled headers. Each "reuses `.panel` for
its box, its chrome and its resize" and then declares its own heading,
refresh control, note line, list and summary — `__summary`, `__refresh`,
`__note`, `__more` and `__body` each exist three times as near-duplicates,
which is the kind that drifts. A sixth kind would be a sixth copy.

## Decisions

1. **`PanelFrame`, one component, one `.pf-*` namespace.** The box (border,
   radius, elevation, state accent), the chrome (state dot or kind glyph,
   the honest-chain title — ONE implementation — a kind-supplied meta line,
   kind-supplied actions, then close), the body, the resize handles and the
   link ports. A kind supplies a meta line, a body, an action list and its
   close arming rule; it supplies no heading, refresh control, note, summary
   or `+N more` — those become `.pf__note`, `.pf__summary`, `.pf__more`
   once.
2. **`.pf__body` is never transformed**, and the rule is written beside it:
   a transform on the subtree hosting xterm changes what
   `getBoundingClientRect()` reports while `dimensions.css.cell.width` stays
   transform-blind — exactly the arithmetic `pointer-correct.ts`
   compensates for. Nothing in this milestone transforms chrome either
   (#60 is cut); the rule exists for whoever tries.
3. **Kind accent from existing doctrine**: terminal → agent-state colour;
   review and toolbox → `--iris`; file → `--fg-3`; jira → `--blue`. No new
   colours.
4. **One status dot.** `PanelStatusDot` keyed on `data-agent-state`,
   replacing the five selector lists that repeat the four state colours;
   `.panel--agent-wants-you` keeps `border-color: var(--amber)`
   untransformed.
5. **Every existing class and `data-*` a check selects on is kept** as an
   alias on the frame's elements for this milestone (`.panel`, `.panel__chrome`,
   `.panel__title`, `.panel__close`, `.panel__slot`, `.panel__card`, the
   `review-node__*`/`file-node__*`/`toolbox-node__*`/`jira-node__*` hooks),
   so the ~200 end-to-end checks keep their selectors; the duplicates are
   deleted from the STYLESHEET, not from the DOM contract.

## Verification

- `verify:styles` `frame.1`: the five duplicated families are one rule
  each (a count of `__summary`/`__refresh`/`__note`/`__more`/`__body`
  declarations).
- `verify:panels` `frame.1`: all five kinds render through `.pf`;
  `frame.2`: `.pf__body` carries no transform at any scale, asserted as
  source text AND through `__m4aCellToScreen` at a scale ≠ 1; every
  existing check green unchanged.
