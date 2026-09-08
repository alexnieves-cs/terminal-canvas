# Act VIII — the audit and the finish (M191–M192)

The v9 run's last act, on `v9-act8-finish`.

## M191 — the third UX audit

Two fresh-context critics walked all 57 committed goldens — a disjoint half each, including the
scenes nothing in this run touched — against the 5.0 brief and CLAUDE.md's face, rest, path,
metrics and words-not-codes rules. They returned 34 findings between them.

Thirteen are fixed at their surface and thirteen goldens' worth of scenes changed with them.
Twenty-one are declined BY NAME in `docs/build-log/m180-m200-ledger.md` under `## M191`, each
with the rule it cites and the consequence of leaving it: most are older surfaces whose fix is a
milestone (a collapse that should card its members, a `⋯` menu that should carry verbs, a
minimap that should not overlap chrome), and one — `palette-dark`'s chrome rendering light — is
recorded as owed WITH a hand check rather than re-baselined, because a blind re-baseline is the
one thing the golden rule forbids.

## M192 — 5.0.0

The version, the release notes (`docs/release-notes/5.0.0.md`), README's status line and
`CLAUDE.md`'s opening and `## What it is` section reconciled to what 5.0 actually is, the
getting-started guide, and the three verification commands.

| Command | Exit | Result | Log |
|---|---|---|---|
| `npm run verify` | 0 | 38 suite tallies, no FAIL line | `out/v9-evidence/final-verify.log` |
| `npm run verify:visual` | 0 | 59/59, after thirteen goldens changed with their sentences | `out/v9-evidence/final-visual.log` |
| `npm run verify:packaged` | 0 | 12/12 | `out/v9-evidence/final-packaged.log` |

`npm run package` produced the unsigned `.app` and `.dmg` in `release/`. The tag `v5.0.0` is
LOCAL. Nothing was pushed, no GitHub release was created, and no remote object of any kind
exists for this run.

## What a person still owes

The list is in the ledger's closing section and in `docs/load-bearing.md`'s manual-only entries.
The ones this run added: a timed first-run trial by a beginner (installation and sign-in delays
are real and no suite can feel them); a real dev server behind the preview's discovery (no suite
starts one, by the same rule that keeps the network out of `verify`); a look at `palette-dark`
in the running app; and the Gatekeeper right-click on a freshly built `.dmg` on a machine that
has never seen this app.

The chain's tallies, in order:

```
14/14 39/39 56/56 141/141 6/6 12/12 38/38 252/252 18/18 15/15 7/7 143/143 194/194 98/98
27/27 91/91 103/103 26/26 7/7 35/35 27/27 141/141 23/23 25/25 4/4 26/26 13/13 10/10
63/63 4/4 1/1 6/6 11/11 78/78 96/96 49/49 80/80 77/77
```
