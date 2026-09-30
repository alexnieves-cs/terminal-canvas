# M396 — Critique, one fix batch, the gate

The closing milestone of the canvas run (prompt:
`docs/superpowers/specs/2026-09-29-canvas-revamp-flowchart-prompt-opus55.md`; state and
decisions in [m388-m396-ledger.md](m388-m396-ledger.md)). Every critic here had fresh context and
was told to break what it looked at, not to review it kindly. Each finding that was fixed has a
check that fails without its fix.

## The boundary: two rounds

The flowchart added two doors that cross the product's boundary rules: text leaving through
`outward` (Mermaid, SVG) and a file entering by a path an agent can name (`flowchart:read`).

**Round one** (five findings, all fixed, commit f00edaa4):
- *HIGH.* The renderer built the SVG and main gated its text, but the builder wraps a long word
  across `<tspan>`s, so a token left in pieces the scrubber no longer matched, and the count
  said fewer secrets than had left. Main now builds the SVG from the model after each label
  has crossed the gate whole.
- *MEDIUM.* The ```mermaid fence regex backtracked for minutes on an unclosed fence followed by
  blank lines, which a paste could trigger. It is now a capped, linear line check.
- *MEDIUM.* A group's label reached the shared canvas unscrubbed, and an imported subgraph names
  one. It is now scrubbed like a title.
- *LOW.* The SVG tripwire missed `<style`, `url(`, `<set`, `<animate` and `@import`.
- *LOW.* `flowchart:read` followed links, and a refusal quoted the file's first line.

**Round two** (a second critic, told to break the fixes). All five held, and it found what the
first fix had itself broken (commit 0bf1e0f0):
- *MEDIUM.* Moving the SVG builder into main moved the A* router with it. Exporting a
  cap-sized chart blocked main, and every PTY with it, for 69.5 s, and an agent line could
  trigger that without a click. The renderer now sends route POINTS and main draws them
  (`pathFromPoints`); the same chart takes ~1 s.
- *MEDIUM.* The Mermaid door had round one's defect in another form: `<br/>` split
  `Bearer\n<token>`. Mermaid is now built in main from the graph as well.
- *LOW.* Caps ran before the scrub. The order is now scrub first, then cut; group names are
  cut at a word boundary.
- *LOW.* The read ran stat and read by name, so the file could be swapped for a FIFO or
  `/dev/zero` in between. It now uses one `O_NOFOLLOW | O_NONBLOCK` descriptor with a bounded
  read.

No third round was run: each finding has a check (`flowchart.files.13–20`,
`flowchart.mermaid.28–29`, `cs.flow.10`).

## The picture: two rounds

**Round one** (a fresh critic; 21 before/after composites plus the three new scenes). It rated 9
scenes BETTER, 6 SAME and 2 WORSE (compact and flip: the centred pill ran under the HUD once
Create joined it). `flowchart` and `flowchart-far` were GOOD, and `flowchart-dark` was NOT
READY: handles looked like ports, the live chip was louder than the label, and the inspector
was ragged. The one fix batch (commit c9d7a0fc):
- The pill steps left only when it would reach the HUD, by a measured `--pill-shift`, so it
  keeps its centre everywhere else and no other golden moves.
- The HUD yields to an open menu, as the pill already did.
- Create keeps its word at every breakpoint.
- Far names clip at their end and never mid-glyph: `safe center`, capped to the card with `cqh`.
- Shape handles are squares, and ports sit outside the outline.
- The live chip is the header's own badge (dot + word), sized with the shape.
- Far outlines take the connectors' ink.
- The shape inspector:
  - row labels are caps, on their own line, over one swatch grid;
  - fills are painted whole;
  - Arrange, Export and Work are separate rows;
  - no FORM/LABEL rows repeating the heading, no `not measured` Process metrics, and no grey
    `● shape` in the state slot.
- `iris` is retired as an authored line colour (D13).
- The needs-you pill is opaque.
- The Panels list no longer reads `no panels` beside a chart.
- The merged and zoomed-out cameras frame everything first, then pull back.

**Round two** (the confirm round) — see the ledger's golden sentences.

## Declined, with reasons
- **Hiding the inspector's Work / Tools / Activity tabs for a shape.** The critic is right that
  they have little to say about a box. But hiding tabs per kind changes the Tabs primitive's
  contract for every kind, so it is owed rather than done here.
- **Margin labels dropping under far cards.** A margin label is authored, and its placement is
  the person's.
- **A summary card saying its state twice.** Real, but pre-existing, and part of the card, not
  this run.
- **A live terminal's header text at the block tier.** The live-terminal rule keeps its title.

## The gate
See the ledger (reds split into this run's and the known baseline).
