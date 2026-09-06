# M108 — Ship 2.2.0: build log

Branch `main`, 2026-09-05. The closing milestone of the M96–M108 run, after three act gates
(`m96-m99-act1-control.md`, `m100-m103-act2-identity.md`, `m104-m107-act3-polish.md`).

## The version: 2.2.0, not 2.1.0

The run prompt set the threshold: 2.1.0 unless Act II shipped BOTH teammates and the
browser pane. It shipped both — M100's persistent identity with places, memory and a brief
that rides every spawn, and M103's eleventh kind, a `<webview>` guest inside the one frame
under the shipped CSP. Each is a new noun the app did not have at 2.0; together they are a
minor above what a bump for the verb table, Auto and grants alone would have earned. Hence
2.2.0: `package.json`, the README status line and `verify:meta version.1` say it together.

## Reconciled against the contract

`Object.values(IPC)` holds 107 invoke channels; every one is named in BOTH diagrams (the
README's, pinned by `verify:meta` 19, and CLAUDE.md's copy), checked by a script over the
contract's own text rather than by eye. `EXPECTED_CHANNELS` in `verify:ipc` is 107. The
README's milestone table runs M1–M108 in sequence with a build log behind every row from
M36 on (`verify:meta milestones.1`). CLAUDE.md's architecture list carries an entry for every
seam this run added, and `docs/load-bearing.md` holds the invariants beneath them.

## The dead-end audit and the manual-only list

`docs/dead-end-audit.md` gained `### The surfaces this run added (M96–M107)` — twelve
surfaces walked for the rule every administrative affordance obeys: present at rest,
disabled with a named reason, never removed. `verify:meta audit.1` still finds every
`REASON_*` named. The manual-only list at the end of `docs/load-bearing.md` was re-read
entire at 2.2 and extended by one entry (the ⋯ menu's palette door on a real click); the
acts had appended their own as they landed.

## The packaging gates, with the numbers

| Gate | Result | Numbers |
|---|---|---|
| `verify:package` (in the chain) | 13/13 | the builder config as a value: unsigned, `hardenedRuntime` off, arm64 default |
| `verify:packaged` (run alone) | 12/12 | `electron-builder --dir` → `release/mac-arm64/Terminal Canvas.app`, 299 MB; the launched binary reported `packaged=true`, the login-shell probe gained five PATH entries launchd never gave it, `backend=tmux (tmux 3.7c)`, a PTY spawned, `tc open` answered through the packaged launcher, a second instance refused and the incumbent's PTY survived |

The build stays unsigned. No `.dmg` was produced for 2.2.0 — the gate packages a directory
only, and publishing is outside this run.

## The graph

`graphify update .` refreshed the code layer: 5090 nodes, 7690 edges, 397 communities
(the HTML viewer skipped above its 5000-node limit). The full `graphify .` for the doc and
concept layer needs an LLM key and none is set on this machine, so the semantic layer is as
of the last keyed run; recorded, not worked around.

## The chain

`npm run verify` green on `main` after Act III's merge (panels 307/307); `verify:meta`
31/31 after the version bump and this log. No push, no tag, `origin` untouched.
