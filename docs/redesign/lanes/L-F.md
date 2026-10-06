# Lane L-F · 09 Errors and disconnected

- Milestone: M447
- Branch: `rd/l-f-recovery`
- Wave: 2b (parallel with L-C). You do not own `Canvas.tsx`. Mount through the recovery-overlay slot L-B left. Panel frame variants go in `rd:L-F` and in `panels/*`, which you own in this wave.
- Mockup: [09-error-disconnected.png](../mockups/09-error-disconnected.png)
- Checks: `npm run verify:rd-l-f`
- Shot: `rd-recovery` on a fixture with a host loss + exit 137, ref 09

## Goal

A tmux host-loss banner (paused, not lost, auto-retry). A crashed session (exit 137) explains itself and offers one fix. Reattaching panels show skeletons, GitHub data is marked offline/cached, an offline toast appears, and the pill reads "2 sessions need recovery".

Files. `shell/ResumeBanner.tsx`, `JobRecoveryNotice.tsx`, `ReopenNotice.tsx`, `shell/toast.ts` (the sonner door), `src/main/session-backend.ts`, `tmux-probe.ts`, `job-recovery.ts`, `last-exit.ts`, `session/live-session-store.ts`, panel frame state variants (paused, reattaching, crashed) in `panels/*` within `rd:L-F`, the GitHub/Jira work panels (an offline/cached marker), and new `src/shared/exit-explain.ts` (pure: 137 → "killed, usually by memory pressure", 130, 143, 127, generic).

GitHub and Jira panel files are not in your ownership list. If the offline marker has to live in those files, append `requests.md` with the one-line change, or expose a marker prop from a file you own. Do not work around the guard.

- Host loss banner: "Session host stopped responding. tmux server on this Mac didn't answer for 20s. 4 sessions are paused, not lost — their output is buffered." with "Retrying in 8s", Reconnect now and Details. Affected panels read "paused · output kept". While paused, keystrokes are disabled and the panel says so ("nothing you type is lost or sent twice").
- Crash card: "This session ended unexpectedly" plus the exit-code sentence and what was kept ("The pending edit was not applied"). One primary Restart with last prompt, then Read log, with ⌘↵ restarting the panel. Restart in place preserves the panel id (checks 90/92 shape).
- Reattaching panels render skeleton rows, never a blank well. GitHub/Jira data shows "offline · cached · last updated 7:22 PM". The offline toast says what keeps working. The pill reads "2 sessions need recovery · 4 paused · Review" from the attention queue's `recovery` items.
- A test kills the verify tmux server mid-session. Panels go paused and then recover after the retry, with the same pane pids where tmux survived and honest "ended" states where it didn't.

The toast is for what is FINISHED. Outstanding recovery stays in the attention system (`shell/toast.ts` door comment, and `src/renderer/CLAUDE.md`).

## Prompt

Lane L-F (M447): screen 09 per GUIDE.pdf §7 L-F. lb-scout in parallel on `session-backend.ts`, `tmux-probe.ts`, `job-recovery.ts`, `last-exit.ts`, `live-session-store.ts`, `ResumeBanner.tsx`, `JobRecoveryNotice.tsx`, `toast.ts`, and the `docs/load-bearing.md` entries for quit/keep/reattach. Pure first: `src/shared/exit-explain.ts` and a recovery-state reducer with checks. Then the main-side host-loss detection (no new polling loop if `tmux-probe` already has one), the banner, the frame variants inside `rd:L-F`, and the recovery items feeding `useAttentionQueue` (F2 contract; if the contract lacks a field, `requests.md`). The toast is for what is FINISHED; outstanding recovery stays in the attention system. Shot scene `rd-recovery` on a fixture with a host loss + exit 137, ref 09.
