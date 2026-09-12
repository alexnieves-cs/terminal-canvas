# Feel reshape Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the canvas feel like work in progress — one create door, Fit task as stage entrance, one attention story, teammate·chat·session silhouettes — without a new subsystem.

**Architecture:** Projected feel on existing verbs (Show related, Fit task, SpawnSheet/StartWorkSheet, command pill, attention set). Four sequenced milestones M263–M266. No new IPC.

**Tech Stack:** Electron renderer (React), plain-node verify suites (`verify:pill`, `verify:verbs`, `verify:first-run`, `verify:rail`, `verify:panels-*`).

**Spec:** [docs/superpowers/specs/2026-09-11-feel-reshape-design.md](../specs/2026-09-11-feel-reshape-design.md)

## Global Constraints

- No new IPC, panel kind, attention store, or soft-follow camera.
- Four doors stay via palette / sheet / agent line / workflow — not via permanent canvas pills.
- `agent:*` identifiers unchanged; face/copy only.
- Scoped check ids; never the next global integer.
- Goldens only after LOOKING with a critic sentence per scene.
- Update `docs/product-rules.md` only where it still pins the old face.

---

### Task 1: M263 — Create collapse + empty composed next step

**Files:**
- Modify: `src/renderer/canvas/NewObjectRow.tsx`
- Modify: `src/renderer/canvas/Canvas.tsx` (mount props; hide row when empty)
- Modify: `src/renderer/canvas/Launcher.tsx` (Start work · Ask · Create…)
- Modify: `src/renderer/styles.css` (`.new-object-row*` for single `+`)
- Modify: `src/shared/verb-table.ts` (canvas door strings)
- Modify: `scripts/verify-first-run.cjs`, `scripts/verify-verbs.cjs` (+ new face checks)
- Test: those verify suites

**Interfaces:**
- Consumes: `beginSpawnSheet`, `startFirstWork` / Launcher start, `askWithoutFolder`
- Produces: empty strip verbs; occupied `data-create-open` `+`

- [ ] **Step 1: Write failing checks** — empty: Start work / Ask / Create…, zero `data-create-object` pills; occupied: one `data-create-open`, no pill band; update `fr.launcher.2` copy; retarget `creation.registry` canvas doors away from “New object row”.

- [ ] **Step 2: Run checks — expect RED**

- [ ] **Step 3: Implement** — occupied `NewObjectRow` → single `+` → `beginSpawnSheet`; empty → do not render pill band; Launcher primary = Start work · Ask · Create… (Create opens sheet); CSS for `+`.

- [ ] **Step 4: GREEN on affected suites; commit `feat(m263): …`**

---

### Task 2: M264 — Task stage + pill task sentence + Fit task primary

**Files:**
- Modify: `src/renderer/canvas/Canvas.tsx` (`fitTask` sets `relatedItemId`; safe Escape)
- Modify: `src/renderer/canvas/CanvasHud.tsx` (Fit task before Fit all)
- Modify: `src/renderer/canvas/command-pill.ts`, `CommandPill.tsx`
- Modify: `scripts/verify-pill.cjs` (+ panels check if needed)

**Interfaces:**
- Consumes: `fitTaskTarget`, `relatedItemId` / lens
- Produces: `PillRest` kind `task`; Fit task lights lens

- [ ] **Step 1: Failing `pill.rest.task.*` + Fit-task-lights-lens check**

- [ ] **Step 2: RED**

- [ ] **Step 3: Implement priority attention→task→running→selected→empty; Fit task sets lens; HUD order; Escape clears lens when not stealing `.xterm` Escape**

- [ ] **Step 4: GREEN; commit `feat(m264): …`**

---

### Task 3: M265 — One attention story

**Files:**
- Modify: `src/renderer/canvas/command-pill.ts` (attention copy; `shouldAnnounceAttentionQueue`)
- Modify: `scripts/verify-pill.cjs`
- Modify: `docs/product-rules.md` (M249 rest list)

- [ ] **Step 1: Failing checks for chat/session queue copy + suppress gate**

- [ ] **Step 2–4: Implement, GREEN, commit `feat(m265): …`**

---

### Task 4: M266 — Silhouettes

**Files:**
- Modify: `src/renderer/palette/panel-name.ts`, `src/renderer/shell/rail-rows.ts` as needed
- Modify: `src/renderer/canvas/command-pill.ts` (running copy if still “agent”)
- Modify: `scripts/verify-rail.cjs`, `scripts/verify-pill.cjs`
- Modify: `docs/product-rules.md` if needed

- [ ] **Step 1: Failing `Teammate · place` fixtures; no “N agents …” in face copy**

- [ ] **Step 2–4: Shared naming helper, GREEN, commit `feat(m266): …`**

---

### Task 5: Act close

- [ ] Full `npm run verify`
- [ ] Visual/goldens only for changed scenes with critic sentences in ledger
- [ ] Ledger lines for M263–M266; CLAUDE.md ledger link if a new ledger file lands
