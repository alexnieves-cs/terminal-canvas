# Acts V and VI — the executor and the portable file (M188–M189)

The v9 run's fifth and sixth acts, built together on `v9-act5-nodes` and merged as one. Their
ledger lines — the specs, the red-first evidence, every decision and every strike — are
`docs/build-log/m180-m200-ledger.md` under `## M188` and `## M189`.

## What the acts are

- **M188, the executor.** Two executable node kinds on the template union. An `action` node
  holds a canvas verb LINE and runs it through the same `runAgentPlan` the agent door takes; a
  `http` node does a GET, with every other method refused by name because a write belongs on the
  broker's approval path and no node speaks to it. `Test this node` runs ONE block and reports
  its input, its duration and a named failure, starting no neighbour and recording no run.
- **M189, the file.** One portable canvas file, built field by field so nothing of this machine
  can travel, scrubbed with its count on the record, with every omission named by what it would
  do elsewhere. Import makes a separate workspace, remaps every id, and starts nothing.

## The four-door rule is closed

Every v9 verb has carried an OWED workflow door since M180, recorded as data
(`{ reason, due: WORKFLOW_EXECUTOR_DUE }`) and read by `closure.v9.1`. M188's action node IS
that door, so every row now names one and the check asserts it the way it asserts the agent
door: the line must BIND through `buildPlan` to that verb, and `action` must be a kind the
library offers. `node-test` alone keeps an owed door, with a reason that is not the executor's
absence: a node that tests a node is a loop with no stop.

## The three commands

Run on `v9-act5-nodes` at the act's head, in the environment `out/v9-evidence/run-electron.sh`
sets.

| Command | Exit | Result | Log |
|---|---|---|---|
| `npm run verify` | 0 | every suite's tally, no FAIL line | `out/v9-evidence/act56-verify.log` |
| `npm run verify:visual` | 0 | 59/59 | `out/v9-evidence/act56-visual.log` |
| `npm run verify:packaged` | 0 | 12/12 | `out/v9-evidence/act56-packaged.log` |

## What these acts struck, and why

A `shell` node (the terminal node already exists, with a process seam and an approval story a
second one would not have); a `transform` node (it needs an expression language this run cannot
design and measure honestly, and a half-designed one becomes a compatibility burden the moment a
template holds it); Slack, email, webhook and cron nodes (each needs a token, a domain, an armed
listener across a relaunch or real elapsed minutes — this run can prove none of them); a write
from any node (the broker's approval door has no node-side entry, and a node that could POST
without it would be a way around the door this app already built); and the extension registry
with its example plugin (a new trust path into Electron, the filesystem and the credential
store, whose own acceptance evidence requires an external directory and a person to walk it).
