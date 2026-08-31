# M25 — Functional panel links plan

1. Extend `PanelLink` and the persisted layout schema with a guarded
   `restart-on-exit` action. — complete
2. Observe post-status PTY exits through the session registry and restart only
   live, already-started destinations. — complete
3. Expose per-link controls plus an Inspector automation list and outcome
   status. — complete
4. Add pure persistence/graph regressions and run the verification suite. — complete
