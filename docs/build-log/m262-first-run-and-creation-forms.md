# M262 — first-run sequence and the creation forms

Worktree `tc-m258-first-run`. Renumbered twice on the day it was built: M258 (held by
`m258-command-pill-palette`), then M260 (landed on main as the chat/review restyle); M259 and
M261 were taken too.

## What landed

**First run (backlog item 8).** The launcher is a numbered sequence, not a form:
1. *What are you working on?* — with three example sentences about the CHOSEN repository
   (Review recent changes, Fix a failing test, Explain this codebase), shown once there is one;
2. *Pick or drop a repository* — typed, chosen, dropped on the card, or picked from a dated list
   of recent folders (name, short path, last used; ↑/↓ walk it);
3. *Choose an agent* — ONLY when Claude Code is missing or discovery has not answered
   (`agentStepNeeded`); otherwise its row is a status line under the action;
4. *Start* — a filled **Start task** (filled even while disabled) beside **Start a general chat**
   (was *Ask without a folder*).

The tmux notice and engine status moved below the action. *More ways to start* gained Terminal,
Workflow and Blank canvas beside Custom panel…, Open a file…, import, starter, chats and presets.
A first start frames the card and its agent together and they rise in turn (`cluster-arrive`).
Gesture hints are taught after an attempt, one at a time (`contextualHint`, `attemptOf`).

**Creation forms (item 9).** Both sheets share a header with a **Task | Panel** switch — task
first, the raw panel labelled expert. Labels are plain sentence case (Folder, Agent, Runtime; Task,
Agent, Repository). The Agent select is explained per kind at selection (`KIND_EXPLANATIONS`); the
runtime's defaults are said (`Claude Code · Standard effort · Default model`); environment
variables are under a closed Advanced; the footer has Cancel and a filled Create panel / Start
task beside the smaller key hints. Recent suggestions lead with the repository name and say when.

## Evidence

- `verify:first-run` (new) 15/15 — pure model, attempt rule, parser, and static markup of the
  launcher and both sheets.
- `verify:layout` 260/260 (recent.3 new), `verify:onboarding` 21/21, `verify:styles` 62/62
  (material.1 now pins sentence-case labels; motion.2 allows `cluster-arrive` by name),
  `verify:rail` 206/206, `verify:meta` 50/50, `verify:ipc` 1/1 (145 channels).
- The full gate: see the line below.

## Not done / declined

- The top bar's New panel button still opens the panel sheet directly: `TopBar.tsx` carries
  uncommitted M257 work on main, and editing it here would be a merge conflict by construction.
  The Task | Panel switch reaches Start work from it in one click.
- The examples need a folder first; an intention typed before one keeps its own words.
- No golden was regenerated (`verify:visual` is hand-run); the launcher and sheet scenes WILL
  differ, and each needs a critic's sentence before `UPDATE_GOLDENS=1`.
