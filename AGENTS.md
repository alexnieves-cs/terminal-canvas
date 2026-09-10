# AGENTS.md

This file is what Codex reads. It is deliberately short. **[CLAUDE.md](CLAUDE.md) is the
index of this repository**: a short page of the rules everything rests on, and a table saying
which doc to open for which task — including which run is current. Read it before your first
change; it is addressed to any engineer, not to one tool. Then open only the doc its table
names for your task. The large ones (`docs/load-bearing.md` and its `-recovered` sibling,
`docs/verify-suites.md`, `docs/ideas-backlog.md`) are for grepping by module or suite name,
never reading whole.

## The one command

```sh
npm run verify
```

There is no unit-test runner and no linter. `npm run verify` chains every plain-node suite,
the typecheck, the build, and the real-Electron suites, and it must print every suite's tally
at exit 0 before any work is called done. `npm run verify:visual` (goldens) and
`npm run verify:packaged` (the packaged binary) are outside the chain and are owed at every
act close. `npm run dev` unsets `ELECTRON_RUN_AS_NODE` first; if you see
`Cannot read properties of undefined (reading 'whenReady')` your shell exports it.

## Rules that are Codex-specific or easy to miss

- **Never push to `origin`, never create a remote object, never modify anything outside this
  repository.** The user's answers to this run's setup make those the fixed boundary.
- **A check id is a scoped string** (`ok('preview.1 …')`), never the next integer;
  `verify:meta` 22 fails two computed checks sharing an id.
- **A golden changes on purpose or not at all.** Each changed scene gets a critic's sentence
  in the ledger before `UPDATE_GOLDENS=1` runs. A blind re-baseline is a regression nobody
  can see.
- **A verb needs four doors** (canvas gesture, palette row, workflow node, agent-askable
  through `shared/verb-table.ts`), or its omission is written in the ledger.
- **Absent vs malformed vs unknown** in every parser; three-state results, never two; a
  disappearing affordance is disabled with a named reason, never removed.
- **Two lifetimes**: a panel's session (xterm plus PTY) lives in `session-registry.ts`
  outside React; the component owns nothing. `pty.kill` keeps exactly two callers.
- **The IPC diagram in `README.md` is the one `verify:meta` 19 pins**; the copy in
  `CLAUDE.md` must be edited with it; `src/shared/ipc-contract.ts` is the authority for both.
- **Restyle classes, never rename them**: the `.panel__*` and `*-node__*` aliases are what
  roughly two hundred checks select on.
- **Dependencies** may be added with a written reason in the plan and ledger; never a
  styling dependency (no Tailwind, no component library, no icon font).
- **Commits** are conventional and scoped by milestone: `feat(m181): …`, `fix(m181): …`.
- **Minimal changes.** Targeted fixes over comprehensive rewrites; no unrelated cleanup. The
  repository answers questions about itself; read its docs before searching the web.

## Where things are

- `docs/build-log/` — one log per milestone or act, and the ledgers; the ledger is the state
  of a run.
- `docs/superpowers/specs/` and `docs/superpowers/plans/` — every milestone's spec and plan.
- `docs/ideas-backlog.md` — open and deferred ideas, each with a reason;
  `docs/ideas-backlog-closed.md` — the ones marked DONE or declined.
- `verify/visual/goldens/` — the visual register; `scripts/verify-*.cjs` — every suite.
- The current run's guide and ledger — named in ONE place, CLAUDE.md's index table, so a
  finished run cannot be left named as current here.
