# M365 — which agents can…: the cross-panel capability query

**Verdict: shipped.** Arc 3, the toolbox capability query. The backlog's #26 named this as
its next milestone: "a palette scope where typing a capability name lists the panels that
have it, and the panels that do not". M21 made one panel's toolbox readable. Nothing asked
every agent at once, so "which of these agents can actually review, or reach GitHub?" meant
opening each panel's Tools section in turn.

`Which agents can…` is a palette door into a new `capability` scope. The query box IS the
name: a skill, a command (`/review`, or `review` for `git:review`), an agent (`@reviewer`)
or an MCP server. Every panel with a toolbox directory answers from its own toolbox, one
row each, in the order that matters:
- **has**: `has skill review · project`;
- **inactive**: `skill review · user — disabled` (or needs approval, or state unknown);
- **unknown**: `unknown — the toolbox was cut at its cap — 3 entries not read` (or not
  read yet, or the read failed);
- **lacks**: `no review`, or `no review — 2 plugins not read may provide it`.

A row goes to its panel.

## What landed

- **`shared/toolbox-query.ts`** (new, pure):
  - `normalizeCapability`;
  - `capabilityOf(query, ToolInventoryResult)`, the four answers, or null for a panel
    with no directory;
  - `capabilityWords`;
  - `CAPABILITY_ORDER`.
- **The palette**:
  - the `capability` scope (`palette-model.ts`);
  - its door and rows (`commands.ts`): a hint for an empty name, "reading" before the
    answers, "no agent has a toolbox" for none;
  - the context fields (`commands/context.ts`);
  - `Palette.tsx`, which reports the query while the scope is open, as M42's search
    does, and passes the answers in.
- **`Canvas.tsx`**: `onCapabilityQuery`. It asks the inspector's own rule
  (`inspectionDirectory(panel, 'tools')`) for every panel's directory, reads each
  DISTINCT directory once through `toolbox:read` (main's `ToolboxCache`), and lands only
  the latest query's answers.

## Decisions, and why

- **Four answers, not two.**
  - An entry that is present but disabled or awaiting approval is `inactive`, never
    `has`, or a person is sent to an agent that will refuse.
  - A read cut at its cap cannot say `lacks`, because the name may be among what was
    dropped, so it says `unknown` with the count.
  - `lacks` counts the enabled plugins this app does not enumerate. "no review" alone
    can be false when a plugin supplies it, and "unknown" for every plugin user would
    say nothing.
- **The inspector's directory rule is asked, not copied.** M194 found a third
  hand-written copy disagreeing silently. A sandbox chat answers `absent`, so it is not
  listed.
- **One read per directory.** Panels in one repository share a toolbox. The reads are
  main's cached reads, and the query is pull-only, like the toolbox itself.
- **No golden of the answers.** They are read from the real `~/.claude` of whoever runs
  the harness, so a golden would pin one machine's skills. The rows are checked in
  `verify:palette` against fixed answers, and the matcher in `verify:toolbox` against
  fixed inventories.

## Checks

- `verify:toolbox`:
  - `capability.1`:
    - a namespaced command, a leading `/` or `@`, and any case all match;
    - disabled and needs-approval are `inactive`;
    - lacks counts the plugins it did not read;
    - cut, failed and unread are `unknown`;
    - hooks have no names;
    - no-cwd answers nothing.
  - `capability.2`: the four lines, and the order.

  106/106.
- `verify:palette capability.rows.1`:
  - every answer survives the scope's filter though no title holds the name;
  - rows are in answer order, and a row goes to its panel;
  - hint and reading;
  - the door is found by its words.

  162/162.

`UPDATE_GOLDENS=1 npm run verify:visual` wrote nothing: every scene stayed inside both
budgets, so the new door moves no committed picture. The scope's answers get no golden,
for the reason above.

## Gate

`npm run typecheck` is clean. The full `npm run verify` ran in 720.5s: 59/61 suites, and
every red is the baseline.
- `verify:panels:agents`: `template.1` and `detail.1`.
- `verify:panels:product`: `starter.1` and the seven `workflow.*`.

## Owed

- **M366 (proposed): `tc toolbox <name>`.** An agent asking the same question through
  its shell, which is the capability query's second door. Main's toolbox read lives
  inside the `toolbox:read` handler's closure (tilde expansion, stat checks, plugins
  resolver), so it must be lifted out of `ipc.ts` first. A copy would be a second
  directory rule, which M194 warns against. The panels' tools directories can ride
  `status`'s canvas model as a `toolsCwd` field, computed by the renderer's own rule.

Next: M369 (the decision audit: what a person decided, scrubbed, outliving the ledger).
