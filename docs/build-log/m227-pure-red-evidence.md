# M227 — red-first evidence

`depth.1` (and `rim.1`, which lands in M228 where the pair is APPLIED) were appended to `scripts/verify-styles.cjs` and watched FAILING against
the stylesheet as it stood at `2e82b4b`, before `--glass-0`, `--glass-3`, `--rim` or
`--rim-inner` existed anywhere. The failures name the ABSENCE, which is the point: a check that
went green on the untouched file would have been measuring nothing.

```
$ node scripts/verify-styles.cjs
FAIL depth.1 the glass ramp declares all four levels in both theme blocks and elevation is
             monotonic — a surface sits on --glass-N only inside a surface below N
       {"declared":[1,2],"surfaces":6,"inversions":[]}
FAIL rim.1 the rim pair is declared in both theme blocks, both halves are used, and no one
           surface wears both
       {"both":false,"rimUsed":false,"innerUsed":false,"wearsBoth":[]}

56/58 checks passed
```

Read the details, not just the words. `depth.1` reports `declared: [1, 2]` — the two levels
M109 shipped — and `inversions: []` over the six glass-bearing surfaces that exist today, so
the ramp half of the check is red for the right reason and the monotonicity half is already
true and will stay observable as surfaces are added. `rim.1` reports all three of its arms
false, so nothing about it is passing by accident.

**Why these two shapes.** `depth.1` is a containment test over selector TEXT — for every pair
of glass-bearing rules where one selector begins with the other followed by a combinator, the
descendant's level must be strictly greater. The prefix test requires a combinator
deliberately: a bare `startsWith` would make `.pf` "contain" `.pf__body`, which is a BEM sibling
and not a descendant, and the check would then fail on a correct stylesheet. What it cannot see
is containment that exists only in the DOM — a class that only ever renders inside another but
never says so in a selector. That hole is stated in the check's own comment rather than left
for a later reader to discover.

`rim.1`'s third arm — no surface wears both halves — is the one that will actually catch
something later. Declaring the tokens is easy to get right; putting a lit top edge and a
recessed inset on the same element is the 2008 bevel, and it is the kind of thing that arrives
one selector at a time.

**`rim.1` is held back to M228 deliberately.** M227's whole point is that the token layer is
INERT until it is spent — tokens land alone so `verify:visual` proves zero golden drift — and a
check that requires a surface to USE the pair cannot be satisfied by a milestone that changes no
surface. Landing it here would mean either a red suite at M227 or a check written to pass
vacuously, and the second is worse than the first. It ships red-first in M228 against the
un-applied stylesheet, which is the same evidence one milestone later.
