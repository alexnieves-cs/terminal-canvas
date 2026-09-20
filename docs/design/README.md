# Orchestrate interaction concept

Open [orchestrate-preview.html](orchestrate-preview.html) directly in a browser. See the [product and implementation plan](../orchestrate-reference-plan.md) for the proposed production behavior.

This is a standalone prototype with sample data, not the running application. No agent, permission, Git, file or network mutation is connected. Canvas remains a separate application page; its navigation button is a placeholder here.

Try task selection, station selection, Scene / Dependencies / List, the decision queue, Changes / Checks / Output / Artifacts / Timeline, Expand review, zoom / Fit, and Start task. Task selection updates branch context and evidence; the Start task dialog illustrates the proposed brief. Action buttons disclose their preview-only behavior.

The SVG scene retains one illustrative arrangement from the original composition. Multiple task islands, persisted placement, true graph editing, live diffs, drag resizing, provider integration, complete keyboard parity and WebGL rendering are production work in the plan. Dependency mode demonstrates focus/dimming; it is not an execution graph editor. Follow-up never sends a message. The brief is illustrative, not an editable task launcher.

## Validation — 2026-09-18

Rendered in Electron and inspected the desktop capture and narrow layout. Exercised station selection, list entries, dependency lens, task-specific diff and revision evidence, every workbench tab, review expansion, and the brief dialog. Checked 1280, 1024 and 900 px widths for horizontal document overflow; none was reported. Corrected narrow navigation overlap and hid the task overlay at narrow widths so it does not cover stations.

[Desktop capture](orchestrate-preview.png) is the current composition. The application verification suites were not run for these design-only artifacts. Production implementation has the full checks and scenario criteria in the plan.
