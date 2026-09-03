# M74 plan — same agent, two front-ends

Spec: `docs/superpowers/specs/2026-09-03-m74-two-front-ends-design.md`.

1. **The importer and the resume rule, red then green.** `verify:agent-session import.1–.3`
   (sidechain and meta skipped, string content a text block, assistant records merged by id
   with usage counted once, a garbage line costing itself) and `args.5` (`--resume` skips the
   session pin); then `shared/transcript.ts`'s string-content arm,
   `main/claude-transcript-import.ts`, `main/agent-args.ts`.
2. **The pin follows the resume, red then green.** `verify:pty-manager resume-pin.1`; then
   `PtyManager.create` adopting the resumed id.
3. **IPC.** `agent:import` in the contract, both diagrams, preload, `AgentHandlers`, the
   inert default, `main/index.ts` (the live check against `ptyManager.list()`), `verify:ipc`
   at 75.
4. **The renderer, red then green.** `verify:palette front.1` (the two rows and their named
   reasons), `verify:rail front.1` (the inspector model's `frontEnd` arm); then the palette
   rows, the action-bar verbs, the chrome buttons on both kinds, `openAsChat` and
   `openInTerminal` in Canvas/usePaletteActions, `spawnTerminalAt`.
5. **`verify:panels front.1–.2`**: a dormant terminal pinned to a fixture session whose
   transcript sits in the harness's fenced projects dir is opened as chat (a live one refused
   by name), renders its imported turns, the terminal is gone; a chat opened in a terminal
   spawns with `--resume <its id>` and the pin equals it.
6. **The visual loop.** `npm run shot`: the `kinds` scene's dormant terminal now carries the
   chat verb; look; critic; verifier.
7. **Documents, chain, merge, branch `m75-composer`.**
