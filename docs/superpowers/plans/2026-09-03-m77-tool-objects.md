# M77 — Tool calls as inspectable objects: plan

Spec: `docs/superpowers/specs/2026-09-03-m77-tool-objects-design.md`. Branch `m77-tool-objects`.

1. **Red first, plain node.** `verify:review tools.1` against `shared/tool-index.ts` (absent).
   `verify:rail tools.1` (`buildReviewNodeModel` `touches`, `chatRows` `file`), `tools.2`
   (`reviewable` on the inspector model). `verify:palette tools.1` (`panel.review` on a chat).
2. `shared/tool-index.ts`; `chat-model.ts` tool row `file`; `review-node-model.ts` `touches`;
   `inspector-fields.ts` and `commands.ts` `reviewable` + reason. Green.
3. Main: `agent:create` captures; dispose-with-drop drops; the startup sweep counts chats.
4. Renderer: `useRailModels` sessionless gate and `reviewable`; Canvas `selectedSpawned` for a
   chat and `openReview` accepting a chat; `ReviewNode` touches (via `useChat(subjectId)`);
   `ChatNode` `diff` verb with its three-state body.
5. `verify:panels tools.1–.2`: a chat minted in a real repository with a seeded transcript whose
   `Edit` names a file; the file edited on disk; Changes lists it; `Open review` from the pane;
   the node's row says `1 tool call`; the tool row's `diff` shows the hunk; a `Read` row says
   unchanged. Red first against the missing verbs.
6. `npm run shot`: a `tool-objects` scene. Critic, verifier, triage, build log, documents.
7. `npm run verify` alone; `graphify update .`; commit; merge; branch `m78-…`.
