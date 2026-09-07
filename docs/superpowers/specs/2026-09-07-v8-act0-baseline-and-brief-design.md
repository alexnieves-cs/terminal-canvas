# v8 Act 0 — the baseline and the brief (M161–M162): design

The run prompt is `2026-09-07-v8-product-polish-prompt.md`; the brief is
`2026-09-07-m162-product-polish-brief.md`. This spec is what Act 0 does to the CODE.

## M161 — baseline

Nothing changes. `npm run verify` and `npm run verify:packaged` at `7049dab`'s source, the
tallies into the ledger; `npm run verify:visual` once with nothing changed, to prove the
harness stable (every scene PASS against its own golden); every golden opened and read.
A red under the full chain that is green alone is a load flake and is recorded as one, not
fixed.

## M162 — the brief, and the two rules that can be read from the stylesheet today

The brief's five rules; two are mechanical NOW and land here, red first:

- **`verify:styles face.1`** — a closed PROSE list of selectors. A rule whose selector names
  any of them and whose body sets `var(--font-mono)` (or a bare `monospace` family) fails.
  Watched red against the 4.0 stylesheet (the launcher's title, the chat transcript, the
  rail's verbs and the rest of the brief's inventory), then the sweep: each such rule set to
  `var(--font-ui)` or the declaration removed so the body's default applies; a mono ANCESTOR
  (`.chat__transcript`, `.diagnostics-overlay`, `.panel__card`, `.subagent-ambiguous`) drops
  its declaration and the leaves that hold code (`.chat__tool-result`, the card's summary
  line, a subagent's type slug, the diagnostics' values) opt in by name.
- **`verify:styles polish.1`** — the brief's four M162 tokens: `--bubble` in both theme
  blocks (six-digit hex, so check 11 measures it — `--bubble` joins that check's grounds);
  `--measure`, `--t-base` and `--inset` on bare `:root`.

Not here: the rest rule (`rest.1`, M163), the metrics rule (`metrics.1`, M163), the path
rule (`path.1`, M164) — each is red-first in the milestone that changes the code it reads.

## Goldens

The face sweep moves text in every scene that shows the launcher, a chat, the rail's verbs or
a mono-ancestored note. Each changed scene is looked at and given its sentence in the ledger
before `UPDATE_GOLDENS=1`. The chat's SHAPE (the caps labels, the tool rows) is Act II's; this
milestone changes only its face.

## What this act declines

Nothing by finding number: every one of the brief's 22 findings is assigned to a later
milestone or declined there with its reason (13, 18, 22).
