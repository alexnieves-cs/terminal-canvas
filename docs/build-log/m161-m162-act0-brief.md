# v8 Act 0 — the baseline and the brief (M161–M162): build log

Branch `m161-polish-brief`, 2026-09-07, from `7049dab` (`v4.0.0`). Spec:
`docs/superpowers/specs/2026-09-07-v8-act0-baseline-and-brief-design.md`. Plan:
`docs/superpowers/plans/2026-09-07-v8-act0-baseline-and-brief.md`. The brief:
`docs/superpowers/specs/2026-09-07-m162-product-polish-brief.md`. Ledger:
`docs/build-log/m161-m179-ledger.md` (the evidence lines live there, not here).

## M161 — baseline

The chain over `7049dab`'s source: every suite green except `verify:panels:product` 58/59
(`browser.1`, `live: false`), which was 59/59 alone a minute later — the load flake, recorded.
`verify:packaged` 12/12. `verify:visual` unchanged 57/57 at 166.5 s. All 55 goldens read; the
walk's twelve findings joined the prompt's ten in the brief.

## M162 — the brief and the face rule

The brief measures the three references (the 72ch measure, 14px/1.5 prose, the 20px inset,
the three radii, the two ramps), states the five rules as what a check can read, disposes of
twenty-two findings (three declined: 13, 18, 22), and declares four tokens.

**Red first.** `verify:styles face.1` — a closed PROSE list; a rule naming one of them and
setting mono fails. 33 hits at 4.0. `polish.1` — the tokens. `check(m162)`.

**The sweep.** Thirty rules. The four mono ANCESTORS were the point: `.chat__transcript`
(every sentence the agent wrote had inherited mono since M73), `.diagnostics-overlay`,
`.panel__card` and `.subagent-ambiguous` dropped the declaration; the leaves that hold code
opted in by name (`.chat__tool-input`, `.chat__tool-result`, `.panel__card-line`,
`.skill-card__facts`, and the palette's mono-row hint, which is a cwd — the first cut had
swept it too, and the palette diff showed a path in a proportional face). `--bubble` joined
check 11's grounds. The wordmark stays mono until M174 rebuilds the launcher.

**The harness fact.** The first `verify:visual` after the sweep failed every 1440-wide scene
as `the size changed — 1440x865 → 1440x864`. Not the CSS: macOS clamps a 900px window to the
display's work area at creation, and the Dock's state moved the content height by one pixel.
`shot.cjs` pins `setContentSize(1440, 865)` after creation. Detail in the ledger.

**Goldens.** 37 scenes changed; each read, each with the critic's sentence in the ledger
before `UPDATE_GOLDENS=1`.

## Reviews

Both ran over the act's diff, the brief, the spec, the ledger and the logs, after the goldens
landed; everything below is in the ledger with the evidence beside it.

**Critic — FIX-FIRST, 0 Critical, 4 Major, 8 Minor.** The Majors: the ledger's filename
satisfied `milestones.1` for seventeen rows ahead of the work (a ledger is no longer a log;
the README rows are the acts' to add); `face.1` matched any compound and would have refused
the code leaf the brief prescribes (subject arm + ancestor arm); the tool argument's class
had put a Task description in mono (`toolArgumentIsCode`, `chat-model.6`); the M162 evidence
lacked exit codes and a plain pass against the rewritten goldens. Two Minors turned out to be
harness facts worth their sentences: the title bar is 32px and a `setSize` after creation is
never clamped, so `resize` pins `h − 32`; and the fixture directory's per-run name was a flake
source in three scenes (now a fixed name). The rest: rule 5's check, `CLAUDE.md`'s
re-valuation sentence, the diagnostics export path, four more names in the list.

**Verifier — 25 claims: 21 SUPPORTED, 3 OVERCLAIMED, 1 UNSUPPORTED.** The overclaims were
counts and a duration ("thirty" rules is ~33; "a minute" was three); the unsupported claim
was the update run it could not see finish. Each is corrected in the ledger.

**Goldens after the wave:** nine more scenes, each sentenced; a plain `verify:visual` 57/57.
