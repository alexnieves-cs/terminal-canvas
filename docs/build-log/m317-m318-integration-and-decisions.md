# M317–M318 — finishing parallel work, and a queue of decisions by task

Two product asks, built 2026-09-23 on local `main`, uncommitted (the tree also holds M316 and
other sessions' work). Each is a pure model first (plain-node checks), then main's doors, then
the surfaces.

| # | Ask | Milestone |
|---|---|---|
| 2 | Turn parallel agent work into a complete integration workflow | **M317** integrate |
| 3 | A task-centered attention and decision queue | **M318** decision queue |

## M317 — from "do these combine?" to a receipt

M311 answered "do these lanes combine?" and stopped there: a green combined check stood over
lanes an agent kept editing, a failure said which lane did not apply and nothing about whose
it was, and landing the lanes meant accepting each task one by one — none of which carried
what had been checked.

| Piece | Where | Check |
|---|---|---|
| Lane fingerprints (the RESULTING CONTENT of every changed path, never the diff text), staleness (a lane's content, a lane gone, the main tree moved), failure attribution, the scoped fix brief, the gate, the receipt and its parser | `shared/integration.ts` | `verify:review integrate.1–.3` |
| `combine:run` records each lane's fingerprint as combined and the combined tree's hash (taken before any check runs in the scratch); `combine:inputs` re-reads the fingerprints, read-only | `main/combine-runner.ts` (`readLane`) | `integrate.4` |
| `combine:integrate` — re-reads every witness (main HEAD = the combine's base; each lane's content = what was checked; the check's OWN output record: exit 0, run in this repository's scratch; each lane committed; every lane's dry run `ready`), then merges in the checked order through Accept's own merger, stopping at the first that does not land; compares the landed tree to the checked one; keeps a receipt (`userData/integration-receipts.json`) and writes each landed task's timeline row itself | `main/integrator.ts`, `bootstrap/kit-handlers.ts` | `integrate.4` (real git: a failed check and a check run elsewhere refused; a lane edited after the check → `stale`, nothing merged; committing the checked bytes — a formerly-untracked file included — stays current; both lanes land and the landed tree IS the checked tree) |
| `combine:receipts` | same | `verify:ipc` 1 (165) |
| The Combine tab: lanes named by their task, dependencies listed ("B waits on A"), the result re-read every 5 s while open and marked OUT OF DATE when an input moves, a traced failure (who fixes it, who meets it, the files — each opening that lane's copy), the brief shown whole and sent through the follow-up door, **Combine and check again**, the integrate gate as a checklist, a two-press **Integrate N lanes…**, the receipt card and past receipts | `orchestration/OrchCombine.tsx`, props through `OrchWorkbench` | `verify:orchestration orch-timeline.6` (the send-back is a person's dispatch; the landing row is main's) — DOM owed |

**The rules, and the silent failure each prevents.**

- *A fingerprint is content, not a diff and not a HEAD.* Hashing the diff text called a faithful
  commit stale whenever it included a file the agent had created (hashed as untracked before
  the commit, as a hunk after) — found while writing `integrate.4`. Hashing the HEAD would call
  every commit stale and miss every uncommitted edit.
- *A failure names participants, never a culprit it cannot know.* A conflict is the later
  lane's (it lands on top — the plan's own rule). A failed check is traced through the files
  its output names that a lane changed; an output naming none says `unattributed` and offers
  the last lane as a suggestion the person can change. The brief is scoped to the lanes that
  MEET the failure — a lane only present in the combination is not the agent's business.
- *What lands is what was checked — or the receipt says it is not.* The check must be the
  scratch's own record with exit 0, re-read by main; the base and every fingerprint must be
  unchanged; and the landed tree is compared to the checked tree, byte for byte, rather than
  assumed equal.

**Named limits.** The review standing is the renderer's attestation (the gate requires each
lane's task to be reviewed at this revision; main records the list it was given, and the
receipt says "reviewed" only for those). A lane with no task has no review to carry and the
gate says so. A partial landing (a merge that conflicts after earlier lanes landed) is not
rolled back: the receipt names what landed and where it stopped, and the main tree is left
at the last clean merge.

## M318 — "What needs me, why, and what happens after I respond?"

M308's inbox made each waiting panel a decision; with ten tasks that is still a list of
agents. `shell/task-queue.ts` groups every decision a task can be waiting on under that task
— the inbox's permissions and questions untouched, a check whose LATEST witnessed run failed
(`isCheckCommand` keeps a mistyped shell command out), a finished lane not reviewed at this
revision, and a decision a restart lost — and says per task WHY it is stopped, the NEXT step
and where it goes, what happens AFTER, and which tasks WAIT on it (enabled hand-offs between
the tasks' panels).

| Piece | Where | Check |
|---|---|---|
| Grouping, order (stopped agent → failed check → review → restart leftovers; more waiting behind it first, then longest waiting), the sentences, the headline | `shell/task-queue.ts` | `verify:rail queue.1–.2` |
| Decision memory: every waiting permission and question in localStorage with its first-seen time; at the next launch one that does not come back is `lost` under its task until dismissed, one that does keeps its wait (`useDecisionInbox` seeds from it) | `task-queue.ts` (`rememberDecisions`), `useTaskQueue.ts` | `queue.3` |
| Keyboard: ↑/↓ (j/k) walk every decision task by task, ↩/→ open its evidence, Space opens a permission's detail, Esc returns focus; ⌥⌘J reopens on the decision you left, and a "← Decisions" chip beside the bell does the same by mouse. The popover takes focus only when opened from the keyboard. | `Dock.tsx`, `useTaskQueue.ts` (the cursor survives navigation and relaunch) | `queue.4` (the walk) — DOM owed |
| Information vs intervention: `classifyActivity`; failed watcher runs now enter the feed flagged `intervene`; both feeds say "needs you" on those rows, and Orchestrate's feed counts them and narrows to **Needs you only** | `task-queue.ts`, `useActivityFeed.ts`, `orchestration-activity.ts`, `OrchestrationView.tsx`, `InspectorActivity.tsx` | `queue.4` |

A canvas whose only decisions are loose panels' permissions and questions renders exactly
M308's flat inbox (`flatQueue`), so every existing inbox row, order and DOM hook keeps its
meaning. The badge still counts waiting agents; a failed check or an unreviewed lane is in
the popover, not the badge.

**Named limits.** Check runs are read per active task from the durable timeline while the
popover is open (and again when a watcher run ends) — a pull, never a second store; a check
run in a panel the task's membership does not include is not seen. Snoozes are still
forgotten on relaunch (M308's deliberate direction).

## Gate

Plain tier: all 44 plain suites green after two fixes (`verify:rail state.2` — "needs you"
spelled as a literal instead of the vocabulary's word; `labels.1` — the receipt row's button
had no title). Build green. Electron, serially under `/tmp/tc-electron-lock`: `verify:ipc`
1/1 (165), `panels:orchestrate` 34/34, `panels:core` 83/83, `panels:shell` 105/105 after one
fix (`98b`: when no agent waits but a task has a failed check or a review, the queue had
dropped the "nothing waiting" line — it now says it and lists the task decisions below).
`panels:kinds/agents/product` were not run.

Fresh-context critic, two findings, both fixed: symlinks were dereferenced in the digest and
copied into the scratch as regular files (now hashed and copied as their target string, git's
own blob); and a flat queue's keyboard order followed the task builder's kind order rather than
the inbox rank the rows are drawn in. It checked the outward gate on the brief and the
integrate re-verification and found them sound.

## Owed

- Electron DOM checks for the Combine send-back / integrate / receipt and for the queue's
  headers, keyboard walk and ⌥⌘J; goldens for the attention popover (grouped) and the Combine
  tab — a critic's sentence first.
- Driving two real agents' lanes that pass apart and fail together through the whole flow.
