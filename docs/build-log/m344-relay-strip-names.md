# M344 — the relay strip names people from the presence roster

**Verdict: shipped.** Closes the M336–M338 owed item "Remote names in the relay strip".
The strip read "3f9a2c1d is in control", and "Give control to 3f9a2c1d" on its grant
verb: eight characters of a uuid. It now says "sam is in control" when that person is
in this workspace's presence roster. Built 2026-09-26 on local `main` on top of M343.

## What landed

- **`presence/useRosterNames.ts`** (new): display names by user id from a workspace's
  presence roster. It re-renders only when the set of names changes, not on every
  15 Hz cursor report. It moved here from `SharedPlaceholderLayer`'s private `useNames`
  (M333), which now uses it too, so the placeholders and the relay strip cannot name
  one person two ways.
- **`relay-gate.ts relayNameOf(names, userId)`**: the roster's name, else the first eight
  characters of the id, which is what every name was before and what a person outside
  this workspace's roster still reads as. A blank name falls back too, so the strip
  never says " is in control".
- **`Canvas.tsx`** hands every `RelayNode` one `nameOf` (`relayNameFor`), built once per
  canvas from the active workspace's roster. `RelayNode` → `RelayTerminal` already took
  an optional `nameOf` (M335); nothing passed one.

## Decisions, and why

- **The active workspace's roster, not a global one.** A relay session is bound to a
  share, and the people who can attach are that share's members, who are the people
  in that workspace's presence roster. A relay panel in an unshared workspace has no
  roster: the owner is "You", and anyone else is outside the share.
- **Names only, never colours, in the strip.** The strip is one line of words. The
  owner's colour already rides the placeholder header and the cursor layer, and a
  coloured name in a control line would be a new token for one surface.

## Checks

`verify:relay` 56/56:
- `relay.names.1` (pure): a roster name wins; an unknown or blank name falls back to the
  id's first eight characters; the control line reads "sam is in control".
- `relay.names.2` (source text): Canvas builds the names from the active workspace's
  roster with the SAME hook the placeholders use, and hands them to every `RelayNode`.

## Gate

`npm run verify` (2026-09-26, 725.3s): 59/61. The two red suites carry only the baseline:
- `panels:agents` 80/82: `template.1`, `detail.1`.
- `panels:product` 109/118: `starter.1`, the six `workflow.*`, `reach.1`.

The first attempt stopped after wave 1. `verify:meta milestones.1` saw this ledger before
its README row existed, and the runner does not start the build on a plain red. The
rerun with the row in place is the result above.

## Owed

- **A golden with a remote controller named.** The `relay` scene is the owner alone in
  control ("You are in control"). A shared-workspace scene with a teammate in the roster
  belongs to M345's harness work.

Next: M345 (a shared workspace in the harnesses: the Members-view golden, a relay
placeholder with Attach, an Electron DOM check that clicks through the account menu and
share dialog, and a shared note bound in Source and Rich with Reload reverting).
