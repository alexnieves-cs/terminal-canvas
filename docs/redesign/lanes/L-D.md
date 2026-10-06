# Lane L-D · 07 Sessions

- Milestone: M445
- Branch: `rd/l-d-sessions`
- Wave: 2a (parallel). Merge last in the wave, after L-E.
- Mockup: [07-sessions.png](../mockups/07-sessions.png)
- Checks: `npm run verify:rd-l-d`
- Shot: `rd-sessions` on rd-steward (3 rows selected, Claude Code detail open), ref 07
- Decision: D3

You own no existing canvas file. Everything lives in new files under `src/renderer/sessions/`, mounted into F3's `SessionsHost`. F3 creates that host; you fill it. `src/renderer/sessions/**` is yours in this wave, including the host file F3 left.

## Goal

A peer view for fast triage across all sessions. It reads the same state as the canvas, and each view links to the other.

Files. `SessionsView.tsx` (mounted in F3's `SessionsHost`), `sessions-model.ts` (pure: rows, grouping, sorting, bulk eligibility), `AttentionCards.tsx`, `SessionsTable.tsx`, `Sparkline.tsx` (inline SVG, because the recharts door is confined to two shell charts), `SessionDetail.tsx`. It reads `session/session-registry.ts`, `live-session-store.ts`, `last-line-store.ts`, `usage-store.ts`, `machine-series.ts` (that file exists), and `scrollback:tail`. You do not own those stores. Read them.

- Header: "Sessions · 7 live · 2 dormant" (never "0 dormant": the part is dropped when zero), Group: Task, All states, and one primary + New session. ⌘⇧S opens it.
- Attention cards render `useAttentionQueue` items in queue order with the same sentences as the canvas. Approval: Allow / Diff / Deny. Shell prompt: Open on canvas / Snooze 10m only, with no inline answer, keeping the rule that a stray Enter must never run a command. Failure: Restart / Read log.
- The table is grouped by task region with columns Session · Agent · Folder · Branch · State (F1 pill) · Activity (sparkline in the state colour) · Run · Cost · Last line (mono, ellipsised). The bulk bar shows "N selected · Pause · Restart · Move to task… · End", and End asks for confirmation through main's dialog.
- The detail pane shows the live tail (scrollback tail plus a subscription), "Send to this session…" using paste semantics and an explicit Send (never raw `write()`, per the Jira gotcha), and facts (Started, Survives "reload and quit (tmux)", Tokens, Changes). Pause · Detach · End session. "Show on canvas" flies the 2D camera to the panel and selects it.
- Metrics here follow D3. A check scopes `metrics.1` so canvas surfaces stay metric-free. You own `scripts/verify-rd-l-d.cjs`. `metrics.1` lives in `scripts/verify-styles.cjs`, which F1 owns. If the amendment has to land in that file, append `requests.md` and keep the scoping check in your suite as a source-text assertion you can actually edit.

## Prompt

Lane L-D (M445): the Sessions view, screen 07, per GUIDE.pdf §7 L-D and DECISIONS.md D3. Everything lives in new files under `src/renderer/sessions/` mounted into F3's `SessionsHost`; you own no existing canvas file. lb-scout on `session-registry.ts`, `live-session-store.ts`, `last-line-store.ts`, `usage-store.ts`, `machine-series.ts`, scrollback IPC and `shell/decision-inbox.ts`. Pure model first (`sessions-model.ts` + checks). Sparklines as inline SVG reading `state-palette.ts`. Reply box: paste semantics + explicit Send; disabled with its reason for shell sessions. Bulk End goes through main's confirmation. Shot scene `rd-sessions` on rd-steward (3 rows selected, Claude Code detail open), ref 07.
