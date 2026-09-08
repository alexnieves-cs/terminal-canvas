# M181 implementation plan

Spec: `docs/superpowers/specs/2026-09-08-m181-starter-canvas.md`. Grep both load-bearing files
for `layout-schema`, `panels.ts`, `annotations`, `groups`, `file-read`, `Launcher` and
`usePaletteActions` before each edit.

1. Pure modules first, checks red before code. `src/shared/starter.ts`: `STARTER_VERSION`,
   `STARTER_OBJECTS` (key, kind, caption, a rect relative to the agent's), `starterKeysToApply
   (record, panels)` and `parseStarter` with the record rules; `carryStarter` at the workspace
   copy sites in `layout-schema.ts`. `PersistedImagePanel` and `parsePanel`'s `image` arm
   (absolute path or dropped by name); `ImagePanel`, `makeImagePanel`, `isImagePanel` in
   `panels.ts`. Checks: `verify:layout starter.1–.3`, `image.record.1`; `verify:viewport
   starter.plan.1`, `image.kind.1` (the positive partition, `92`'s rule). Delegate these two
   check sets to one fresh-context writer; watch the red tallies before implementing.
2. Main. `image:read` over `image-read.ts` (magic number, cap, three named arms; `dir` and
   `now` injected so `verify:file image.1` drives it under plain node). `starter:prepare` writes
   `userData/starter/welcome.md` and `welcome.png` only when absent and answers both paths.
   Both channels in the contract, the README diagram, `CLAUDE.md`'s copy, and
   `verify:ipc`'s `EXPECTED_CHANNELS`.
3. Renderer. `ImageNode.tsx` through `PanelFrame` with the `.panel__*` aliases, a far-view
   summary, and the three arms as sentences. `applyStarter` in `usePaletteActions`: refused by
   name without an engine or while merged; the chat through `beginNewChat`; the examples in one
   history commit with their captions and the `Examples` group; the terminal added to
   `dormantIds`; the record written through `setStarter`. The launcher's primary calls it on a
   first run; the `Starter canvas…` prompt line; the palette row; the `starter` verb and its
   `V9_DOORS` row; the inspector's image arm.
4. Real renderer. `verify:panels:product starter.1` (first run: primary → chat + four captioned
   examples, zero PTY spawns, one chat create; a second application refused by name; the
   record on disk) and `image.1` (pixels from main; the missing arm). A `starter` shot scene
   with its intent; the launcher's hint changes its scene again. Sentences before goldens.
5. Critic and verifier with fresh context; findings fixed or declined by name; `feat(m181)`;
   then Act I's build log with the three commands' tallies and the `--no-ff` merge.
