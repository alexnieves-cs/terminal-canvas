# M311–M314 — the workflow kit: combine, setup, editor, recipes

Four product asks, built 2026-09-22/23 on local `main`, uncommitted (the tree also holds other
sessions' work — M306–M310 among it, which this builds on). Each milestone is a pure model first
(plain-node checks), then main's door, then the surfaces.

| # | Ask | Milestone |
|---|---|---|
| 6 | Make parallel work safe to combine | **M311** combine |
| 7 | Make repository setup reusable | **M312** repository setup |
| 8 | Meet engineers in their editor and shell | **M313** editor + `tc task` |
| 9 | A few excellent workflow recipes | **M314** recipes |

The eight new channels are ONE collaborator of `registerIpcHandlers` (`main/kit.ts`'s
`KitHandlers`, appended last, inert by default with honest refusals), mirrored in the panels
harness over real stores in scratch directories — Phase B's positional trap, not repeated.

## M311 — parallel work, safe to combine

The vocabulary is the point. An **overlap** is one repo-relative path changed in SEPARATE
checkouts: nothing is broken yet, the files meet at integration, and it is a review path. A
**contention** is two writers in ONE checkout: a hazard now, which no merge order fixes. Watch
drew both the same way — worse, it keyed files by the raw tool path, so two worktrees writing
`src/api.ts` under different absolute paths were never flagged, and two relative-path writers in
different checkouts were flagged when they did not share anything.

| Piece | Where | Check |
|---|---|---|
| `planCombine` — overlaps, the order (authored hand-offs, then lanes that meet nobody, then the smaller diff, then given order; a loop of links is said, not dropped), each step's reason and where it meets earlier lanes | `shared/combine.ts` | `verify:review combine.1–.3` |
| The combined tree: a scratch checkout (`tc/combine` under `worktreesDir`, detached at the main tree's HEAD, recreated per run, serialised per repository); each lane's content diff since its fork applied `--3way`, its untracked files copied; a conflict names the lane and paths and stops | `main/combine-runner.ts`, `combine:run` | `combine.4` (real git: an uncommitted lane + a committed lane combine; a third on the same line conflicts; no lane, main tree or index touched) |
| Watch keys files by checkout + repo-relative path (`relativeToCheckout`); `contended` is same-checkout only; `alsoIn` counts other checkouts that wrote the path | `orchestration-live.ts`, the view passes each session's cwd | `verify:orchestration orch-live.checkout.1` |
| Combine tab: contention first (the review engine's `shared` arm), overlaps with each lane's copy one click away, the order, **Combine in a scratch checkout**, **Run checks on the combined tree** (an unarmed watcher in the scratch path, so its output is M306's record; disposed with the tab) | `OrchCombine.tsx` — outside `OrchWorkbench.tsx` on purpose (the strip reaches read doors only; this makes a checkout and runs a process) | `workbench.1` (six tabs, and still no `combine.run(`/`watcher.create(` in the strip), `orch-bench.1` |
| Watch's shared-files list: each shared write with its verb — **Review the file** (selects the first writer, opens Changes) or **Plan the combine** | `OrchestrationLive.tsx` | — (DOM owed) |

**Named limits.** The combined tree starts from the main tree's last commit; its own uncommitted
changes are left out and the tab says so. The scratch checkout stays until the next combine (it is
one per repository, outside the repository, and `git worktree list` shows it).

## M312 — repository setup, saved once

`shared/repo-setup.ts` + `main/repo-setup-store.ts`: one record per repository, keyed by the
MAIN tree (a save from a lane is re-resolved, so every lane reads one record), stored under
`userData/repo-setup/`, never in the repository.

- **Detection proposes, a person saves.** `setup:read` answers `saved` or a `draft` detected from
  the repository's own lockfile and scripts (pnpm/yarn/bun/npm ci, cargo, go, uv/pip; typecheck,
  lint and test scripts; a dev service). Nothing runs from a draft: an install executes the
  repository's scripts, and the first time that happens is the person's decision.
- **Preparation fails before the agent starts.** `dispatchWorkItemAttempt` reads the saved record
  after the lane exists and BEFORE `agentSession.create`; `setup:prepare` runs its install steps in
  the lane (`/bin/sh -c`, login env, `CI=1`, 15 min each), stops at the first failure, and keeps
  every step's whole output as a check-output record (source `setup`). The card's note is the
  step, its exit and its own last line; a durable `check` event is written. A retry reuses the
  lane (the association lands before preparation) and prepares again.
- **Ports are allocated, never assumed.** Slot 0 is the main tree; a lane is its index among the
  repository's lanes + 1; each gets `span` ports from `base + slot × span`, skipping ports already
  listened on; `PORT` and `TC_PORT_<NAME>` ride the preparation env and the agent's first message.
- The agent is told only what the record says (`setupBrief`): prepared steps not to repeat,
  services with ports, the checks that decide done.
- Run checks offers the task's own checks, then the setup's, then M310's guess — and a command
  that needs a shell (`&&`, a pipe) now runs as `/bin/sh -c` (`watcherArgv`); before, a watcher
  split it on spaces and handed `&&` to npm as an argument.

Surfaces: the **Repository setup…** row and sheet (`SetupSheet.tsx`, palette kind `setup`; ⌘↵
saves), and Start work's **Setup** line with **Set up this repository… / Edit setup**.

Checks: `verify:review setup.1–.4` (setup.3 runs real steps: the marker file lands, the step after
the failure never runs, the port is in the env, the output record carries stderr).

**Named limit.** Only a swarm's PRIMARY seat is prepared (its lane is the task's); an own-lane
seat starts in a bare worktree. Services are declared and their ports allocated and told, not
started — starting them is still a terminal the person or agent opens.

## M313 — the editor and the shell

- `editor:open` (`shared/editor-open.ts` + `main/kit.ts`'s opener): `auto` takes the first editor
  CLI on the LOGIN path in a fixed order (Cursor, VS Code, Windsurf, Zed, Sublime, IDEA,
  WebStorm) with that editor's own line syntax, then an installed editor's URL scheme (asked of the
  OS), then the default app with a note naming the dropped line. A named editor that is absent is
  refused by name. Setting: **Open files in** (`files.editor`).
- Doors: **Open in editor** (palette, ⌘⇧E on the focused panel — a file, else the folder its
  agent works in); the review's **Open in editor** at the change being looked at and a
  double-clicked diff line; the workbench's **Open lane in editor**; a Cmd-clicked `path:line`
  in a terminal now lands on the line (link-open keeps `line`/`col`).
- **Bring a task into Canvas**: `tc task "…" [--brief] [--criterion]… [--recipe] [--cwd]` and
  `terminal-canvas://task?title=…`. It PROPOSES: Start work opens filled in (the repository
  containing `cwd` chosen), and a person presses Start. Because it cannot act, it is the second
  verb the URL door accepts; `board add` still is not.

Checks: `verify:review editor.1–.2`, `verify:control task.1`, `verify:palette 48` (the chord),
`verify:electron eneg` (an ACCEPTED row for the scheme-guarded `openExternal`).

## M314 — recipes

`shared/recipes.ts`: **Fix a failing test**, **Implement an issue**, **Review a change**,
**Investigate a bug** — each with its one question, a brief template, criteria, deliverables, the
context to gather first, and an arrangement where one fits. Picking one fills Start work (every
field stays editable) and writes `recipeId`, `checks` and `deliverables` onto the task — the
task's own copy; the recipe is not consulted again. The first message gains **Before you start**,
**Checks that must pass** and **Hand back**; a task with none sends the M310 message byte for byte.

**Save as recipe…** in the review's task section keeps the outcome (templated on the task's
title), criteria, deliverables, arrangement and only the checks that WITNESSED-passed, and says
whether the task was verified. The person's recipes live in `userData/recipes.json` (`recipe:*`);
a built-in's id cannot be saved over.

Checks: `verify:review recipe.1–.3`, `verify:verbs closure.1` (`beginRepoSetup` and
`openInEditor` excluded with reasons).

## Gate

Plain tier: every affected suite green except `verify:meta milestones.1` until this log existed.
Build green. Electron tier, serial under `/tmp/tc-electron-lock`: canvas, xterm, panels:core,
shell, kinds, orchestrate green; `panels:product` — the ten recorded in the M306–M310 ledger
(`workflow.*`, `reach.1`, `starter.1`, `review.task.2`); `panels:agents` — `detail.1` and
`template.1`, recorded there too.

Fresh-context critic (the task URL door, combine's writes, prepare's inputs, the editor
opener's binary and URL, the three new React surfaces): nothing at its reporting bar. One
observation acted on: combine runs were serialised by the caller's root string, so a run asked
from a lane and one asked from the root could interleave in the same scratch — now keyed by the
resolved main tree.

## Owed

- Electron DOM checks for the new surfaces: the setup sheet, Start work's recipe field, the
  Combine tab against a real two-lane repository, Watch's shared-files verbs, ⌘⇧E.
- Goldens: Start work (new fields), the review's task section (Expected back, Recipe), the
  Orchestrate workbench (sixth tab) and Watch (shared-files list) — a critic's sentence first.
- A real editor launch on a Mac with `code`/`cursor` absent from the login PATH (the URL-scheme arm).
