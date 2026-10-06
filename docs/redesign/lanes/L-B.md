# Lane L-B · 04 Main workspace, then 05 Create and arrange

- Milestones: M442, then M443
- Branch: `rd/l-b-workspace`
- Wave: 2a. You are the ONLY owner of `src/renderer/canvas/Canvas.tsx` in this wave.
- Mockups: [04-main-workspace.png](../mockups/04-main-workspace.png), [05-create-arrange.png](../mockups/05-create-arrange.png)
- Checks: `npm run verify:rd-l-b`
- Shots: `rd-workspace` (ref 04), `rd-arrange` (ref 05)
- Read `src/renderer/canvas/CLAUDE.md` first. Never reorder existing hook calls.

## 04 · Main workspace, Work tier (M442)

Goal. The calm Work-tier canvas. The chrome steps back, task regions are visible, and only state is loud.

| Element | Spec | Where |
|---|---|---|
| Task region | Dashed 1px territory, 20px radius, 24px padding. The label chip reads "Ledger CSV export · SW-412 · 3 agents · 2 of 4 criteria". | `TaskClusterLayer.tsx` over F2 `task-regions.ts` |
| Panel frame | 12px radius. Header: state dot, name, path (mono, faint), branch, and a state pill ("working · 12m"). One resting shadow. Header verbs at opacity 0 → 1. | `src/renderer/panels/*`, styles in `rd:L-B` |
| Selection | Per D1: 2px ring + 6px halo, distinct from the working edge. | styles + panel frame. F1 owns the token; you consume it. |
| Needs-you panel | Amber edge + soft glow. An inline request block quotes the agent's question ("Allow edit to src/api/ledger.ts? [y/n/d]") with Allow (Y, ⌘Y), View diff and Deny, and "waiting 1m 40s". | `shell/ApprovalDetail.tsx`, `palette/commands/approval-row.ts` |
| Handoff edge | A port on the source and a dashed curve to the watcher. It animates only while something crosses it (M233). | `LinkLayer.tsx`, `AgentLinkLayer.tsx`, `useHandoff.ts` |
| Changes card | "Changes since claude started +182 −37 · 4 files", file rows (M/A + counts), Review / Commit…, base sha. | The existing review node, restyled |
| Off-screen pip | An amber pill at the edge: "infra · plan waiting →". Click flies there. | `EdgeIndicators.tsx` |
| Inspector | Overview / Changes / Log. SESSION facts (State, Agent, Folder, Branch, Host "tmux · survives quit", Usage), TASK CRITERIA "2 of 4" checklist, one primary action ("Review 4 changed files"), then Pause and Hand off…. | `shell/Inspector.tsx`, `inspector-fields.ts`, `inspector-context.ts` |
| HUD, minimap, pill | Zoom HUD "82% − + ⛶" at bottom left. Minimap with region outlines, state-coloured blocks and the camera rectangle. The pill comes from F3. | `CanvasHud.tsx`, `MinimapOverlay.tsx`, `minimap.ts` |

- The `rd-workspace` scene on the rd-steward fixture reads as 04 (critic verdict "reads-as" or "close" with no state-colour divergence).
- ⌘Y allows the pending request of the selected panel, or of the queue head when nothing is selected. It routes through the palette executor, so the request's approval door is the same one the inspector uses.
- Restyled, not renamed: every `.panel__*` / `*-node__*` alias is still present (`verify:panels` green). Chromeless terminal chrome stays absolutely positioned. A check measures the xterm well size on header hover and allows 0px change.
- No metric appears on a panel header or card (the age "12m" is a state duration, which D3 allows). Spend appears only in the inspector.

## 05 · Create and arrange (M443)

Files. `canvas/useLinkDraw.ts`, `useHandoff.ts`, `handoff-rules.ts`, `SnapGuides.tsx`, `MarqueeLayer.tsx`, `marquee.ts`, `arrange.ts`, `place-new.ts`, `placement.ts`, `useCanvasPointer.ts`, `palette-actions/arrangement.ts`, `palette-actions/objects.ts`, `palette/SpawnSheet.tsx` (the menu reuses its rows).

- Dropping a port drag on empty canvas opens "New object connected to <source>" with AGENTS (Claude Code ⌘N, Codex, Shell ⌘T) and PRESETS (e.g. Test watcher · vitest, Preview · localhost:5173). The foot reads "Starts when <source> finishes, with its summary as input" (a handoff-on-exit link, M41).
- Smart guides are pink `--guide` and appear only during a drag or resize. Gaps snap to 24px and show their value. The `applyDrag` origin rule and `verify:panels` check 10 stay green.
- Marquee → toolbar "N selected · Align · Tidy ⌘⇧T · Make task ⌘G · Pause all". ⌘G creates a task region from the selection as one undo. Tidy keeps the ⌘⌥T alias (D5).
- Double-clicking empty canvas places a flowchart process step at the cursor, with its label open. The owner kept that gesture (Oct 6, 2026). ⌘N and ⌘T also land at the cursor when it's over the canvas. Panels settle with a slight overshoot, and reduced motion removes it.

## Prompt

Lane L-B (M442 then M443): screens 04 and 05 per GUIDE.pdf §7 L-B. You are the ONLY owner of `src/renderer/canvas/Canvas.tsx` in this wave: read `src/renderer/canvas/CLAUDE.md` first (hook order, Deps objects, import direction) and never reorder existing hook calls. lb-scout in parallel on `Canvas.tsx`, `TaskClusterLayer.tsx`, `panels/*`, `Inspector.tsx`, `ApprovalDetail.tsx`, `EdgeIndicators.tsx`, `MinimapOverlay.tsx`, `CanvasHud.tsx`, `LinkLayer.tsx`, `useLinkDraw.ts`, `SnapGuides.tsx`, `MarqueeLayer.tsx`, `place-new.ts`. Build 04 element by element using the table in the guide; write CSS only inside the `rd:L-B` block (plus restyles of existing panel rules, recorded in the ledger). Then 05. Add a stable mount slot in `Canvas.tsx` for wave 2b (a `<TierLayer/>` placeholder and a recovery-overlay slot) so L-C and L-F do not need hook-order edits. Shot scenes: `rd-workspace` (ref 04) and `rd-arrange` (ref 05: freeze mid-drag with guides visible, marquee toolbar up, spawn menu open).
