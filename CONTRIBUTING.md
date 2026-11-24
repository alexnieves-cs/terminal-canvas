# Contributing

Thanks for taking a look. Terminal Canvas is maintained by one person and the surface still
moves, so an issue that says what you were trying to do is often more useful than a large pull
request against something that may be about to change. Small fixes, docs corrections and bug
reports with steps are always welcome.

## Ways to help

- **Try it and say what happened.** The [feedback form](https://github.com/alexnieves-cs/terminal-canvas/issues/new?template=feedback.yml)
  takes two minutes, and the [live demo](https://alexnieves-cs.github.io/terminal-canvas/demo/)
  needs no install.
- **Report a bug.** The [bug report](https://github.com/alexnieves-cs/terminal-canvas/issues/new?template=bug_report.yml)
  asks for the details that make it fixable: macOS version, chip, and how you installed.
- **Suggest a feature.** Describe the situation, not only the solution. Check
  [docs/ideas-backlog.md](docs/ideas-backlog.md) first; your idea may already be there.
- **Send a pull request.** Open an issue first for anything bigger than a small fix, so we can
  agree on the shape before you spend the time.

Security problems go through a private report, never a public issue. See [SECURITY.md](SECURITY.md).

## Setup

You need macOS, Node 20 or later and the Xcode Command Line Tools, because `node-pty` compiles
natively. `tmux` is optional but recommended: without it, several suites skip and the app loses
session persistence.

```sh
npm install     # postinstall rebuilds node-pty against Electron's ABI
npm run dev
```

## Checking your change

There is no unit-test runner and no linter. One command runs every suite, a typecheck and a
build, and CI runs the same thing on a Mac for every pull request:

```sh
npm run verify
```

Between full runs, `npm run affected` runs only the suites your branch's changes reach.
[docs/development.md](docs/development.md) explains how the suites are organised, and
[docs/verify-suites.md](docs/verify-suites.md) lists the rules for adding a check.

Suites are tiered by cost, so where a new check goes is a design decision:

- **Plain node** for anything with no DOM, no `electron` import and no native dependency. Most
  logic belongs here.
- **Electron as node** for anything that touches `node-pty`.
- **Real Electron** for anything that needs input against real pixels.

Two conventions matter more than style:

1. **A check's comment explains the failure it guards, not what it asserts.** The assertion is
   already in the code. A future reader needs to know why the obvious implementation is wrong,
   and most failures guarded here are silent: a panel that renders nothing with no error, or a
   diagram that is quietly out of date.
2. **Watch a new check fail before you make it pass.** A check that has never been red has never
   been shown to test anything. A new check takes a scoped id such as `ok('kind-tail.1 ...')`,
   never the next number.

Before changing a module, run `npm run lb -- <module>`. It lists the rules recorded in
[docs/load-bearing.md](docs/load-bearing.md) that name that module, which is usually the answer
to "why is this written so strangely": the obvious version fails silently.

## Screens and screenshots

The README's pictures are the visual goldens in `verify/visual/goldens/`, and `verify:visual`
compares the app against them. A change that moves pixels on purpose says so in the pull
request. The maintainer regenerates goldens after looking at them; please do not commit new
ones yourself.

## Commits and pull requests

Commits use the conventional format, scoped to a milestone when there is one: `feat(m646): ...`,
`fix(m690): ...`, `docs(readme): ...`. The pull request template asks what changed, why, and how
it was checked.

## Code of conduct

Everyone taking part is expected to follow the [code of conduct](CODE_OF_CONDUCT.md).
