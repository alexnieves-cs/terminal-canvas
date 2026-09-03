# M72 — The two documents

**Branch:** `m72-documents`. **Status:** finished 2026-09-03. No code.

## What landed

- `docs/superpowers/specs/2026-09-03-v2-product-thesis-and-design-brief.md` — what the
  application is for now that a node need not be a terminal; who it is for; a day with it;
  what it replaces; what it refuses to be (a chat app, a browser, an IDE, a hosted product, a
  cloud of agents); and the design half, which EXTENDS the 1.x brief rather than replacing it:
  principles 10–13 (three natures — conversation, document, process — carried by the frame;
  one vocabulary whichever front-end produced it; the transcript as a well, the terminal's
  typographic peer; edges that say what they do and a workflow legible at the far view), plus
  the kind glyphs, tones and verbs the new kinds need.
- `docs/superpowers/specs/2026-09-03-v2-scope-decision.md` — M71–M95 in order with a
  definition of done each, in four acts; every open backlog entry decided; the five surfaces
  the run is judged on named (M73, M76, M78–M80, M81, M84) and the version rule tied to them;
  the web panel declined in writing with the three answers weighed, retiring #9 tier 3 and
  #14 tier 3; the third `AgentKind` reshaped into a second headless backend (Codex is
  installed with `codex exec`); "same agent, two front-ends" moved ahead of the composer; the
  broker moved ahead of GitHub.

## Decisions worth reading before re-litigating

- **Kept, not replaced.** The 1.x brief's nine principles are still what the critic gets; the
  new document adds the four the new kinds need. Replacing it would have re-derived nine
  decisions that M63–M69 already paid for.
- **The count is kept and said to be padded in three places** (M72, M91, M94 are documents
  or decisions). The run is judged on the five surfaces; §1 of the scope decision says so.

## Verification

- `npm run verify:meta`: the README milestone row and this build log agree (`milestones.1`);
  no code changed, so the rest of the chain is as M71 left it (green, exit 0, run alone).
