# M248–M250 ledger

One line per milestone, with its evidence. Spec/plan per milestone under `docs/superpowers/`.

- **M248 — deck** (branch `m248-deck`, from 7a3323d0). A `kind: 'file'` panel with `source.deck`;
  generic `shared/draft-review.ts` (M246's API); per-slide LCS diff and staged proposals from the
  agent/workflow doors; presenter overlay; `export:deck-pdf`. Evidence: `verify:deck` 44/44 (split,
  diff, keep/discard/conflict, generic draft on non-slide items, record copy sites, portable strip,
  slide-grammar option, PDF core, real-file session, origin plumbing); `verify:canvas deck.pdf.1`
  a 4-slide deck → a 4-page PDF through the real hidden window; `verify:ipc` at 135 channels;
  `verify:verbs` 25/25 (four doors for five verbs + the deck creation entry). Fresh-context critic:
  3 must-fix (presenter crash on a shrinking deck, front matter swallowing a `# Title` slide, the
  card/Present showing an unkept proposal as the deck) and 7 should-fix (inline-backtick fence, `r<n>`
  ids renumbering after a keep, alive-gated view loss, a door opening Present, untested origin
  plumbing, cached image misses, mid-line image insert) — all fixed with checks `deck.split.6–.7`,
  `deck.keep.5`, `deck.origin.1`. Also fixed three reds M244 left at 7a3323d0: `verify:styles`
  4–6 (literal px → scale tokens), `verify:palette sheet.1` (creation rows displaced `New panel…`),
  `verify:meta milestones.1` (no README row for M244).

  **Electron-tier reds, classified against a clean 7a3323d0 build** (scratch checkout, same
  machine, each run logged with the foreign `Electron scripts/verify` pids at start and end; other
  sessions ran Electron outside the shared lock for most of the afternoon):

  | Part | Red | Class | Evidence |
  |---|---|---|---|
  | panels:shell | 98, 98b, 106 | pre-existing | red on clean baseline 17:55 and 18:57 (no foreign Electron) and on m248 clean 18:58 |
  | panels:shell | 126, 127 | pre-existing | red on clean baseline 18:57; green on m248 clean 18:58 (flaky) |
  | panels:shell | 77 (Fit not idempotent) | contention | red on m248 only while m246/m245 ran Electron; green on m248 clean 18:58 |
  | panels:kinds | broadcast.1 + watchdog | pre-existing | identical on clean baseline 19:04 and m248 clean 19:09 |
  | panels:agents | attention.1 | pre-existing | red on clean baseline 19:02 and 19:17 |
  | panels:agents | search.1 | pre-existing (flaky) | red on clean baseline 19:17 and contaminated 18:17; the part's `headroom.1` is at 100% of its watchdog on the baseline |
  | panels:agents | memory.2, approve.2 + cascade | contention | seen once each under load; absent from m248 clean 19:14 |
  | panels:product | work.action.1, review.task.2 + watchdog | pre-existing | red on clean baseline 19:05 and m248 clean 19:10 |
  | panels:product | onboarding.start.1 | pre-existing (flaky) | red on baseline 18:18; passed baseline 19:05; the recorded reply's spawn never arrives (`spawns [0,0]`) |

  **Final gate** (`npm run verify`, 19:19–19:29, no foreign Electron at start): 37/41 suites; the
  four red parts are panels:shell/kinds/agents/product, and every red in them is a pre-existing row
  above (98, 98b, 106, 126, broadcast.1 + watchdog, search.1, attention.1, onboarding.start.1).
  Nothing M248 added or touched is red; the gate is NOT green at 7a3323d0 either.

  Deferred: `asset:` image ids (the insert writes the stored path instead); opening an existing
  `.md` as a deck; plan-line text is whitespace-collapsed, so indented Markdown cannot be proposed
  through `tc plan` (the verb hint names `\n`). Declined: an electronegativity ACCEPTED row — none
  was raised for the second window.
