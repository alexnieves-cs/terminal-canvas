# M47 — One panel frame: implementation plan

Spec: `../specs/2026-09-01-m47-panel-frame-design.md`. Four tasks.

## Task 1 — The instrument (`verify:styles` `frame.1`)

Count declarations of the five duplicated families; RED at three each.

## Task 2 — `PanelFrame` and `PanelStatusDot`

`components/PanelFrame.tsx` with the spec's structure and the alias classes
the checks select on; `TerminalPanel` migrates first (it has the most
checks), then `ReviewNode`, `FileNode`, `ToolboxNode`, `JiraNode`. Run
`verify:panels` after the terminal migration and again after the four
kinds — the two most likely places a selector alias is missed.

## Task 3 — The body rule (`verify:panels` `frame.2`)

Source-text: no `transform` in any rule whose selector contains
`.pf__body`; runtime: `__m4aCellToScreen` at scale 0.5 agrees with a
computed cell to within a pixel. RED only if someone transforms the body —
written to stay green, and its comment says so.

## Task 4 — Close

Delete the duplicated stylesheet families (`frame.1` green);
`docs/load-bearing.md` (the body is never transformed; the DOM contract's
alias classes are load-bearing for ~200 checks); build log; `npm run
verify`; merge.
