# v7 Act II — eight backlog entries (M140–M147): plan

Spec: `docs/superpowers/specs/2026-09-07-v7-act2-backlog-eight-design.md`. Each milestone is
one commit pair at least — `check(mNNN)` red, then `feat(mNNN)` — with the Electron-tier
checks run in the part that holds them (`core` for the canvas, `shell` for workspaces,
`kinds` for cost, `product` for the editor), one Electron checkout at a time. A fresh-context
critic and verifier review the act's diff, spec and checks at its close; the build log is
`docs/build-log/m140-m147-act2-backlog-eight.md`.

| Order | Milestone | Red checks | Files |
|---|---|---|---|
| 1 | M146 zoom to fit | `verify:viewport fit.sel.1`, `verify:palette zoom.fit.1`, core `fit.1` | `useViewport.ts` (fitSelection), `usePaletteActions.ts` (zoomToFit), `commands.ts` (row), `verb-table.ts` (label/hint) |
| 2 | M144 chrome scale | `verify:styles chrome.scale.1`, core `frame.3` | `Canvas.tsx` (`--chrome-scale` on `.world`), `styles.css` |
| 3 | M141 placeholders | `verify:palette holes.builtin.1–.3`, core `prompt.builtin.1` | `composer-model.ts` (BUILT_IN_HOLES, fillBuiltIns), `usePaletteActions.ts` (insertPrompt) |
| 4 | M147 env + template sets | `verify:layout preset.env.1–.2`, `verify:file env.merge.1`, `verify:palette workspace.template.1`, shell `workspace.template.1` | `layout-schema.ts`, `ipc-contract.ts` (PresetTemplate.env, sheet), `main/index.ts` (spawn:sheet), `SpawnSheet.tsx`, `commands.ts`, `usePaletteActions.ts`, `useWorkspaceVerbs.ts` |
| 5 | M145 clipboard image → path | `verify:file clipboard.1–.3`, core `paste.image.1`, `verify:ipc` 123 | `main/clipboard-file.ts`, `ipc-contract.ts`, `preload`, `main/ipc.ts`, `main/index.ts`, `Canvas.tsx` (edit:paste), `agent-backends.ts` (note), README/CLAUDE diagrams |
| 6 | M143 serialised card | `verify:xterm serialize.1`, core `card.screen.1` | `package.json` (+ `@xterm/addon-serialize`), `create-terminal.ts`, `session-factory.ts`, `PanelCard.tsx` |
| 7 | M142 cost history | `verify:usage ledger.usage.1`, `verify:rail summary.history.1`, kinds `cost.history.1` | `shared/run-ledger.ts` (usage row), `main/pty-manager.ts` or `index.ts` (append at kill/exit), `inspector-fields.ts` (history), `Inspector.tsx` |
| 8 | M140 editor for commands/agents | `verify:toolbox edit.cmd.1–.3`, product `editor.cmd.1` | `skill-write.ts` (roots), `SkillEditor.tsx` (metadata row), `ToolboxNode.tsx` (door), `main/index.ts` |

Each milestone's plain-node suites run at its commit; the Electron parts run once per
milestone that touches them and once more at the act's close in the full chain.

The backlog entries are rewritten down at the act's close, one commit, naming what each
milestone left.
