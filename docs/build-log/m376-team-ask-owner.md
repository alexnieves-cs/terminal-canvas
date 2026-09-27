# M376 — the owner's machine routes a permission request to the team, and decides

**Verdict: shipped (the owner's side; a teammate answering from their own screen is
M377).** M375 made the record. This makes it real on the machine that runs the agent.
With **Ask the team to approve on a shared canvas** on (`agents.teamAsks`, off by
default), each permission request one of your agents asks on a shared canvas is ALSO
written to the workspace doc as a team ask. Main then:
- reads the answers as they arrive;
- decides with M375's policy;
- answers through `answerPermission`, the one door, and closes the ask with how it
  ended.

A teammate's decision goes on the record: "Allowed Bash — npm test, by a teammate on the
team". Past **Two approvers past this spend** (`agents.teamEscalateUsd`), your own Allow
is one of two, and the request waits for a second person.

## What landed

- **`main/team-ask-router.ts`** (new, plain node): `createTeamAskRouter`.
  - `agentEvent` opens an ask for a routable request, and withdraws it when the request
    ends any other way.
  - `asksChanged` decides from a peer's answer, and withdraws an ask a relaunch left
    open.
  - `localAnswer` writes the owner's answer as one person's and says `waiting`,
    `decided` or `not-routed`.
- **`shared/team-asks.ts`**: `teamAskAction(input)`, the one line a teammate would be
  allowing, or why it stays here.
- **`presence/canvas-sync.ts`**: `workspaceOfPanel`, `asks`, `writeAsk` (through the same
  authorisation as every write), and an `onAsks` observer. A peer's answer persists like
  a peer's typing does.
- **Wiring**:
  - `bootstrap/presence-wiring.ts` builds the router, with every collaborator read at use;
  - `agent-runtime.ts`'s one fan-out hands it every event;
  - `agent:answer` asks it first;
  - `MainState.teamAsks`.
- **Two settings** (`shared/settings-schema.ts`): `agents.teamAsks` (off) and
  `agents.teamEscalateUsd` (0, which means always one).
- **`redactSecrets`' named callers** gain `main/team-ask-router.ts`, deliberately
  (`verify:verbs gate.2`, its sentence and its list).

## Decisions, and why

- **Off by default.** A teammate's allow runs a command on THIS machine. Sharing a canvas
  is not consent to that, so the owner turns it on.
- **A teammate is sent only what they can read whole**: one line (a command, a URL, a
  path, a pattern) within 300 characters, with nothing else beside it. Everything else
  is answered here only:
  - an Edit's diff and a Write's content are exactly what a person must see before
    allowing, and sending them to a server to be shown is a disclosure this milestone
    does not make;
  - a cut command hides the tail a reviewer needs.
- **What never routes**:
  - a plan (`ExitPlanMode`), which is read, not run;
  - a question main asked itself (`tc-ext-*`), because a credential write is the
    credential owner's call.
- **Scrubbed on the way out, the count on the ask.** The summary is terminal bytes
  leaving for a server. A GitHub token in a `curl` header crosses as
  `[redacted bearer token]` with `scrubbed: 1` (`team.route.1`).
- **The owner's answer is one person's, written to the doc in their name.** Past the
  line it does not decide alone. `agent:answer` accepts it (`waiting`) and answers
  nothing yet. When the owner alone decides, the process hears the owner's own words (a
  deny's message), never a sentence of ours.
- **A session grant still answers before anything is pending** (M98, load-bearing). It
  is the owner's standing decision on their own agent, so a granted tool is never routed.
  That includes past the line: the owner who grants a tool for the session has decided
  it.
- **Untracked before answered.** Answering the process emits `permission-answered`, which
  otherwise reads as "answered elsewhere" and withdraws the ask being closed as allowed.
  The router forgets the request first (`team.route.1`'s `allowed`).
- **A relaunch withdraws.** A request dies with its process. An open ask this machine
  minted that nothing here waits on is closed `withdrawn` the first time the doc is read,
  so nobody answers a question no one is asking.

## Checks

- `verify:canvas-sync`, over a real owner canvas-sync and a teammate's, relayed like a
  room, with a stand-in manager whose `answer` is the one door:
  - `team.route.1`:
    - a request reaches the teammate as an ask, its token scrubbed with the count;
    - the teammate's allow answers the process and closes the ask `allowed`;
    - the decision is a person row on the record, the team's.
  - `team.route.2`:
    - past the line, the owner's own allow is one of two, and the request is not
      answered;
    - the teammate's allow is the second;
    - a single deny decides at once, in the team's words.
  - `team.route.3`:
    - a Write's content, a plan, a credential question, and a request with routing off
      stay here;
    - a dropped request and a relaunch withdraw their asks;
    - the owner deciding alone answers in their own words.

  82/82.
- `verify:verbs gate.2` names the new caller. `verify:agent-session` 179/179,
  `verify:layout` 283/283 and `verify:palette` 162/162 stay green with the two settings.

No display changed (the two settings render through the settings list's own rows), so
`verify:visual` was not run.

## Gate

At this commit: `npm run typecheck` is clean and the plain suites this milestone reaches
are green (see Checks). The full `npm run verify` ran once for the team-queue chain
(M375–M379) on the tree holding all five; its result is in M379's ledger.

## Owed

- **M377 (proposed): a teammate's answer, and the owner's `waiting`.**
  - On a teammate's machine, a team ask goes in Needs you with Allow once and Deny, the
    tool and its line, whose agent it is, and the progress words.
  - Its four doors: the row, a palette row, `tc answer`, and a workflow node.
  - On the owner's machine, a request waiting on a second person says so where the
    Allow was pressed. Today the renderer's permission row records "Allowed" for an
    allow that is one of two.
- **The live two-machine run** needs a second machine and the collab VM (the run's
  standing blocker).

Next: M377 (a teammate answers from their own Needs you).
