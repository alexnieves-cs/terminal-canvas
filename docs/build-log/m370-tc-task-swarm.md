# M370 — `tc task --swarm`: a task proposed with its arrangement

**Verdict: shipped.** Arc 4, "team up", in its smallest honest shape. `tc task` (M313)
proposes a task from any terminal: the canvas opens Start work filled in, and a person
presses Start. It had no way to name an ARRANGEMENT. M275's Explore, Implement, Test and
Review swarms could only be chosen by hand on the sheet. Now `tc task "fix login"
--swarm review` opens Start work with the Review arrangement already chosen. It is still a
proposal: nothing is added, dispatched or run until a person presses Start.

## What landed

- **`cli/tc.ts`**: `--swarm <preset>`, and the usage line naming the four.
- **`main/control-protocol.ts`**: the task request carries `swarm`, kept only if it is one
  of `SWARM_PRESET_IDS`, and otherwise refused naming the four.
- **`shared/ipc-contract.ts`**: the board's `propose` op carries it to the renderer.
- **`Canvas.tsx`**: the proposal passes it to `beginStartWork`, which already took an
  arrangement (M275).

## Decisions, and why

- **A proposal, as `tc task` always was.** An agent's shell can reach this socket, and
  an arrangement spawns several agents. So the sheet opens with it chosen, and a person
  starts it. The URL door (`terminal-canvas://task?…&swarm=review`) is allowed for the
  same reason: a web page can pre-fill a form, never act.
- **By name, from the four, never free text.** An unknown arrangement is refused at the
  door with the list, rather than opening a sheet with nothing chosen and letting the
  person wonder what happened to the flag.
- **"Team up" is not a new verb.** Joining teammates is already `tc join` and `tc
  open-share`. What was missing was starting a team of agents from a terminal, which is
  this flag.

## Checks

- `verify:control task.swarm.1`:
  - `--swarm review` builds, and a flag with no value is a usage error;
  - the protocol keeps `review` and refuses `everything`, naming the four;
  - the handler hands `{ op: 'propose', swarm: 'review' }` to the canvas.

  33/33.

## Gate

`npm run typecheck` is clean. The full `npm run verify` ran 59/61 suites in 736.6s, and
every red is the baseline:
- `verify:panels:agents`: `template.1` and `detail.1`.
- `verify:panels:product`: `starter.1` and the seven `workflow.*`.

No display changed, so `verify:visual` was not run.

## Owed

Nothing new.

Next: M366 (`tc toolbox <name>`, after lifting main's toolbox read out of `ipc.ts`).
