# M60 — Ship

**Status:** designed 2026-09-02. The scope decision's last row: "`1.0.0`.
The icon. `npm run package` and `npm run verify:packaged` green. README
install true for a stranger, Gatekeeper honest, 'what it does not do'
listing worktree isolation. `CLAUDE.md`, `docs/load-bearing.md`, both IPC
diagrams and the suite table accurate; the manual-only list shorter;
`graphify update .` run."

## What this milestone is for

Everything before it built the software; this one makes the artifact a
stranger can install and the documents a stranger can trust. Nothing new
is built here on purpose: a feature that lands in the ship milestone has
no audit and no build log of its own.

## Shape

- **`1.0.0`** in `package.json`; the README status line says so and stops
  calling itself a beta used by one person.
- **The icon.** `build/icon.png` (1024, authored by `build/make-icon.cjs`,
  a dependency-free PNG encoder so the icon is reproducible from source)
  and `build/icon.icns` from `sips` + `iconutil` (`npm run icon`). The
  builder config names it (`mac.icon`); `verify:package icon.1` pins that
  the config names a file that exists.
- **The two gates.** `npm run package` (unsigned `.app` and `.dmg` into
  `release/`) and `npm run verify:packaged` (the real binary launched with
  a stripped PATH, a throwaway user-data dir and a scratch tmux socket)
  both green, and their outcome recorded in the build log with the numbers
  they printed — not "green" in prose.
- **Docs reconciliation.** `CLAUDE.md`'s summary paragraph describes 1.0,
  not M1–M9c; the suite table's counts match what the suites print; both
  IPC diagrams match the contract (`verify:meta` already pins one, and
  `claude-md.1` the other); the README's "what it does not do" names
  worktree isolation honestly; the manual-only list in
  `docs/load-bearing.md` is re-read and every item still true is kept,
  every item a suite now covers is struck.
- **`graphify update .`** run last.

## Verification

- `verify:package icon.1` the icon file exists and the config names it;
  `verify:meta version.1` `package.json` is `1.0.0` and the README's status
  line agrees.
- `verify:packaged` 11/11, recorded.
