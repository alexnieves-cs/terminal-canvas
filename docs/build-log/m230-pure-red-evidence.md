# M230 — red-first evidence

Six checks (`edge.flow.1` … `.6`) were appended to `verify:viewport` and watched failing against
a `src/shared/edge-activity.ts` that **did not exist**.

```
FAIL edge.flow.1 ... — "no edgeActivity export"
FAIL edge.flow.2 ... — {"fired":"no-entry","blocked":"no-entry", ...}
FAIL edge.flow.3 ... — "no edgeActivity export"
FAIL edge.flow.4 ... — {"stale":"no-entry","malformed":"no-entry","ghostSize":null}
FAIL edge.flow.5 ... — {"t0":null,"tMid":null,"tEnd":null}
FAIL edge.flow.6 ... — "no edgesAnimate export"

142/148 passed
```

**142 of 148 still passed, and that is the point of the wrapper.** `viewport-entry.cjs` requires
the new module inside a `try`, like its two neighbours, so a suite run against a missing module
fails six checks BY NAME instead of throwing. A check that throws aborts the run, every check
below it never executes, and its RED is then not evidence of anything — `docs/verify-suites.md`
names this as one of the five rules that fail silently if unknown.

## The two fixtures that were wrong, not the model

Red-first earns its keep twice here, in a way that is worth separating: the first failures found
bugs in the **checks**.

**`edge.flow.3`, first cut.** It seeded a 50 ms-old arrival and expected `waiting`; it got
`arrived`. The model was right — `arrived` and `waiting` are *sequential*, not competing. The
edge reports the arrival for `EDGE_ARRIVE_MS` and then settles into breathing while the join is
still owed. The fixture was asking the wrong moment. The same line also expected `c:d` to be
`armed` while leaving `d` out of the armed set.

**`edge.flow.6`** inherited both mistakes from the same fixture.

Neither was a case of bending a test to fit the code: in both, the model's answer was the one
the design called for and the fixture described a situation that cannot occur.

## The ambiguity in the brief, resolved and recorded

`edge.flow.3` then failed a third time on a real design question. The brief says of a waiting
join: *"armed edges breathe at `--dur-breath`; unarrived edges stay at rest."* But `rest` is also
the name of a state in the same six-state table.

Read literally, the undelivered edge `b:c` is `rest`. But `b:c` runs between two panels inside a
**live run**, and `rest` means "no signal at all" — calling it rest contradicts `armed`'s own
definition and would draw the edge as though the run were not running through it.

**Resolved: "stay at rest" means "stay STILL"** — which is what the sentence contrasts with
"breathe". `b:c` is `armed`: lifted and static. This is strictly more informative than the
literal reading, because it keeps three answers apart where the literal one offers two:

| the edge | reads |
|---|---|
| delivered, join still owed | breathing |
| live but not yet delivered | lifted, static |
| not in this run at all | quiet |

The check asserts all three, including a fourth fixture with no armed set at all, so the
distinction cannot silently collapse later.
