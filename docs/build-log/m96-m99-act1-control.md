# Act I — control and autonomy (M96–M99): build log

Branch `m96-verbs`, 2026-09-05. Spec: `docs/superpowers/specs/2026-09-05-act1-design.md`.
Plan: `docs/superpowers/plans/2026-09-05-act1.md`. One log for the act, a section per milestone;
two tracks (A: M96 → M97 in the main checkout; B: M98 → M99 in a worktree subagent), integrated
at the gate.

## M0, what was measured

- `npm run verify` on clean `main`: every suite green; the panels suite alone hit its 300 s
  watchdog while two spike Electron runs competed for the machine (the recorded load-flake
  rule), and passed 303/303 rerun alone. Green baseline.
- The `<webview>` spike (scratchpad, not the repo): a `<webview>` appended inside a
  transformed world under the shipped CSP fired NO `securitypolicyviolation`, reached
  `did-finish-load`, answered `getURL()`; at `translate(50,50)`, `scale(0.5)` and `scale(1.6)`
  its rect and its painted guest followed the world transform, it clipped at the host's
  `overflow: hidden` edge, and a DOM sibling with a higher z-index painted over it. Both halves
  yes; Act II's spec carries the numbers.
- ACP: `claude` 2.1.261 and `codex` 0.153.4 present; `gemini`, `claude-code-acp`, `codex-acp`,
  goose, opencode, amp, kiro absent; codex's `app-server` is its own JSON-RPC, not ACP. M99 is the
  registry alone.
- The timer trigger: `watcher:create` in `main/index.ts` arms a real unref'd `setInterval`
  firing `watchRunner.fire`; the renderer re-creates every watcher on restore and the arm is
  idempotent per id. M101 is a surface plus one tick that starts a chat.

## M96 — the verb table

### Red first

`scripts/verify-verbs.cjs` (new suite, wired into the chain after `verify:agent-session`):
`closure.1`, `table.1`, `plan.1`, `destructive.1`, `type.1`, `type.2`, `settings.1`, `gate.1`,
`auto.1`, `auto.2`; `verify:palette verbs.1`. All red at bundle time (no module) — watched.

### Shape decisions worth recording

- **There is no `kill` verb.** The spec's first draft flagged one; the table refuses it by
  absence and `table.1` asserts so: a process's lifetime is its panel's (the two-lifetimes
  rule) and `pty.kill` keeps exactly two renderer callers by design. `close` is the dispose,
  `interrupt` the stop (a chat's interrupt; Ctrl-C pasted into an agent terminal — the one
  control byte a plan may send, and only through this verb).
- **The executor lives in `usePaletteActions` as one appended member.** The table knows what
  a verb IS; `beginRunVerb` is the only place that knows what it DOES. Kept inside the one
  `useMemo` so `Palette`'s command memo keeps its identity.
- **The Auto rows sit in the `canvas` section, not `panel`.** In `panel`, `Auto: Harden`
  outranked a panel titled `auth refactor` for the query `auth` (a subsequence of both) and
  stole Enter — palette check 33 caught it on the first run.
- **`type` on a chat inserts into the composer; `submit` on a chat refuses by name** (a chat
  sends with `send`). On an agent terminal `type` is a bracketed paste (the Jira rule: never
  raw writes) and `submit` writes the one CR.
- `run-template` opens the spawn sheet on the template rather than instantiating: a template's
  parameters are asked there, and a plan has no typist.

### What the checks caught

- `closure.1` went red the moment `beginRunVerb`, `startAuto` and `stopAuto` were appended to
  `PaletteActions` — exactly the failure it exists for — and they are on the excluded list
  with their reasons (a plan that ran plans would be a loop with no ceiling).
- `verify:styles` 3 and 6 caught a fractional opacity and two literal spacings in the chip's
  first CSS; tokens now.
- `verify:rail state.2` caught the chip's tone spelled as a literal in `ChatNode.tsx`; the
  mapping is `autoTone` in `panel-state.ts`, where the vocabulary lives.

## M97 — Auto

### Red first

`verify:agent-session auto.1–.3` (red: `startAuto` absent), `verify:verbs auto.1–.2`,
`verify:palette auto.1`.

### Shape decisions worth recording

- **The snapshot KEEPS the resolved run** (`auto.state` is `done`/`stuck`/`stopped` until the
  next start, a dismiss, or a dispose); `auto.1`'s first draft expected the field to vanish and
  was amended — a chip that vanished on resolution would be a run that ended silently.
- **The continuation is sent AFTER the queue is served**, so a message the user typed during
  the turn lands ahead of it.
- A permission question stops the RUN after a grace (`autoPermissionGraceMs`, a minute), never
  the question: the card still asks, and the chip says `stuck — a permission question went
  unanswered`.
- An auto run is a run: `useRuns.onAutoEvent` opens a one-panel component on `running` at
  turn 0 and seals it with the panel's usage since the start on any resolution; the outcome
  word is `passed`, `stopped` or `stuck — <why>`.

## M98 — Allow for session

(Track B — filled in at the gate.)

## M99 — the backend registry; ACP declined

(Track B — filled in at the gate.)

## Findings (critic and verifier)

(At the gate.)

## Verification

(At the gate.)
