# M263 — Create collapse + empty composed next step

**Spec / plan:** `docs/superpowers/specs/2026-09-11-feel-reshape-design.md` beat 1; `docs/superpowers/plans/2026-09-11-feel-reshape.md`.

**Done:**
- Occupied canvas: `NewObjectRow` is a single Create + (`data-create-open`) → `beginSpawnSheet`. No permanent creatable-kind pills.
- Empty canvas: launcher primary strip is **Start work · Ask · Create…** (`data-create-face="empty-strip"`); Create opens the shared sheet. `NewObjectRow` not mounted when empty.
- Creation registry canvas doors retargeted to Create + / Create… sheet.
- `verify:first-run` `fr.launcher.2`, `create-face.1` / `create-face.2`; `verify:verbs` still green.

**Goldens:** launcher / occupied scenes that framed the old pill band may need a critic look at act close — not regenerated here.
