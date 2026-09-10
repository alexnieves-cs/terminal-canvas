# M234–M236 — Act III: the chromeless terminal

The v11 visual run's third act. Resumable state:
[`m225-m243-ledger.md`](m225-m243-ledger.md). Red-first evidence for the act's one dangerous
check: [`m234-pure-red-evidence.md`](m234-pure-red-evidence.md). Branch
`m225-visual-baseline`. Nothing pushed.

---

## What shipped

| # | What landed |
|---|---|
| M234 | `chromeless.resize.1` written first and watched failing against a deliberately naive implementation; the chrome made absolute over the body; `chromeless.paint.1` for the lifted surface |
| M235 | the frame at rest — the scrim, the name at low emphasis, the controls on hover |
| M236 | the frame rule with its per-kind exception list, in `styles.css` and `CLAUDE.md` |

## The hazard, and why it needed a check of its own

"Content runs to the edge" has an obvious implementation — collapse the chrome's box at rest —
and it is the wrong one. The body grows by the chrome's height when the cursor arrives, xterm
refits, and a **SIGWINCH goes into the running agent**. On every mouse-over. There is no
exception, no visible error, and no other suite turns red; the agent simply gets told its
terminal changed size, repeatedly, by a cursor passing over a panel.

Built naively on purpose, the check measured **458 → 422 → 458 px** across one hover. With the
chrome absolutely positioned it reads 458 → 458 → 458.

## Three checks, three ways of being wrong first

The act's real lesson is not the CSS. Every check in it was wrong before it was right:

- `chromeless.resize.1` **threw** on its first run (a harness helper takes the `wc`), which
  aborts the suite and takes every check below it — `docs/verify-suites.md` names exactly this,
  and it happened anyway.
- It was then **vacuous**: it hovered a SELECTED panel, whose chrome is shown at rest anyway, so
  the hover changed nothing and it passed against the very implementation it was written to
  catch. Fixed by deselecting first, and by adding a MECHANISM arm beside the EFFECT arm.
- `rim.paint.1`, from M228, **collected**: the frame's specular edge fell to 0.79 from 15.72 the
  moment the chrome was lifted, because the chrome is what draws it. Its M228 comment had said
  Act III was where it would matter.

## Two design decisions

**The scrim is the terminal's own ground.** The first cut faded from `--chrome-bg`, which is
translucent glass — so the agent's first line printed straight through the panel's name and
neither could be read. Painting the scrim in `--well`, the colour the terminal is already
showing, means the band under the name reads as empty terminal rather than as a tinted overlay
laid on top of one. Text scrolls out from under the title the way a large-title header works
everywhere else, and what it obscures is the OLDEST visible row, never the newest.

**A chromeless terminal has no well recess.** `--rim-inner` sinks a screen into a housing; with
the body starting at the frame's own top edge there is no housing left, and the recess would be
drawn underneath the scrim where nobody can see it. `well.paint.1` is retired with that reason
written at its site rather than deleted quietly — `--rim-inner` keeps its other sites, and
`rim.1` still fails if no surface wears it.

## The frame rule

A kind is **chromeless** when the object IS its content, and **keeps its header** when the
header carries a fact the body does not repeat. The test is not how much chrome there is; it is
whether removing it hides information. The per-kind list lives beside the rules it governs in
`styles.css`, and the rule is in `CLAUDE.md`: a rule that is silently per-kind is how the frame
drifted before M47 unified it.

## The act's closing red: a check that contradicted its own milestone's fix

`chromeless.paint.1` failed at the end of the act with `onTop: false`, and the implementation was
right. The arm asserted that `elementFromPoint` at the `⋯` lands inside the chrome, **measured at
rest** — while the fix for the `type.1` click regression had, hours later, established the
opposite contract at rest: the chrome takes no pointer events until the panel is hovered, focused
or selected, so the cells underneath keep every click.

The check now reads the same button at the same point in both states and asserts the answer
differs — `onTop:false / hitsBody:true` at rest, `onTop:true / hitsBody:false` on hover. The pair
is the contract; neither half states it alone. It also brings the `type.1` guarantee to the site
of the rule that constrains it, instead of leaving it held by a check about font metrics.

Full detail, the four rebaselined goldens with their sentences, and the forced `compact` golden
are in [`m225-m243-ledger.md`](m225-m243-ledger.md).
