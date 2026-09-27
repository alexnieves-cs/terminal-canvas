# M385 — each panels part starts with no composer drafts

**Verdict: shipped.** `verify:panels:product onboarding.start.1` failed in three separate
part runs, one of them at load 5.9. Each time it was written off as the known load flake
and passed on a rerun. Its own log said otherwise: the composer held
`ask: list itReply with exactly the word:`.

A serial run keeps ONE Electron `userData` across panels parts and across runs, so the
renderer's `localStorage` outlived each part. `verify:panels:orchestrate` leaves a
composer draft on purpose (its recover check puts `ask: list it` in a chat's composer,
unsent), and M322 keeps drafts by PANEL id. When `onboarding.start.1` minted a chat under
the same id, the composer opened holding that draft. The typed prompt went out behind it,
and the recorded agent, which answers its exact prompt, never said `pong`. Whether the
ids collided depended on what each part had minted before, which is why it looked like
chance.

Now the harness removes the drafts key (`tc.chat-drafts`) from the renderer's
`localStorage` before each part's first load. It reaches the key through a blank page on
the renderer's own `file://` origin.

## What landed

- **`scripts/panels-harness.cjs`**: a blank page is loaded, the drafts key removed, and
  then the renderer is loaded. The why is beside the lines.

## Decisions, and why

- **Only the drafts key, never the whole store.** The first fix cleared every
  `localStorage` entry before the first load. `verify:panels:onboarding` then passed, and
  `verify:panels:shell 98b` (the empty queue's own sentence) and `106` (the inspector's
  review node) went red, both in the gate and when rerun alone. Those checks read
  per-viewer state an EARLIER part leaves in the same store. panels:core, then
  panels:shell, is 83/83 and 105/105 once only the drafts are removed. So the blunt fix
  moved the red instead of removing it, and the narrow one removes the leak that failed
  without disturbing what other parts rely on.
- **Other parts depending on an earlier part's state is its own hermeticity gap**, and it
  is owed below. A suffixed, parallel run gives each job a fresh `userData`, so that mode
  does not have those parts' state either.
- **Once, before the first load.** Within a part, a draft still persists across reloads,
  which is M322's feature and its own checks' subject.
- **The flake rule was followed, and it was not enough.** Rerunning a red once in
  isolation is the run's rule, and the rerun passed, because the collision depends on
  what earlier runs left, not on this run's timing. Reading the check's recorded detail
  found the cause. That is the lesson this ledger keeps.

## Checks

- With the drafts key removed:
  - `verify:panels:core` 83/83, then `verify:panels:shell` 105/105;
  - `verify:panels:agents` 80/82, where both reds are the baseline;
  - `verify:panels:product` 112/120, where every red is the baseline and
    `onboarding.start.1` passes (load 42 to 58).

No display changed, so `verify:visual` was not run.

## Gate

`npm run typecheck` is clean. The first full `npm run verify` ran with the whole store
wiped, and went red on `verify:panels:shell 98b` and `106`, as described above. With
only the drafts key removed, the full `npm run verify` ran 59/61 suites in 724.7s, and
every red is the baseline:
- `verify:panels:agents`: `template.1` and `detail.1`.
- `verify:panels:product`: `starter.1` and the seven `workflow.*`.

`onboarding.start.1` passes in the real part order, with panels:orchestrate's draft
ahead of it. There was no watchdog.

## Owed

- **Panels parts read state an earlier part leaves in `localStorage`.** panels:shell
  `98b` and `106` fail on a fresh store: in a fresh profile, per-viewer state (a teach-once
  hint, a remembered pane) changes what they see. Each part setting the state it reads is
  the fix, part by part. Proposed M386.

Next: land the team queue (M375–M379).
