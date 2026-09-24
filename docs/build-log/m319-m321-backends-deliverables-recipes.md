# M319–M321 — backend fit, task deliverables, portable recipes

Three product asks, built 2026-09-23 on local `main`, uncommitted (the tree also holds M316–M318
and other sessions' work). Each is a pure model first (plain-node checks), then main's doors,
then the surfaces.

| # | Ask | Milestone |
|---|---|---|
| 4 | Make backend differences explicit before work starts | **M319** backend fit |
| 5 | Give every task a durable evidence and deliverables view | **M320** deliverables |
| 6 | Make successful workflows reproducible in another repository | **M321** portable recipes |

## M319 — does the chosen backend do what THIS task needs?

The registry already had the facts (codex has no interrupt, copilot asks no permission, only
claude takes an appended prompt). Nothing checked them against a task. Start work had no
backend choice at all, so every dispatched lane was claude because nothing else was offered.

| Piece | Where | Check |
|---|---|---|
| A task's requirements (required or wanted), each backend's fit to them with the vendor's own sentence, the three stops, the failed-resume classifier, the exit sentence, the cross-backend hand-off draft | `shared/backend-fit.ts` | `verify:agent-session fit.1–.2, stop.1, resume-lost.1/.4, handoff.1` |
| Start work: a **Backend** field (every row listed; one that cannot do the task is disabled with the reason), the task's relevant capabilities listed as met or not, and Start disabled on a required one | `palette/start-work.ts` (`startWorkBackendFit`, `startWorkBackendRows`), `StartWorkSheet.tsx`, `palette-actions/board.ts` | `verify:palette start.backend.1` |
| `backend` on the work item. The executor dispatches on it. For a CLI with no appended prompt, the lane's rules go at the top of the first message instead, and an arrangement is refused before any worktree exists | `shared/work-items.ts`, `canvas/useBoardVerbs.ts` | — |
| **Cancel** (`agent:cancel-queued`) and **End process** (`agent:terminate`, which kills the process and keeps the session). Orchestrate shows Interrupt, Cancel and End process as three buttons, each saying what it does to the turn, the process and the conversation | `main/agent-session.ts`, `orchestration-controls.ts` (`orchStops`), `OrchestrationView.tsx` | `stop.2`, `verify:orchestration orch-stops.1` |
| **Continue on another backend…**: a draft that the outward gate has scrubbed, which the person can edit. It lists what does not carry over. It opens a new chat on the target backend in the same folder, with the text inserted but not sent | `OrchestrationView.tsx`, `Canvas.tsx` (`onContinueOnBackend`) | `handoff.1` |
| A failed resume is recognised. The next message starts a fresh conversation instead of repeating the failed resume. The chat's exit line names the backend and promises a resume only when one is possible | `main/agent-session.ts`, `chat-store.ts`, `ChatNode.tsx` | `resume-lost.2–.3` |
| A run holding a chat has an **unknown** cost, never the terminals' total with the chat left out | `run-model.ts` (`runCost`'s `unmeasured`), `useRuns.ts` | `verify:viewport run.unmeasured.1` |
| Recorded-protocol fixtures: real failed-resume output from claude 2.1.281 (in-stream), codex-cli 0.156.1 and Copilot CLI 1.0.87 (stderr); damaged streams for all three parsers; a codex turn killed before `turn.completed` | `scripts/fixtures/agent-session/{,codex/,copilot/}resume-fail.*` | `protocol.malformed.1–.2`, `protocol.interrupted.1` |

**The silent failures this fixes.**
- A conversation the CLI had pruned was resumed again on every message after the first. Each
  resume failed, and every time the panel said "the next message resumes the conversation".
  For codex and copilot the reason was only on stderr, and the renderer never showed stderr.
- A codex lane would have lost the dispatch prompt without any error, because main only
  appends a system prompt for claude.
- A run's cost silently left out its chats.

**Limits.** The hand-off carries text only: tool calls and grants do not carry over, and the
draft says so. End process does not track any child processes the CLI started. The fit is the
registry's promise. For ACP, the handshake's answer can still override it at runtime.

## M320 — what a task produced, where it came from, whether it still holds

| Piece | Where | Check |
|---|---|---|
| The collector: files as a **live reference** or a **captured version** (a digest taken when the review was recorded), captures, check runs, the review mark, merge, PR, receipts, the conversation, and the expected deliverables. Each has a status (current · modified · missing · superseded · stale · unknown) with a reason, and a producer taken from the live panel or from what the row recorded. Also the account and the hand-off Markdown | `shared/task-deliverables.ts` | `verify:review deliver.1–.4` |
| Event rows gain `producer`, `root` and `digests`, each parsed field by field. Main computes the digests at append time from `root`, and never takes them from the renderer | `shared/run-ledger.ts`, `main/task-evidence.ts` (`withDigests`), `main/index.ts` | `deliver.5` |
| `task:evidence`: events read by item, check runs read by panel, each check's facts without its output text, files probed under the root, receipts, and captures still on disk. `task:evidence-index` for search. `task:export-handoff` through `outward`, to a file the person picks | `main/task-evidence.ts`, `bootstrap/task-handlers.ts`, `ipc.ts` (the `tasks` collaborator, added as the last argument) | `deliver.5` |
| The review mark records the lane root and the producer. Dispatch records the producer. A capture of a task's lane now writes its own artifact row, so deleting the image panel no longer loses where the capture came from | `useBoardVerbs.ts`, `Canvas.tsx` | — |
| The Artifacts tab opens with **Deliverables**: the account, each row with its status and producer, and **Export hand-off…** | `orchestration/OrchDeliverables.tsx`, `OrchWorkbench.tsx` | DOM owed |
| Search now also covers review comments, checks, expected deliverables, and the record's check commands, reviewed paths and captures | `shared/work-search.ts`, `Canvas.tsx` | `deliver.6` |

**Limits.** Rows written before M320 have no digest, so their files read `unknown`, never
`current`. Check runs are keyed by panel, and a watcher closed before this read can only be
found through rows that name the task. PR state lives on GitHub and reads `unknown`.

## M321 — a recipe that goes to another repository

| Piece | Where | Check |
|---|---|---|
| Placeholders `{repository}`, `{repo}` and `{param:NAME}`. The scan turns embedded paths into `{repository}` or into named parameters. Rendering and unfilled detection. `portableCwd` for templates. Versions via content hash, `RecipeUse` (the exact definition a run used), the preflight (tools, setup, capabilities, ports, and a plan of what will run), and the comparison with the last success | `shared/recipe-portability.ts` | `verify:review portable.1–.5` |
| Recipes gain `version`, `params` and `requires`, each parsed field by field. `applyRecipe` renders every field against the target repository. `portableRecipeFromTask` | `shared/recipes.ts` | `portable.1–.2` |
| The store assigns versions: an unchanged definition keeps its number, and a changed one gets the next number, with the replaced version moved to `recipe-history.json`. `recipe:history` | `main/recipe-store.ts`, `kit.ts` | `portable.4` |
| `setup:preflight` looks up tool names on the login PATH and the next lane's ports, and runs nothing | `main/repo-setup-store.ts`, `bootstrap/kit-handlers.ts` | `portable.6` |
| Start work: parameter fields, the recipe re-rendered when the repository changes, **Before it starts** (install, services with ports, checks, unmet prerequisites), and Start disabled on anything blocking. The card records `recipeUsed` | `StartWorkSheet.tsx`, `board.ts` | — |
| The executor runs the same preflight after the worktree exists and before any setup step or agent, for doors that open no sheet | `useBoardVerbs.ts` | — |
| Save as recipe produces a portable recipe. An arrangement saves members' folders as the `{{repository}}` template hole | `useBoardVerbs.ts`, `Canvas.tsx` | `portable.2` |
| Deliverables compares a reuse with the last successful run of the same recipe | `OrchDeliverables.tsx` | `portable.5` |

**Limits.** Tool detection takes the first word of each command segment. A tool invoked
through `npx` or a script is not traced. A task started before M321 has no `recipeUsed`, and
the comparison says only its outcome can be compared.

## Owed

- No DOM checks and no goldens for the Backend field, the fit rows, Before it starts, the stop
  group, the hand-off draft or the Deliverables section. These are visible surfaces, so a
  fresh-context critic is owed before any golden is written.
- Run in this change: all 43 plain-node suites green; `npm run build` green; `verify:ipc` 1/1
  (count re-pinned to 172 with the seven channels named); `verify:panels:orchestrate` 34/34;
  `verify:panels:product` 108/117, and its nine reds are the recorded pre-existing ones (the
  eight in `m277-libraries.md` plus `starter.1`). Not run: `panels:core/shell/kinds/agents`,
  `verify:canvas`, `verify:xterm`, `verify:visual`.
- Not driven with a real agent on codex or copilot.
