# M95 — Ship 2.0.0: build log

Branch `m95-ship`, 2026-09-05. Scope: the scope document's row M95.

## The version

**2.0.0**, by §4's rule: M73 (the chat panel), M76 (approvals), M78–M80 (the graph, runs,
templates), M81 (the supervisor) and M84 (the watcher) all shipped, each with its spec, plan,
checks written first, verifier, critic where it had a surface, and build log. The version is
`package.json`'s and the README's status line; `verify:meta version.1` pins both and was
re-derived from 1.1.0.

## The documents reconciled

- The README's milestone table: rows M76–M94 had accreted in reverse (each prepended above
  M89); put back in sequence, M95's row added. `verify:meta milestones.1` pins that every row
  from M36 on has a build log and every build log a row.
- Both IPC diagrams checked against `src/shared/ipc-contract.ts` by script: every channel
  the contract declares appears in both; `verify:ipc` pins 94 invokes with handlers.
- CLAUDE.md's opening paragraph names the third run; every `src/…` path it cites (45) and
  every relative module path `docs/load-bearing.md` cites (102) resolves on disk.
- The README's pictures in words: thirty-nine scenes now, six described (three from this
  run: the chat, the graph, the wide shell with its notes and marks).

## Both packaging gates, with the numbers

| Gate | Result |
|---|---|
| `verify:package` (the builder config as a function) | 13/13 |
| `verify:packaged` (`electron-builder --dir`, the binary launched with a stripped PATH, a throwaway user-data dir) | 12/12 |
| `npm run package` (local only; never published) | `Terminal Canvas-2.0.0-arm64.dmg`, 134,765,641 bytes; the `.app` 295 MB on disk |

The build stays unsigned, as the run's constraints require; the README's Install section
says what Gatekeeper does about that.

## The graph

`graphify update .` after every milestone (AST only); no LLM key was available, so the
semantic layer is as M70 left it, refreshed structurally.

## What this run did not do

- Push, tag or publish anything: `origin` is untouched since M70's push.
- Reach a network: every connector was built against an injected client and a recorded body.
- Sign the build.
