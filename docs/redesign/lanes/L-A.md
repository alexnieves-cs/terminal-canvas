# Lane L-A · 01 Launch/restore, 02 Onboarding, 03 Empty canvas

- Milestones: M439, M440, M441
- Branch: `rd/l-a-launch`
- Wave: 2a (parallel). Merge order: after L-B.
- Mockups: [01-splash.png](../mockups/01-splash.png), [02-onboarding.png](../mockups/02-onboarding.png), [03-empty-state.png](../mockups/03-empty-state.png)
- Checks: `npm run verify:rd-l-a` (extend `verify-onboarding` / `verify-first-run` only as the brief says)
- Shots: `rd-splash` (freeze at "3 of 5"), `rd-onboarding` (step 2, codex found, gemini missing), `rd-empty`

Repo notes: `StartupSplash.tsx`, `splash.ts`, `boot-issues.ts`, `resume-summary.ts`, `onboarding.ts`, `first-run.ts`, `env-report.ts` (main and shared), `presets.ts`, `EmptyState.tsx`, `empty-states.ts`, `Launcher.tsx`, `FirstTaskHint.tsx`, `hints.ts` all exist. There is no `src/renderer/onboarding/` yet — that directory is yours to create. `src/main/bootstrap/` is the composition root; do not edit the whole directory. Emit restore progress from a new `src/main/bootstrap/boot-progress.ts` on the pre-cut IPC slot (`boot:progress` is a comment in `ipc-contract.ts`, not a channel). Adding the real channel updates `ipc-contract.ts` and the diagram in `CLAUDE.md` in the same change (`verify:ipc`, `claude-md.1`). You own those two files for that edit only.

## 01 · Launch and restore (M439)

Mockup `01-splash.png`. Brand mark and "Every agent, in its place." An honest restore checklist (workspace · layout · reattaching tmux 3 of 5 · agent check) over the ghosted layout. Hint: hold ⌥ to skip reattaching.

Goal. Launch tells the truth about restore progress, and the person can step out of reattaching.

Files. `src/renderer/canvas/StartupSplash.tsx`, `canvas/splash.ts`, `session/boot-issues.ts`, `src/shared/resume-summary.ts`, `src/main/bootstrap/boot-progress.ts`, `src/main/tmux-probe.ts`, `scripts/shot-scenes/rd-l-a.cjs`.

- Four lines driven by real events: workspace opened (name and path in mono), layout restored ("2 tasks, 9 objects", real counts), "Reattaching tmux sessions N of M" (live count), and "Checking agents · claude, codex". Each line is pending, in progress or done. No line shows progress it hasn't measured.
- The ghosted canvas behind the card is the real layout's skeleton at its real positions, at low opacity.
- Holding ⌥ while the splash shows skips the remaining reattaches. Those panels come up `asleep` (dormant), never killed. A check proves the pane pids survive (the keep-on-quit shape).
- A failed step goes to the 09 states instead of a spinner that never ends. Reduced motion means no breathing. The splash leaves as soon as restore is done, with no minimum display time.

## 02 · First run: agents (M440)

Mockup `02-onboarding.png`. Step 2 of 4 (Workspace → Agents → Sessions → First task). Agents found on PATH with toggles. A missing tool offers its install command. A live preview teaches the state colours.

Goal. First run sets up real agents and teaches the colour system before the first spawn. Nothing runs during onboarding.

Files. `src/shared/onboarding.ts`, `shared/first-run.ts`, `shared/agent-backends.ts`, `src/main/env-report.ts` + `shared/env-report.ts` (PATH discovery and versions), `src/main/presets.ts` (enabled agents become presets; the first is ⌘N), new `src/renderer/onboarding/*`.

- Four steps with a left step rail. Step 2's title is "Which agents live on your canvas?" Each row shows the agent, "found" or "not installed", the resolved path and version in mono, and a toggle. Discovery uses the login-shell PATH that main already resolves, with a timeout per binary.
- A missing agent offers Copy install command. It copies and never executes. "Plain shell" is always on. "Add a custom command…" opens the preset editor.
- The right-hand preview renders real panel frames in working, needs-you and idle tones, from the F1 tokens, with the "One colour per state, everywhere…" caption.
- There is one primary control (Continue), a "2 agents ready" count that never reads 0 (with none it says "Turn one on to continue"), and the footer "You can change all of this later in Settings. Nothing runs until you start it."
- Step 3 (Sessions) sets tmux persistence ("survive quit"). Step 4 (First task) hands off to the existing New task sheet (`palette/StartWorkSheet.tsx`).

## 03 · Empty canvas (M441)

Mockup `03-empty-state.png`. Says what the canvas is for, with one primary verb (describe a task → Start task). Quick spawns, three starter layouts, a ghost drop target, navigation hints, and the minimap's "Nothing placed yet".

Files. `src/renderer/shell/EmptyState.tsx`, `src/shared/empty-states.ts`, `canvas/Launcher.tsx`, `FirstTaskHint.tsx`, `hints.ts`, `palette/start-work.ts`, `shared/lineups.ts`. The minimap sentence lives in `empty-states.ts`, and L-B's `MinimapOverlay` reads it. You do not own `MinimapOverlay.tsx`.

- Title "A blank canvas for <workspace>" and one sentence of purpose. The task field has a repo chip in mono and the single filled Start task ↵.
- Quick spawns: Claude Code ⌘N · Shell ⌘T · Import a layout…. Three starter layouts (Pair + tests, Two-agent review, Solo shell), each one sentence and inert until clicked.
- The ghost target reads "Double-click to place a flowchart step". The hints read "Space + drag to pan" and "⌘ + scroll to zoom" (from `hints.ts`). The minimap reads "Nothing placed yet". No bare zeros anywhere (`empty.1`, `verify:rail` `empty.2`). The owner kept M388's gesture (Oct 6, 2026): a double-click places a flowchart process step, and the hint names that step.

## Prompt

Lane L-A (M439–M441): screens 01, 02, 03 per GUIDE.pdf §7 L-A. Look at mockups 01, 02 and 03 first. lb-scout in parallel on `StartupSplash.tsx`, `splash.ts`, `boot-issues.ts`, `shared/onboarding.ts`, `shared/first-run.ts`, `main/env-report.ts`, `main/presets.ts`, `EmptyState.tsx`, `empty-states.ts`, `Launcher.tsx`, `hints.ts`. Order: 01 (restore events are the only main-process change; use the pre-cut ipc slot and update ipc-contract + the channel list in CLAUDE.md for verify:ipc/claude-md.1), then 02, then 03. Every number on these screens must come from a real measurement; when unknown, say so in words. Shot scenes `rd-splash` (freeze at "3 of 5"), `rd-onboarding` (step 2, codex found, gemini missing) and `rd-empty`, each with its mockup as reference.
