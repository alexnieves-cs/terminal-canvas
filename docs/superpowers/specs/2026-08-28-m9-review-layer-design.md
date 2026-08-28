# M9: The Review Layer — Design

**Status:** designed, not yet implemented.
**Predecessor:** `2026-08-27-m8-app-shell-design.md`
**Backlog entries:** #51 (per-panel change review — the spine of this spec), #50
(git worktree per panel — deliberately deferred, see "What M9 does not solve"),
#14 and #35 (the panel-kind union, which M9b pays for), #22 (semantic zoom,
which M9b gets for free), #19 (transcript watcher — declined, see "Pull, not
push"), #41 (live cwd — the one place M9 inherits a known-wrong assumption).

## Goal

Close the loop on the work an agent produced.

The canvas's premise is that you were not watching. Through M8 the app is
excellent at telling you **that** an agent is working — a border colour, an
edge pip, a rail row, an inspector pane — and tells you nothing whatsoever
about **what it produced**. To see that, you leave: a terminal, an IDE, a
`git diff` somewhere else. On a canvas whose entire value proposition is
running more agents than you can watch, "show me the damage" is the operation
you most want and the only one the app cannot do.

M9 makes the app answer it. You leave four agents running, walk away, come
back — and the canvas shows you what each one changed, and lets you land the
good ones without leaving.

## Why this, and not the file tree

M8's spec pencilled M9 in as backlog #3, the file tree, on the grounds that it
would be the thing to force the panel-kind union. **This supersedes that.**
Three reasons, in order of weight:

1. **A file tree makes the app better at something; the review layer makes it
   trustworthy.** Nothing about a directory listing changes whether a user
   dares point four agents at real work. Seeing what those agents did is
   exactly what does.
2. **A review node is a cheaper payer for the union than a file tree, and a
   cleaner one than `ideas-backlog.md`'s own nomination (#14).** #14 needs a
   directory watcher; a review node needs none (see "Pull, not push"). Both
   share the property that matters — no PTY, no xterm, no WebGL context, no
   claim on `LIVE_BUDGET` — so neither can be faked as a special case of the
   terminal path, which is the whole criterion the backlog's closing section
   sets.
3. **The file tree's open question is unanswered and this one's is not.** #3
   asks "which directory?" and has no answer, because every panel is a shell
   that can `cd` anywhere. A review node's subject is a specific panel and a
   specific repository root, resolved once and stored.

The file tree is not cancelled. It is unscheduled, and it will be cheaper
after M9b, because the union it was going to pay for will already exist.

## Scope

In:

- **A main-side review engine** — for any panel, "what has changed in this
  panel's repository since this session started", answered correctly or
  refused honestly.
- **A per-panel baseline**, captured at spawn, persisted, and never recaptured
  on a reattach.
- **A changes summary in the inspector** — M8c's pane grows a section.
- **The panel-kind union** — `Panel` stops meaning "a PTY behind an xterm".
- **A review node on the canvas** — a non-terminal panel rendering real hunks
  in world space.
- **Commit** — the app's first write to a git repository.

Out, and deliberately so:

- **Worktree isolation (#50).** See "What M9 does not solve".
- **A file watcher.** See "Pull, not push".
- **Discard / revert.** Commit is the only write. Reverting a file is the
  first operation in this app that destroys work on disk with no process
  involved, it collides with an undo stack that has never touched the
  filesystem, and it earns its own decision rather than arriving inside a
  review pane.
- **Diff of anything but the working tree against its baseline.** No branch
  comparison, no staged-vs-unstaged split, no history browsing. The question
  is "what did this agent do", not "be a git client".
- **Attribution heuristics.** When the answer is unavailable, M9 says so. See
  "Honest degradation".
- **Syntax highlighting.** Added/removed/context colouring only. A tokenizer
  for N languages is a dependency and a milestone of its own.

## The arc

Three sub-milestones. The split follows this repo's own precedent — M1 is the
PTY layer, M2 is the canvas, deliberately built apart so a blank panel had one
possible cause in each, and M3 merges them.

**M9a — the review engine.** Main-side only. No new panel kind, no canvas
work. Surfaced in the inspector.

**M9b — the panel kind.** The union, and the review node on the canvas,
consuming an engine already proven correct.

**M9c — commit.** The write verb.

The split has a second payoff specific to this repo: the engine's unknowns
(baselines across a relaunch, untracked files, shared checkouts, a
garbage-collected baseline) want the cheap plain-node tier, while the union's
invariants (`LIVE_BUDGET`, dormancy, tiering, persistence) want a real
Electron renderer. Those are different suites. Building both at once means
neither is a clean signal.

---

# M9a — The review engine

## Components

**`src/main/git-args.ts`** — pure argv builders and output parsers, importing
nothing. It lands in the plain-node verify tier for the same reason
`tmux-args.ts` does: it never imports `electron` or `node-pty`, and the module
that actually executes a subprocess stays out of its reach.

```
buildRepoRootArgs(cwd)          -> ['-C', cwd, 'rev-parse', '--show-toplevel']
buildBaselineArgs(root)         -> ['-C', root, 'stash', 'create']
buildHeadArgs(root)             -> ['-C', root, 'rev-parse', 'HEAD']
buildObjectExistsArgs(root, sha)-> ['-C', root, 'cat-file', '-e', sha]
buildNumstatArgs(root, base)    -> ['-C', root, 'diff', '--numstat', '-z', base]
buildUntrackedArgs(root)        -> ['-C', root, 'ls-files', '-z', '--others',
                                    '--exclude-standard']
buildFileDiffArgs(root, base, p)-> ['-C', root, 'diff', base, '--', p]   # declared here, first called in M9b

parseNumstat(stdout)  -> { path, added, removed, binary, renamedFrom? }[]
parseNulList(stdout)  -> string[]
parseRepoRoot(stdout) -> string
```

**Every read is `-z`.** Not a preference. Git's default output quotes and
backslash-escapes non-ASCII and whitespace-bearing paths, and encodes a rename
as one field with braces in it; a naive line/tab split is wrong for exactly
the paths a user is least likely to have in a fixture. This repo has already
paid full price for that class of bug once — the unquoted `pane-died` redirect
that made **every** panel report exit code 1, silently, and survived eight
task reviews because every fixture used a space-free path.

**`src/main/review-engine.ts`** — orchestration, with the git runner
**injected** as a constructor dependency, the same move `main/presets.ts`
makes with `which` and `main/layout-store.ts` makes with its paths. That
injection is the only reason the engine can be driven against a fake with no
repository, and against a real repository with no Electron.

**`src/main/layout-store.ts`** — grows one map, described below.

**`src/renderer/shell/inspector-fields.ts`** — one new pure builder,
`buildReviewFields`, joining `verify:rail`'s tier beside `buildInspectorModel`.

## The baseline, and the guard that makes it correct

The baseline is captured with `git stash create`, which builds a real commit
object representing the current dirty state **without modifying the working
tree and without touching the stash list**. `git diff <that sha>` is then
exactly "what changed since", correctly excluding whatever was already dirty
when the agent started. Recording bare `HEAD` instead would blame the agent
for every uncommitted change that was already sitting there.

This was verified before the spec was written, against a scratch repository
with a pre-existing dirty line: `stash create` returned a sha, `git stash
list` stayed empty, the working tree was untouched, and the subsequent diff
reported `a.txt | 1 +` rather than `2 +`. **On a clean tree `stash create`
prints nothing**, and the baseline is then `HEAD`.

Capture happens in `PtyManager.create`, after `resolveCwd`, and is
**conditional on there not already being a baseline for that panel id**:

```
create(spec) -> cwd  = resolveCwd(spec.cwd)
                root = engine.resolveRepo(cwd)         // null outside a repo
                if (root && !store.baseline(spec.panelId))
                    store.setBaseline(panelId, { root, sha: stashCreate(root) ?? head(root) })
```

**The guard is the single most important line in M9a**, and `reattached` is
why. A `Cmd+R` reload calls `pty:create` again for every restored panel, and
under tmux that call reattaches to a session that may have been working for an
hour. Recapturing there resets the baseline to "now", and the inspector then
reports **no changes** for an agent that rewrote half the repository — a wrong
answer indistinguishable from a correct one, which is this codebase's defining
failure mode. `verify:review` pins it directly: two `create` calls at one id
produce one baseline.

Baselines live in `layout.json` as a map keyed by `PanelId`, a **sibling of
`workspaces` rather than a member of one**, because `PanelId` is global rather
than per-workspace — M7's rule, and for M7's reason: the id doubles as a tmux
session name. They are dropped when a panel is disposed. Without that, the map
grows for the life of the install.

## Honest degradation

`ReviewResult` is a discriminated union and every arm is a designed state, not
an error path:

| Arm | When | What the inspector shows |
|---|---|---|
| `not-a-repo` | the resolved cwd is not under a git root | nothing at all — the ordinary case for a `~` panel, not a failure |
| `never-started` | no baseline; the panel has never spawned | "not started" |
| `clean` | baseline valid, nothing changed | "no changes" |
| `changes` | the real answer | `3 files changed · +120 −8`, then the list |
| `shared` | two or more panels **that have run** resolve to this root | "4 panels share this repo — changes can't be attributed" |
| `baseline-lost` | `cat-file -e` says the sha is gone | "baseline lost — can't attribute" |
| `git-missing` | no git binary on the resolved PATH | one loud log, the `tmux-probe.ts` treatment |

**`baseline-lost` is a real state, not defensive padding.** `git stash create`
produces an **unreferenced** commit object, so `git gc --prune=now` in that
repository destroys it and `git diff <dead sha>` fails. The natural repair —
fall back to `HEAD` — is the worst available option, because it silently
starts blaming the agent for changes that were already there. Backlog #41
states the rule this obeys: falling back to a plausible answer is worse than
reporting nothing, because it is indistinguishable from a correct answer.

**`shared` is how M9a handles the mixed-checkout reality** rather than
pretending it away. Two panels in one repository, both of which have run, make
per-panel attribution unrecoverable from git alone: each panel's diff-since-
its-own-baseline includes everything the other did afterwards. The files are
still listed — that is true at the repository level — and the pane says
plainly that it cannot say who did it. The test for "has run" is "has a
baseline", so a dormant, never-spawned panel sharing the root does not trigger
it; it cannot have edited anything.

## Two details that fail silently if undone

**Every git call is async `execFile`, never `execFileSync`.** `TmuxBackend`
uses sync calls and is right to — they are tiny and bounded. `git status` and
`git diff` on a large repository are neither, and a synchronous call in main
blocks *everything*: every panel's 16ms PTY flush, every IPC reply, the entire
UI. This is the one place this codebase does unbounded I/O in main on a path a
user can trigger repeatedly.

**Pull, not push, riding a signal that already exists.** M9a adds no file
watcher and no push channel. The renderer asks on selection change, on an
explicit refresh, and — the useful one — when a panel's agent state
transitions to `idle`. M6c already computes that transition, and it means
precisely "this agent stopped producing output", which is the moment its work
is worth looking at. This is the same decision M6d and M7 both made and
recorded: the renderer already holds the signal, so a second channel asking
main to recompute it would be a second author of a fact one side already has.

One new invoke channel, `review:panel`, taking `verify:ipc` from 26 channels
to 27. No new push channel. M9c adds `review:commit`, taking it to 28;
M9b adds none, because a review node reads through the same `review:panel`
invoke the inspector already uses.

## The inspector surface

A `Changes` section under M8c's existing fields, built by a pure
`buildReviewFields` so it joins `verify:rail` rather than needing a renderer to
test. It renders the summary line, the first ten changed files with their `+`/`−`
counts and a `+N more` tail beyond that, and the union arms above. Ten because
the pane is 260px wide and an unbounded list turns the inspector into a
scrolling surface it has never been. It is a permanent addition, not
scaffolding for M9b: a count in the pane is worth having whether or not a
review node is open.

The section obeys M8c's signature rule — the inspector's memo signature must
move on a change to the review result and must **not** move on a rect change,
or a drag re-renders the pane at 60Hz.

## Verification

- **`verify:review`** (new, plain node). The parsers against spaced paths,
  renames, binary files and empty output; the engine against a fake runner for
  all seven union arms; and the reattach rule — one baseline across two
  `create` calls at one id — which is the check the milestone turns on.
- **A real-git block in the same suite.** `mkdtemp` with a **space in the
  name**, a real repository, real dirt before "spawn", real edits after,
  asserting the pre-existing dirt is excluded. Pure parsers can be perfectly
  correct while the actual invocation is wrong, and this is the only thing
  that can see it. Skipped loudly, never silently, when no `git` binary is
  found — the rule `verify:pty-manager`'s tmux block already obeys.
- **`verify:ipc`**: 27 channels.
- **`verify:rail`**: `buildReviewFields` per union arm, plus the signature
  moving on a review change and not on a rect move.
- **`verify:panels`**: end to end — a panel spawned in a temporary repository,
  a file written through the real PTY, the changes section read out of the
  real DOM.

---

# M9b — The panel kind

```ts
type Panel = TerminalPanel | ReviewPanel        // discriminated on `kind`

interface PanelBase     { rect: WorldRect; z: number; title?: string }
interface TerminalPanel extends PanelBase { kind: 'terminal'; spec: PanelSpecTemplate }
interface ReviewPanel   extends PanelBase { kind: 'review'; subject: ReviewSubject }
```

Five things about it are load-bearing.

**`kind` is optional on disk, and absent means `'terminal'`.** Every
`layout.json` in existence predates it. `parseLayout` drops malformed entries
*individually*, so a required `kind` would not fail loudly — it would silently
delete every panel from every existing canvas on first launch. This is the
rule `title` already obeys.

**A review node never reaches `assignTiers`.** `Canvas.tsx` partitions the
panel array by kind before calling it. That is what makes a review node
structurally incapable of taking a `LIVE_BUDGET` slot or a WebGL context,
rather than merely not asking for one. It never reaches `registry.ensure`
either, so no `PanelSession` is ever minted for it.

**A review node outlives its subject.** `ReviewSubject` stores
`{ subjectId, repoRoot, baselineSha, label }` captured at creation — not a
live pointer into the panel array. Closing the agent leaves the review
readable, which is the correct direction: a review of finished work is *more*
useful once the agent is dismissed, not less. A live pointer would blank the
node at exactly its most valuable moment.

**The wheel rule needs generalizing, and this is the silent collision.**
`shouldYieldWheel`'s rule 3 today is "a wheel over the focused **terminal**
scrolls that terminal". A review node owns a scrollable diff and needs the
same yield, or scrolling a long diff pans the camera instead — the palette bug
M6p fixed, one surface over. Rule 3 becomes "a wheel over the focused panel
that owns internal scroll", with the panel kind answering whether it does.
This must be a property of the kind, not an `if` inside the predicate:
`shouldYieldWheel` is documented as the sole authority on wheel ownership and
its whole recorded history is about a conjunction that could only narrow what
it said.

**Ids come from the same global sequence.** A review node minting an id a
terminal panel elsewhere already owns is M7's collision defect through a new
door, and that defect is invisible — the second panel to go live attaches to
the first one's tmux session and the user simply sees one agent through two
panels. Same counter, distinguishable prefix.

One consequence arrives free: the node lives inside `.world`, so it scales
with the zoom. "Readable up close, a summary at distance" is semantic zoom
(backlog #22) on the first surface that wants it, with no separate machinery.

Placement is beside the subject panel, through `cascadeCentre`, so a review
node spawned twice does not land byte-identically on top of itself — the
coincidence rule M6 already established.

---

# M9c — Commit

`review:commit` — `{ panelId, message, paths }`. Three decisions the
implementation plan must make explicitly:

**Staging must not disturb the agent's index.** The obvious
`git add … && git commit` writes the working index while an agent may be
mid-operation in the same repository. The safe form is a temporary index —
`GIT_INDEX_FILE` plus `read-tree` / `update-index` / `write-tree` /
`commit-tree` / `update-ref` — which never touches the user's. It is more
plumbing, and it is the difference between a commit feature and a commit
feature that occasionally corrupts a running agent's staging area.

**Hooks run, and they can block.** A `pre-commit` hook on a real repository
can take thirty seconds or fail outright. The call is async and its output is
surfaced in the node. `--no-verify` is not the default: silently skipping a
repository's own checks is not something a review tool should do quietly.

**This is the first thing in the app that `Cmd+Z` cannot undo.** Every
existing destructive action is either recoverable or scoped to processes. A
commit is on disk and in history. It is confirmed in the review node rather
than through the palette's confirm mode, which is a one-line yes/no and a
commit needs a message.

---

## What M9 does not solve

**Worktree isolation (#50) is deferred, and M9 makes its absence visible
rather than fixing it.** The `shared` arm is the honest report of a real
problem: two agents in one checkout can still corrupt each other's work, and
M9 will now say so instead of leaving it undiscovered. That is a genuine
improvement and it is not a solution. #50 remains the largest correctness gap
in the product thesis, it is the natural M10, and M9b's union plus M9a's
per-panel repository root are most of the groundwork it needs.

**Live cwd (#41) is still wrong, and M9 inherits it.** A panel's repository
root is resolved from its **spawn** cwd, which is stale the moment the user
types `cd` into that panel. A panel that started in one repository and moved
to another will be reviewed against the first. This is a known, recorded
limitation rather than an oversight; #41 is what fixes it, and M9 should not
grow a private half-answer to a question that has its own entry.

## Success criteria

1. For a panel whose agent has been working in a repository, the inspector
   reports the changed files and their line counts, excluding whatever was
   already dirty when the agent started.
2. That report survives a `Cmd+R` reload with a live tmux session — the
   baseline is not recaptured, and the pre-reload work is still counted.
3. Two panels in one repository produce an explicit "cannot attribute" state,
   never a confident wrong answer.
4. A review node sits on the canvas beside its agent, pans and zooms with it,
   survives a relaunch, and takes no `LIVE_BUDGET` slot and no WebGL context.
5. A review node still reads correctly after its subject panel is closed.
6. Four agents' work becomes four commits without leaving the canvas.
7. `npm run verify` is green, including the new suite and the raised channel
   count.

## Risks

- **The reattach guard is the whole milestone, and its failure is silent.** A
  recaptured baseline reports "no changes" for an agent that did everything.
  It is checked directly in `verify:review` and again end to end, and it is
  the first thing to suspect if the pane ever reads empty when it should not.
- **The union touches the invariants that fail quietly.** `LIVE_BUDGET`,
  dormancy, tiering, persistence, id minting and the wheel predicate all have
  recorded histories of silent regressions in `CLAUDE.md`. M9b is the risky
  milestone; M9a exists partly so it arrives alone.
- **`git status` on a very large repository may still be slow enough to
  notice**, even async. If it is, the answer is a per-panel cache with a short
  TTL — not a synchronous call, and not a watcher bolted on mid-milestone.
- **Commit is the app's first irreversible write.** It is last for that
  reason, and it can slip to its own milestone without blocking anything
  above it.
