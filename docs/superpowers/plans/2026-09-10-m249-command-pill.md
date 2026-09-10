# M249 plan — the bottom command pill

Spec: `docs/superpowers/specs/2026-09-10-m249-command-pill.md`.

1. **Checks first, watched red.**
   - `verify:pill` (new plain suite, `scripts/verify-pill.cjs`), over
     `src/renderer/canvas/command-pill.ts`:
     - `pill.rest.1`–`.4`: one check per priority
     - `pill.rest.zero.1`: never a "0 …"
     - `pill.orch.1`: supervisor before orchestrator, then none
     - `pill.running.1`: chats streaming/starting and busy agent terminals; never a shell
   - `verify:panels:product` `pill.*`:
     - `pill.focus.1`: keys typed into a focused terminal reach the PTY; the pill input stays
       unfocused and empty
     - `pill.send.1`: with no orchestrator a supervisor is created; a second send reaches that
       chat's process
     - `pill.jump.1`: the attention jump centres the waiting panel
     - `pill.rects.1`: expand/collapse leaves panel rects and xterm cols/rows unchanged
     - `pill.paste.1`: `edit:paste` into the focused input never reaches the PTY
2. **Pure module** `command-pill.ts`: `pillRestState`, `orchestratorTarget`, `runningAgents`,
   `pillFocused`.
3. **Component** `CommandPill.tsx`, mounted as a sibling of `.world`. Styles use tokens only.
4. **Canvas wiring**:
   - `pillFocused()` in `shouldIgnoreKeys`
   - a `.command-pill` yield in `shouldYieldWheel`
   - `jumpToAttention(id)` named and shared by `onAttentionJump` and the pill
   - a `Cmd+Shift+Space` branch in `useKeyboardNav`
5. **Doors**: the `show-related`/`arrange-task` `V9_DOORS` canvas strings.
6. **Docs**:
   - verify-suite-table / verify-suites rows
   - load-bearing entries
   - product-rules sentence
   - ledger line
7. **Gate**: `npm run verify` under the Electron lock, a fresh-context critic, then one commit.
