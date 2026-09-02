# Build log

The running record of the 1.0 run that started on 2026-09-01, one file per
milestone. This directory is what survives a restart: at the start of a
session, read it together with `README.md`'s milestone table and resume at the
first milestone not recorded as **finished** rather than re-planning from the
beginning.

Each file opens with a one-line summary and a status line (`planned`,
`in progress`, `finished`, `abandoned`), then records what was decided, what
was corrected along the way and why it mattered. It does NOT repeat what the
repository already records — the spec, the plan, the diff, the commit
messages. When something learned here belongs to the codebase permanently, it
is promoted into `CLAUDE.md` or `docs/load-bearing.md` in that file's own voice
(the invariant, plus the silent failure that follows from undoing it) and the
copy here is deleted.

| File | Milestone | Status |
|---|---|---|
| [00-reconciliation.md](00-reconciliation.md) | The milestone table repaired, the 1.0 scope decided | finished |
| [m36-hardening.md](m36-hardening.md) | M36 — Hardening for 1.0 | finished |
| [m37-worktree-per-panel.md](m37-worktree-per-panel.md) | M37 — A git worktree per panel | finished |
| [m38-agents-outlive-the-app.md](m38-agents-outlive-the-app.md) | M38 — Agents that outlive the app | finished |
| [m39-durable-scrollback.md](m39-durable-scrollback.md) | M39 — Durable scrollback | finished |
| [m40-broadcast-input.md](m40-broadcast-input.md) | M40 — Broadcast input: the exits | finished |
| [m41-handoff-edges.md](m41-handoff-edges.md) | M41 — Handoff edges | finished |
| [m42-search.md](m42-search.md) | M42 — Search across every panel | finished |
| [m43-attention-beyond-the-window.md](m43-attention-beyond-the-window.md) | M43 — Attention beyond the window | finished |
