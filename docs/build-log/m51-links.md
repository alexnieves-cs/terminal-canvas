# M51 — Cmd-click a path or URL

**Status:** finished 2026-09-02.
**Branch:** `m51-links`. **Spec:** `docs/superpowers/specs/2026-09-01-m51-links-design.md` (written this
session). **Plan:** `docs/superpowers/plans/2026-09-01-m51-links.md`.

One line: the hover half of pointer correction first, then a link provider that underlines paths
and URLs and opens them on Cmd-click through main.

## What landed

- `xterm-pointer.ts`: a hover is corrected against the slot under the cursor, per event.
- `shared/link-scan.ts` (pure): `findLinks` — URLs and paths with `:line[:col]`, trailing
  punctuation excluded.
- The link provider in `session-factory.ts`: underline and pointer on hover, Cmd-only activation,
  `data-link-hover` on the host; `link:open` (contract, preload, handler with an inert default),
  `main/link-open.ts`'s pure `resolveLinkOpen`, main's opener through `shell`.
- Checks: `verify:viewport links.1`, `verify:tmux link-open.1`, `verify:panels hover.1`
  (fault-injected) and `links.1`.

## Snags

- `hover.1` and `links.1` passed on their first run against the implementation — they were
  written and the code landed in one pass — so they were watched red afterwards by building with
  the hover correction removed. Recorded rather than hidden: the order was wrong, the evidence
  is not.
- Opening AT a line is not done: `shell.openPath` opens the file in its default app; the
  result's reason names the limit.
