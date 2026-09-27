# M366 — `tc toolbox <name>`: the capability query from a shell

**Verdict: shipped.** M365's owed door. M365 let a person ask every agent's toolbox at once
from the palette ("Which agents can…"). An agent, a supervisor or a script had no way to
ask the same thing. `tc toolbox review` now answers per panel, has-first, in the palette's
own words:

```json
{ "ok": true, "name": "review", "panels": [
  { "id": "b1", "label": "review seat", "answer": "has", "words": "has skill review · project" },
  { "id": "a1", "label": "lint seat", "answer": "lacks", "words": "no review" } ] }
```

It is read-only and socket-only, like `tc status`. The answer is names, scopes and states,
never an entry's contents.

## What landed

- **`main/toolbox-door.ts`** (new): `createToolboxDoor`, main's one toolbox read, lifted
  out of the `toolbox:read` handler's closure. It does the tilde expansion, the three
  refusals (a relative path, a file, a missing folder) and the cached read, with the
  plugin list asked only on a miss. `ipc.ts`'s handler is now one line over it.
- **`shared/toolbox-query.ts`**: `capabilityAcross(query, asked, read)` reads each
  distinct directory once and answers each panel. The palette's `onCapabilityQuery`
  (`Canvas.tsx`) and the control handler both use it, so neither groups directories its
  own way.
- **`ControlCanvasModel.panels[].toolsCwd`**: the renderer fills it from
  `inspectionDirectory(panel, 'tools')`, the inspector's own rule. `tc status` carries it
  too.
- **The verb**:
  - `cli/tc.ts` builds `tc toolbox <name>` and gains a usage line;
  - `control-protocol.ts` refuses an empty, over-long or multi-line name;
  - `control-handler.ts` asks the canvas for the directories, reads through the door and
    sorts by `CAPABILITY_ORDER`;
  - `control-wiring.ts` builds a door over main's ONE `ToolboxCache`.
- **`main/index.ts`** builds the toolbox handlers before the control wiring, so the
  control wiring and `toolbox:read` ask plugins through the SAME runner. They read
  `state` at use, so the earlier construction changes nothing.
- **The supervisor's prompt** (`SUPERVISOR_PROMPT`) names `tc toolbox` for the question a
  person asks a supervisor: "which of these agents can review?"

## Decisions, and why

- **Lifted, not copied.** M194 found a third hand-written directory rule disagreeing
  silently. A second copy of main's read for the CLI would be the same failure. The door
  is built twice (IPC and control) over one cache, so a directory the palette just read
  is a cache hit for `tc toolbox`, and the reverse.
- **The renderer names the directories, main reads them.** Which directory a panel's
  Tools surface reads is the renderer's rule (a sandbox chat has none, and a terminal's
  is its configured cwd, not its live one). Main asking the layout itself would be a
  second copy of that rule.
- **A read-only query is not a verb, so it has no workflow node.** It changes nothing,
  like `tc status` and `tc audit`. Its doors are the Inspector's Tools tab (one panel),
  the palette scope (every panel, M365) and this verb (every panel, from a shell).
- **Socket only.** The URL door accepts `open` and `task` and nothing else, so a web page
  cannot probe which skills a machine has.

## Checks

- `verify:control`:
  - `toolbox.door.1`, the lifted door against real directories:
    - an empty cwd, a relative path, a file and a missing folder are refused, each by
      its own sentence;
    - a project's `review` skill answers `has · project`;
    - two readers of one directory ask plugins once.
  - `toolbox.1`, the verb:
    - `tc toolbox review` builds, and `tc toolbox` alone is a usage error;
    - an empty or multi-line name is refused;
    - two panels in one directory cause one read;
    - rows come has-first in the palette's words, and a panel with no tools directory
      is not listed;
    - no window, and no door, are each refused by name, and an empty canvas says so.

  35/35.
- `verify:toolbox` 106/106 and `verify:palette` 162/162 stay green. The palette's scope
  now reads through `capabilityAcross`.
- `verify:agent-session` 179/179 and `verify:swarm` 39/39 with the supervisor's new
  sentence.

No display changed, so `verify:visual` was not run.

## Gate

At this commit: `npm run typecheck` is clean, and the plain suites the change reaches are
green: `verify:control` 35/35, `verify:toolbox` 106/106, `verify:palette` 162/162,
`verify:agent-session` 179/179, `verify:swarm` 39/39, `verify:meta` 51/51 and
`verify:verbs` 30/30.

The full `npm run verify` ran once for the chain M366, M373 and M374, on the tree holding
all three. The machine's load stood at 200 to 400 for most of an hour, from an iOS
simulator booting and media analysis, and one Electron tier per milestone under that
load was flake after flake. The chain gate's result is in M374's ledger.

## Owed

Nothing new.

Next: M362 (a proposal golden on a laned fixture task), or M368 (the narrow header's
pill).
