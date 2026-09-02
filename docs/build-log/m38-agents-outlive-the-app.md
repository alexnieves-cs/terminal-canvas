# M38 — Agents that outlive the app

**Summary:** `session.keepOnQuit` (off by default) makes quitting detach the
tmux clients and keep every session on the socket; the next launch's existing
boot reconciliation reattaches them. The quit sequence moved into
`main/quit.ts` so it could be proven against a real server.
**Status:** finished (2026-09-01). Spec
`docs/superpowers/specs/2026-09-01-m38-agents-outlive-the-app-design.md`, plan
`docs/superpowers/plans/2026-09-01-m38-agents-outlive-the-app.md`.

## What was learned

- **The default is OFF, overruling the brief's implied default in writing**
  (scope decision §7): quitting should stop things unless asked. The
  setting's description names tmux as a precondition rather than being
  silently ignored on the direct backend.
- **Boot needed nothing.** `pty:list` before the first render plus the
  orphan-killer's "known panels survive" rule already do the reattach; what
  M38 had to get right was the flush ORDER in the keep arm, for a reason the
  end arm never had — an unflushed record is an agent the orphan-killer ends
  at the next launch.
- **The pid is the proof.** `keep-on-quit.1`'s discriminating clause is the
  pane pid before and after; every count-based assertion stays green against
  an implementation that kills and quietly respawns.
- A stale `t1` session from an earlier check was visible on the verify socket
  during `.1`; `.2`'s `kill-server` clears it, and check 15's obligation
  (end the block with a definite `kill-server`) still holds.

## Evidence

- `verify:layout` `keep-on-quit.1` red (no def) then green;
  `verify:pty-manager` `keep-on-quit.1`/`.2` red (no `runQuit`) then green
  with `calls=["detachAll","flush"]`, `again=true`, same pid, and
  `calls2=["killAll","flush","shutdown"]`, server empty.
- `npm run verify`: see the merge commit.
