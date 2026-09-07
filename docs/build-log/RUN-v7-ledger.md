# The v7 run — ledger (M134 →, 3.1.0 → 4.0.0)

Started 2026-09-07 at `pre-v7-run` (= `328e087`, the head of the M126–M133 act). Unattended,
goal mode. This file is the run's resumable state: the milestone map, each act's status, every
declined item by backlog number with its reason, and the evidence lines (command + exit code)
the final message is built from. It is appended to, never rewritten, so a session that resumes
mid-run reads the last section and continues.

## Milestone map

M133 is the last number used before this run (`docs/build-log/m126-m133-act3-skills-and-workflows.md`,
renumbered one up in `9d96b37` because Act II's 3.0.0 ship had claimed M125). `grep -rn M134`
over `docs src scripts README.md CLAUDE.md` finds nothing, so M134 is free. Numbers below are
assigned in order and never reused; a milestone that is declined keeps its number and says so.

| # | Act | One line |
|---|---|---|
| M134 | 0 | Baseline: the tag, the tallies, 3.1.0 for the unversioned M126–M133 debt, CI status, `verify:panels` timed three times, the inventories |
| M135 | I | Split `verify:panels` into suites, each watchdog 1.25× its own measured green |
| M136 | I | `npm run handcheck`: the eleven owed hand checks — automated where provable, the rest as exact human steps |
| M137 | I | The deferred-minors sweep (the by-file list from the M126–M133 log) |
| M138 | I | A production Run caller for `pool` / `orchestrator` / `collect` |
| M139 | I | CI at its cause, and the fourth dead-end audit (every surface since M124) |
| M140 | II | #26 — the toolbox's write half beyond skills |
| M141 | II | #27 — prompt placeholders (`{{cwd}}`, `{{branch}}`, `{{selection}}`, `{{panel}}`) |
| M142 | II | #19 — cost history and per-workspace / canvas totals |
| M143 | II | #53 — the live tier's card from a serialised screen |
| M144 | II | #60 — zoom-independent chrome, chrome and handles only |
| M145 | II | #13 — the image handoff into a terminal's agent (needed by Act V) |
| M146 | II | #23 — zoom to fit, a camera flight, named apart from maximise |
| M147 | II | #34 — per-preset environment overrides and template sets (needed by Act V) |
| M148 | III | The visual-regression suite over the shot harness (goldens, tolerant diff, gated like `verify:packaged`) |
| M149 | III | `docs/ux-audit-4.0.md`: every scene viewed, findings fixed; empty/loading/error states; motion, reduced motion, focus order; chrome a11y; density |
| M150 | IV.1 | The Obsidian panel on the M16/M22/M27 file lineage: wikilinks, tags, backlinks |
| M151 | IV.2 | A conditional / loop workflow block on the live Run caller |
| M152 | IV.3 | #55 — ad-hoc task panels |
| M153 | IV.4 | #73 + #72 — the flag registry and one versioned automation surface |
| M154 | IV.5 | #64 — rationing terminal memory |
| M155 | V.1 | #15 — the annotation layer per its entry (ink, highlights, draw mode over M93's notes) |
| M156 | V.2 | #66 — images in the terminal |
| M157 | V.3 | The vibe-coding starter as a #34 template set (chat + dev shell + browser, #13 briefing) |
| M158 | V.4 | #14 — xlsx, read-only |
| M159 | V.5 | #33 — the minimap, against what M70 already shipped |
| M160 | VI | 4.0.0: the version, the tag, README / CLAUDE.md / manual-only list / dead-end audit current, the release body as a repo file |

Out by the brief: #4, #28, #40, #20, signing.

## Act 0 — M134

- `git tag pre-v7-run` at `328e087` (clean tree, `main`). Done.
- pool-runner.ts has no production caller: `grep -rn pool-runner src` finds only the module
  itself; the only importers are `scripts/verify-agent-session.cjs` and its entry. Confirmed.
- CI: the `verify` workflow's last run on `main` is **34101554825** (2026-09-07T08:37Z), status
  `failure`, at `verify:pty` check 8 `claude on PTY PATH — claude not found`: the runner has no
  `claude` binary, and the check asserts a fact about the machine rather than the code. The two
  runs before it (34060199326, 34048553964) failed the same way. Fixed at its cause in M139;
  a green run id needs a push, which this run is forbidden to make — see M139.
