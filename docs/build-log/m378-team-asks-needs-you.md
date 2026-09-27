# M378 — the team's asks in Needs you: Allow once, Deny, whose agent, and the progress

**Verdict: shipped.** M377 gave a teammate's machine the list and the answer. This puts
them where a person already looks for what waits on them. Below whatever waits on this
machine, the Needs-you popover has a section **Your team is asking · N**. Each row says:
- whose agent it is (`sam's agent · tests — api`), with a jump to its placeholder on this
  canvas;
- the whole line it would run, wrapped and never cut;
- how far the answers have got;
- how many secrets were hidden before it left their machine;
- how long it has waited.

**Allow once** and **Deny** answer it here. The dock's badge counts the team's asks
beside this machine's.

## What landed

- **`renderer/shell/useTeamAsks.ts`** (new): one store over main's push and a first read.
  An answer given in any surface leaves every surface in the same frame. It comes back if
  main refuses, and the refusal says why (the Dock's `onTeamAskRefused`, Canvas's
  `notifyRefused`).
- **`teamAskWords(row)`** (`shared/team-asks.ts`):
  - `who`: whose agent, by presence's name or "A teammate", never an id;
  - `action`: the tool and its line;
  - `progress`: "one person's allow decides it", or "1 of 2 allowed — spend past the
    team's line needs two people";
  - `scrubbed`: the count of secrets hidden.
- **`Dock.tsx`**: the section, and the badge's count and its label.
- **`styles.css`**: `.team-ask__action`, the whole line wrapped, never ellipsed, and the
  verbs' row.
- **The `team-ask` shot scene**: two asks pushed as main would push them. The answers are
  hit-tested as painted.

## Decisions, and why

- **A section of its own, not a task group.** Needs you groups decisions by task (M318),
  and a teammate's agent's ask belongs to no task on this machine. Folding it into a group
  would invent a task. Its jump still lands on the agent's placeholder.
- **The line is never cut on screen.** M376 sends nothing longer than a teammate can read
  whole. An ellipsis here would hide the tail a reviewer needs, the same reason the
  approval detail shows a command in full (#17).
- **The badge counts them.** A team ask waits on anyone who may edit the canvas, this
  person included. A badge that stayed at 0 while a teammate's agent waited would be the
  silence the attention queue exists to prevent.
- **Allow ONCE.** A standing grant on someone else's agent is not a teammate's to give
  (M375).

## Checks

- `verify:canvas-sync team.words.1`: whose agent, by name or "A teammate"; the whole line;
  both progress sentences; the scrub's count only when there was one. 84/84.
- `verify:rail` 257/257 and `verify:styles` 81/81 hold the section to the house rules.

**Visual.** The first full shot run showed a defect before any critic did. The row
wraps (M76's `.rail-attention`), and the first ask's short line sat BESIDE its label,
squeezing "sam's agent · tests — api" to "sa…". Now each part of a team row (the jump,
the line and progress, the answers) takes the full width. `styles.css` says why beside
the rule.

- **The critic's round, on the full `npm run shot` image and a 2x crop: Matches
  intent.** "The 'YOUR TEAM IS ASKING · 2' header sits directly below the
  already-answered 'Watchdog fires under load' decision, as specified. Each row
  correctly names whose agent is asking — 'sam's agent · tests — api' and 'sam's agent ·
  relay · shell' — each with a teal 'jump' link at the right, fully visible and not
  clipped. Both commands render in monospace on their own line and are fully wrapped
  rather than truncated … the bearer token correctly showing '[redacted bearer token]'
  instead of a real secret. … Each row ends with 'Allow once' (neutral) and 'Deny' (red
  outline) buttons side by side — no standing 'always allow' option appears anywhere.
  … The dock's notification bell (bottom-left) shows a badge reading '2', consistent
  with the two pending team asks."
- **Its one nit, kept:** the long URL breaks mid-word ("…canvas/rele" / "ases"), from
  `overflow-wrap: anywhere`. It is readable and never cut. Breaking only at a slash would
  let a long unbroken token overflow the popover, which is the worse failure.

`UPDATE_GOLDENS=1 npm run verify:visual` wrote `team-ask.png` alone. Every other scene
stayed inside both budgets. `starter` is red on purpose, as it has been since M299. The
written golden was cropped at 2x and read: it is the state the critic judged.

## Gate

At this commit: `npm run typecheck` is clean and the plain suites this milestone reaches
are green (see Checks). The full `npm run verify` ran once for the team-queue chain
(M375–M379) on the tree holding all five; its result is in M379's ledger.

## Owed

- **The owner's `waiting`, said where Allow was pressed.** Past the line, the owner's own
  allow is one of two, and the request stays pending. Today the owner's permission row
  records "Allowed" for it. The approval detail should say "1 of 2 allowed — waiting for
  a teammate".

Next: M379 (the team's asks in the palette).
