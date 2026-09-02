# M59 plan — The dead-end audit

Branch `m59-dead-end-audit`. Spec: `docs/superpowers/specs/2026-09-02-m59-dead-end-audit-design.md`.

1. `verify:panels drop.1` red first; `dropPath(path, screenPoint)` shared by
   the drop handler and a `__m59Drop` hook; overlay guard.
2. `verify:palette rename.1` + `audit.1` red first; `bookmark.rename.*` row,
   `beginRenameBookmark` action.
3. `docs/dead-end-audit.md`; `verify:meta audit.1` pins REASON_* coverage.
4. Build log, verify, merge.
