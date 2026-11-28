# M701: A week of real use, as numbers

The next stage of Terminal Canvas is meant to come from how Alex really works, not from a longer
feature list. Nothing recorded that. This milestone adds the recording and the scripts that turn a
week of it into numbers, and it sets the pass/fail numbers now, before any new capability is built,
so the result can't be graded on a curve chosen afterwards.

This is step 1 of the plan Alex approved on 2026-11-27. Steps 2 to 5 (the three places time is
lost, the opportunity tree, prototypes, builds) wait for a week of data from his Mac.

## What landed

- **`telemetry.localEventLog`**, "Keep a usage log on this Mac". Settings, Privacy & telemetry,
  its own "Usage log" section. Off by default and never `planWritable`. Read at every record, so
  it takes effect at once.
- **`src/shared/event-log.ts`**: the record format (every field a record can carry is in one
  union), a strict parser, and `summarizeEvents`, the arithmetic behind every number below.
- **`src/main/event-log.ts`**: the writer. One JSONL file per local day under
  `<userData>/event-log`, a 2 MB cap per day with one `cap` record, 30 days kept (by file name),
  panel and request ids hashed with a salt kept beside the logs (`.salt`, mode 0600). Batched once a
  second; flushed synchronously at quit.
- **`src/main/bootstrap/event-log-wiring.ts`**: builds it and tracks APP focus (a move between the
  app's own windows is not a switch). Hooked at the places that already fan out: the agent
  runtime's subscribe, the PTY manager's agent-state hook, `layout:save` (through an optional
  `layoutSaved` member, so no positional parameter moved), whenReady after the instance gate, and
  before-quit after its gate.
- **`npm run event-report`**: prints the log's numbers (`--json` for the raw summary,
  `--log-dir`, `--days`).
- **`npm run collect-week`**: the whole week in one JSON file under `out/week/` (git ignores it),
  from the event log, Claude Code transcripts, shell history, `layout.json` and `git log`.
- **`verify:event-log`**: 28 checks, plain-node tier.

## What a record holds, and what it never holds

| Record | Fields |
| --- | --- |
| `app` | `start`, `quit` or `log-on`, and whether the app had focus |
| `focus` | the app gained or lost focus |
| `state` | a terminal panel's hash, its agent (`claude-code`, `codex`, `copilot`, `shell`), its new attention state |
| `chat` | a chat panel's hash, `ask`/`answer`/`dropped`/`auto-allowed`/`done`/`sent`, a request hash, a tool's built-in name or `mcp`/`other`, allow or deny |
| `panels` | how many panels of each kind, only when the counts change |
| `cap` | the day's file is full |

Never written: commands, output, prompts, tool input, paths, titles, workspace names. `verify:event-log`
writer.2 feeds a session event full of a path, a command and a key and checks none of it reaches the
file. The collector keeps counts too: first words of shell commands, numbers of prompts and tool
calls, gap times, panel kinds, commits and lines. Repos are named by their folder's last part.

Nothing is sent anywhere. wiring.2 checks that neither module, the wiring, the report nor the
collector imports a network module or calls `fetch`.

## What each number means

- **Needs you to answered.** A terminal's wait runs from `wants-you` to its next state; an exit first
  is "ended", not an answer. A chat's wait runs from a permission request to its answer, paired by
  request. Reported as median and p90, split by whether the app had focus when the ask arrived, plus
  the share of all waiting spent with the app out of focus.
- **Switches to another tool.** Each time the app loses focus while running, per hour in the app.
  The collector adds two outside views: commands that open another app (`code`, `cursor`, `open` and
  similar, a rough proxy), and Claude Code sessions run in folders the canvas has open versus
  elsewhere.
- **Next instruction.** A chat's turn ending to the person's next message reaching it.
- **Panel mix.** Counts at the last save, the peak of each kind, the most at once.

## Pass/fail numbers, set before building

Each is compared with the baseline week this milestone collects, measured the same way, on the same
Mac. A week counts only if it has at least 20 answered asks and 10 hours in the app; ask volume must
be within half to double the baseline's, or the comparison is reported as not comparable.

| Number | Source | Pass |
| --- | --- | --- |
| Needs you to answered, median | `event-report` | at least 30% lower than baseline |
| Needs you to answered, p90 | `event-report` | at least 40% lower than baseline |
| Answered while away, median | `event-report` | at least 30% lower than baseline |
| Switches to another app per hour in the app | `event-report` | at least 25% lower than baseline |
| Claude Code sessions outside canvas folders, share | `collect-week` | at least 25% lower than baseline (relative) |
| A fresh agent session builds a working plugin from the docs alone | new check, step 5 | 4 of 5 runs |

The plugin check, defined now: five fresh Claude Code sessions, each given only the extension API's
docs and one brief from a fixed list of five, may not edit any file outside the plugin's folder (a
`git diff` path check fails the run), and pass only when the plugin loads in the app and its own
verify check passes. There is no public extension API today, so the baseline is 0 of 5 by
construction, not by measurement.

Performance limits for anything step 5 builds, at 30 live panels (`scripts/lib/real-app.cjs`
`openPanels` and `chatter`, the soak's own tools): frame time p95 from `wheelFrames` and
`frameStats` at most 16.7 ms and at most 10% above `main`'s on the same Mac; the process tree's
resident memory from `sampleCost` at most 10% above `main`'s.

## Checks re-pinned

- `verify:world` world.wire.3 used to require the PTY observer to be the single expression `(update, agent) => state.worldFeed?.terminal(update, agent)`. The observer is one slot and now also feeds the event log, so it is a block. The check now requires the block form with the world feed as its first statement, still read through MainState at the point of use. Same strictness, new shape.

## Running it on the Mac

1. Build this branch, then turn on Settings, Privacy & telemetry, Keep a usage log on this Mac.
2. Work as usual for a week.
3. `npm run collect-week -- --repo <path>` for each repo worked on (or none: it finds the git repos
   of the folders panels are open in), then `npm run event-report` for the log alone.

## Not done on purpose

- **The terminal attention signal is the detector's.** `wants-you` is inferred from bytes; a
  prompt the detector misses is not an ask in the log. The chat side is exact (permission requests).
- **No in-app view of the numbers.** A report script is enough for a week of evidence, and a
  dashboard chosen before the evidence is the thing this milestone exists to avoid.
- **Shell history is not split by terminal.** It mixes canvas terminals with any other terminal,
  so "commands that open another app" is labelled as the rough proxy it is.
- **Electron-tier coverage.** The wiring is pinned as source text (wiring.1); a real-app check that
  the file appears after a focus change belongs with the step 5 performance check, which launches
  the built app anyway.
