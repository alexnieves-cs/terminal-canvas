# The streams run (M457–M509)

Five streams run at once on separate branches, each opened as its own PR against
`main`. The plan, each stream's first PRs and how each is checked done are in
[ROADMAP.md](ROADMAP.md). The state is the ledger,
[m457-m509-ledger.md](../build-log/m457-m509-ledger.md), not memory.

| Lane | Stream | Milestones | Goal |
|---|---|---|---|
| A | Trust the gate | M458–M464 | Every suite blocks: `KNOWN_RED` empty, `verify:visual` on CI |
| B | Ship 6.0 | M465–M474 | Shots on CI, goldens after the owner looks, a DMG on a GitHub release |
| C | Autonomy | M475–M486 | Check-gated done, Tonight batches, morning queue, collision radar |
| D | Reach | M487–M494 | `tc mcp` server, then phone alerts |
| E | Cut and untangle | M495–M509 | Cut list, Follow, `Canvas.tsx` split, memory cap, command panels |
| F | Visual and motion polish | M510–M519 | State at a glance, one motion system, layout fixes; plan in [polish.md](polish.md) |

## Setting your lane

The edit hook (`.claude/hooks/guard-paths.sh`) reads your lane from `RD_LANE`, or,
where the environment cannot be set (a cloud session), from `.git/tc-lane`:

```sh
echo C > .git/tc-lane
```

`.git/` is never committed, so the lane stays with the checkout. With no lane set
the hook allows everything, which is the lead's mode, not a stream's.

## Ownership

[ownership.json](ownership.json) lists each lane's files. The rules, in the order the
hook applies them:

1. **Another lane's file is refused.** Append what you need to
   [requests.md](requests.md) and carry on, or expose it from your own files.
2. **A shared file** (`shared_writable`) is open to every lane: the IPC contract,
   preload, `ipc.ts`, `bootstrap/`, `Canvas.tsx`, `package.json`, `CLAUDE.md`,
   `verify-meta.cjs` and the ledger. Keep each touch small and additive (one new
   block, one import and one call), and rebase onto `main` before every push.
3. **`styles.css`** is shared but fenced: a lane writes only between its own
   `/* ── st:<lane> ── */` markers. To change an older rule, override it from
   inside your block; the later rule wins.
4. **A file nobody owns** is open to every lane, so a stream is never blocked on
   something nobody claimed. If two streams start editing one, the second claims
   it in `ownership.json` in a one-line PR first.

The redesign's frozen foundations and its lanes (`docs/redesign/`) stay as they
were; they apply only to a redesign lane id.

## Rules every stream keeps

- **Small PRs, one milestone each**, commits scoped by milestone (`feat(m475): …`).
- **New checks take scoped ids** (`auto.check.1`, `mcp.tools.1`), and a new suite is a
  new `verify:*` key in `package.json`; the runner picks it up.
- **Never skip, quarantine or loosen a check** to get green. Moving a suite *into*
  `KNOWN_RED` needs the owner's yes.
- **Never write goldens** until the owner has looked at the shots (B3 is the one
  door, and it opens a PR).
- **An outward-facing verb** (an MCP write, a phone push) goes on `outward`'s caller
  list and gets a fresh-context critic before merge.
- **Merge order on a conflict:** E's `Canvas.tsx` split PRs land first; everyone else
  rebases onto them.
- A stream records each merged PR as one row in the ledger.
