# M349 — agents as roster citizens: a teammate's agent is a WHO, beside its owner

**Verdict: shipped.** Arc 2.1. Until now a person's agents reached the room only as a fold
into that person's status: one dot on their tile, `working` or `needs you`. Nothing said
WHICH agent, how many, or what each was doing. Each of a person's agents now rides their
presence payload and stands on the roster strip beside them. Its tile is a circle, ringed
(never filled) in the owner's colour, shows the agent's initial in its own state's tone, and is
named in full for anyone who points at it: "claude — tests — sam's agent, working".
Built 2026-09-26 on local `main` on top of M348.

## What landed

- **`PresenceAgent`** (`shared/presence.ts`): `{ id, name, status }`, the panel's id on its
  owner's machine, a SCRUBBED short name, and its state. `PresencePayload.agents` holds at
  most `PRESENCE_AGENTS_MAX` (12). `parsePresence` bounds it on receipt: the count and
  the name length are capped, and a malformed or status-less entry is dropped (never the
  whole payload).
- **The hub publishes them** (`presence-hub.ts agentsFor`): every panel in the room with
  an agent state, in canvas order, named by the panel's title through `redactSecrets` (a
  person's own words leaving the machine: the outward gate's scrubber, the same one
  `currentTask` already passes). The republish key now includes each agent's state. The
  fold alone did not change when a second agent started while one already worked, so
  that change was never sent.
- **Titles reach the hub** (`presence-wiring.ts`): `workspaces()` now carries each panel's
  title from the layout store's records.
- **The roster strip** (`RosterStrip.tsx`, `styles.css .roster-strip__agent-cell`) draws a
  live peer's agents right after them. None are drawn for an away peer, whose agents'
  state this seat cannot know (M348's rule).

## Decisions, and why

- **A tile of its own, not a badge on the person.** The prompt's words, "a who, not a
  what", are the test. A badge is a what (a count, a dot). A tile with a name,
  an owner and a state, which a person can point at, is a who.
- **A circle, ringed and dashed, never filled.** A filled tile in the owner's colour IS the
  person, so an agent drawn the same way would read as a second person. The dashed ring
  says "belongs to", and the state is the text's tone, the canvas's one state vocabulary.
  The first cut was a smaller rounded square. The critic pointed out that since M348 an
  AWAY person is also a dashed ring, so an outline alone could not tell an away person
  from an agent. The SHAPE says it now: people are rounded squares, agents are circles.
- **Only the title crosses, scrubbed.** Not the backend, command, cwd or transcript: the
  same line the shared canvas's placeholders hold (M333).
- **The tile's state word comes from `panel-state.ts`** (`agentWord`), not a word map of
  the strip's own. The first cut spelled its own words ("needs someone", "stopped"), and
  `verify:rail state.2` refused them: panel-state is the canvas's one state vocabulary.
  "needs you" is said from the owner's side, as the owner's own tile already says it in
  their status line.
- **Canvas order, cut at 12.** A person with more agents than that is running a fleet,
  and the Team view (not a top-bar strip) is where a fleet is read.

## Checks

`verify:presence`:
- `agents.payload.1`: two agents' states and titles reach a peer, and a title holding a
  GitHub token arrives as `[redacted github token]`.
- `agents.payload.2`: one agent's change is published while the owner's fold stays
  `working`.
- `agents.parse.1`: 23 received entries become 12, names are capped at 60, and bad
  entries and a non-list are dropped.
- `agents.strip.1`: the strip draws a live peer's agents with their owner and state, and
  none for an away peer.
- `presence.payload.1`'s exact key list now includes `agents`.

## Gate

`npm run typecheck` is clean. The full `npm run verify` ran in 719.9s: 59/61 suites, and
every red is the baseline.
- `verify:panels:agents`: `template.1` and `detail.1`.
- `verify:panels:product`: `starter.1` and the seven `workflow.*`.

The plain tier (48/48, including `verify:presence` 33/33 and `verify:rail` 250/250) was
green in wave 1. `verify:visual` is hand-run: 71/72, with `starter` red as before.

## Goldens

Two rounds of fresh-context critics judged the three shared scenes.

**The first round sent two fixes back.** The agent tile was top-aligned in the strip, and
it sat 1–2px from sam's presence dot, which overhangs sam's tile towards it. A design
note also stood: an away person has been a dashed ring since M348, so an unfilled ring
could not by itself mean "agent". The fixes:
- the strip centres its items;
- the agent takes the strip's whole gap;
- agents are circles.

The same round's "dark theme, and `Canvas` instead of `api`" was my own shot's artifact.
`SHOT_ONLY` skipped the earlier scenes that set the light theme and name the workspace.
The second round was judged on a full-sequence shot.

**The second round** (`UPDATE_GOLDENS=1` then wrote what differed):
- **`shared-canvas`**: "Matches intent: the roster strip at top-centre now holds sam's
  filled magenta rounded-square "S" tile with its blue presence dot, and to its right a
  smaller circle (about 20 CSS px against the tile's 24) with a dashed magenta ring in
  sam's colour, an unfilled interior, and a blue "C" centred in it. The circle is
  vertically centred in the strip … It is not clipped … Its closest point is about 5.7
  CSS px from sam's presence dot, so they don't touch … Against the golden …, the only
  changed region is the roster strip, which widened symmetrically about the same centre."
- **`shared-offline`**: "Matches intent: the strip shows only sam's away tile, a dashed,
  desaturated pink rounded square with a grey "S". There is no agent circle … The
  candidate has no difference above threshold from the golden, which is right, since the
  only new element is correctly hidden here." Its golden is unchanged.
- **`share-members`**: "Matches intent: … Behind the scrim, the roster strip shows sam's
  tile and the dashed-ring "C" agent circle, dimmed evenly with everything else, still
  centred, not clipped and not touching the presence dot … Against the golden, the only
  difference is the roster strip plus one anti-aliasing pixel inside the dialog."

The same `UPDATE_GOLDENS=1` run ALSO wrote `orchestration` and `orchestration-working`,
which M349 does not touch. I looked before committing. Both captures had caught the
workbench's Changes pane mid-load, reading `Reading changes…` where the golden shows the
diff. That is a race in those scenes, not a change, so both were restored from `HEAD` and
not committed (Owed).

## Owed

- **M353 (proposed): the orchestration scenes race their Changes pane.** `orchestration` and
  `orchestration-working` can be captured while the pane still reads `Reading changes…`,
  and `UPDATE_GOLDENS=1` then writes that as the golden. The scenes should wait for the
  pane's diff (or its empty sentence) before capturing. It is a `shot.cjs` change, and
  both goldens would need re-judging.
- **The Team view's tiles** still show the folded agent word only. Listing each agent
  there (a fleet's natural home) is the next piece of this arc.
- **Local agents on one's own roster.** The strip shows OTHER people. My own agents are
  on my canvas.

Next: M350 (Arc 2.3 — per-node spend and context telemetry with hard caps enforced
outside the agent loop).
