# Contributing

Thanks for looking. This is a beta and the surface is still moving, so an issue
describing what you were trying to do is more useful than a large pull request
against something that may be about to change.

## The one hard rule

```sh
npm run verify
```

must be green. That is the entire gate — there is no unit-test runner and no
linter in this repository, and `npm run verify` chains every suite with a
typecheck and a build in the middle. A change that leaves it red is not
finished, and CI runs the same thing.

## Setup

macOS, Node 20+, Xcode Command Line Tools (`node-pty` compiles natively).
`tmux` is optional but recommended — without it, several suites skip and the
app loses session persistence.

```sh
npm install     # postinstall rebuilds node-pty against Electron's ABI
npm run dev
```

## How checks are written here

Suites are tiered by cost, and where a new check goes is a design decision
rather than a convenience:

- **Plain node** (`scripts/verify-{viewport,registry,layout,palette,rail,review,tmux,agent-state,package,meta}.cjs`)
  for anything with no DOM, no `electron` import and no native dependency. Most
  logic belongs here, and several modules take their dependencies as
  parameters specifically so they can stay in this tier.
- **Electron as node** for anything that touches `node-pty`.
- **Real Electron** for anything that needs input against real pixels.

Two conventions matter more than style:

1. **A check's comment explains the failure it guards, not what it asserts.**
   The assertion is already in the code. What a future reader needs is why the
   naive implementation is wrong, and most of the failures guarded here are
   silent — a panel that renders nothing with no error, a diagram that is
   quietly out of date, an exit code of 0 printed as a failure.
2. **Watch a new check fail before you make it pass.** A check that has never
   been red is a check that has never been shown to test anything. Note that
   these suites have no per-check isolation: an uncaught exception ends the
   process, so every check after it silently never runs. If a check throws,
   confirm its neighbours separately.

`CLAUDE.md` documents the load-bearing invariants check by check. It is long,
and it is the best available answer to "why is this written so strangely" — the
answer is usually "because the obvious version fails silently".

## Commits

Conventional, scoped to the milestone: `feat(m9c): …`, `fix(m8a): …`,
`docs(oss): …`.
