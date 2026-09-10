# M205 — D09, intent-led onboarding

The guide's [D09](../../product-development-guide-2026-09-08.md#d09--make-onboarding-intent-led).
One milestone (the ledger reserves M205 alone). Written under the v10 ledger's evidence rule.

## Problem and evidence

- **observed** `verify/visual/goldens/launcher.png` at `aa51910a`: one primary (`Start a
  conversation`), two cards, then seven prompt lines — five of them different ways to start a chat
  or a shell. **No step asks what the person is trying to do, or in which folder** (D01 §4 journey 1).
- **read** `Canvas.tsx` `onStart`: on a first run the primary calls `openStarter`, so the ONLY way a
  new person reaches a conversation also lays out five objects — the starter tour is the compulsory
  definition of a workspace (guide step 4).
- **read** `start-work.ts:startWorkRefusal` — D05's Start work refuses with *"no teammate yet"* when
  the roster is empty, which it always is on a fresh install. The one path into a task cannot be
  reached by a new user without first visiting the Teammates pane. D09's result column is *"a new
  user starts useful work through the same path"*; today they cannot.
- **read** `Launcher.tsx` — the codex hint says `one process per turn` (step 5's jargon).

## Intended experience

The launcher asks two things and offers one primary and one alternative:

1. **What do you want to work on?** — a plain-language sentence.
2. **In which repository?** — a folder (typed full path, `Choose…`, or a Recent chip — a chip now
   FILLS the field rather than opening another sheet).

`Start work` (the primary) runs D05. `Ask without a folder` (the alternative) opens M120's
no-folder conversation with the sentence already in its composer. Everything else — New panel,
Open a file, Import, the starter, the presets, a chat with each engine, a note — is under one
closed disclosure, **More ways to start**, each row still present and disabled by name where it
cannot run. The starter is an optional line there and never laid out by the primary.

Before anything is minted the form states what will happen, including the grant:
*"a new teammate, Claude · app, may work only in ~/code/app — the work happens on its own branch"*.

Engine readiness appears only as needed: with an engine installed, one line (installed ≠ signed
in); with none, every engine's row and `Check again`. Installed / missing / unanswered stay three.

## State ownership, IPC

- **No new channel, no schema change.** `teammate:save` (the grant), `git:status` (is the folder a
  repository — asked BEFORE any mint), `board:lane` / `agent:create` / `agent:send` through D05's
  `dispatchWorkItem`, and `teammate:choose-place` (a folder dialog) all exist.
- The teammate is REUSED when an existing teammate's place contains the folder (a path-segment
  containment, never a string prefix: `/code/app2` is not inside `/code/app`). Otherwise one is
  minted with `places: [folder]` exactly — never the parent, never the repository root git
  reports. Main's Places gate stays the authority.
- The decision is pure (`shared/onboarding.ts`: `firstWorkPlan`, `firstWorkRepoAnswer`); the
  orchestration is one Canvas callback over existing actions. `startFirstWork` is NOT a palette
  action: a plan must never mint a place grant, and the palette's `Start work…` row is already the
  keyboard door to the same executor.

## Refusals (each by name, each minting nothing)

| state | answer |
|---|---|
| empty sentence | *say what you want to work on* |
| no folder / relative path | *choose the repository folder* / *a full path starting with /* |
| no engine discovered | install + Check again |
| Codex only | Start work runs Claude Code; *Ask without a folder* uses Codex |
| `git-missing` | install git, or ask without a folder |
| `unreadable` (not a repository) | *not a git repository* + **Chat in this folder instead** (a chat in that folder, the sentence inserted, never sent) |
| lane / gate / create / send | D05's own sentences, passed through; M198's recovery owns retries |

## Idempotency

The primary never touches the starter record, so reopening an empty workspace never recreates a
tour. The starter's own record rules (M181) are unchanged: a closed example stays closed.

## Risks

- A person who types a folder that is a SUBFOLDER of a repository: the lane is made from git's
  answer and the gate judges it; its refusal is passed through. Recorded as owed, not widened.
- Existing Electron checks drive `[data-onboarding-start]` as the conversation door
  (`onboarding.start.1`, `starter.1`) and walk every enabled launcher verb with Tab. Their intent
  moves to the new doors; each change is named in the build log.

## Acceptance

- A new user with Claude installed and a repository can type one sentence, give the folder, press
  Start work, and land in a conversation in a task lane whose first message is their sentence —
  with no terminal, no Teammates-pane visit and no starter tour.
- The no-folder path is one click away and distinct.
- Nothing is minted on any refusal **before the lane step** (plan, engine, folder, repository —
  including a subfolder and a missing path); after it, the teammate and the card are M198's
  recovery journal and a retry resumes them (amended at the critic's finding 2). A second start in
  the same folder reuses the teammate.
- Measured by a person: owed, not asserted (the guide's own rule).
