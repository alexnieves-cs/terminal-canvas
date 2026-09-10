# M252 plan — Describe a tool

Spec: `docs/superpowers/specs/2026-09-10-m252-describe-a-tool.md`.

1. **Checks first.** `scripts/verify-tool.cjs` + `tool-entry.cjs`, `verify:tool` in package.json.
   Observed red twice: first a harness crash (an unguarded `readdirSync` ended the run before its
   tally — fixed, not counted), then a clean 0/11.
2. `shared/tool-spec.ts` — schema, system prompt, `parseToolReply`, `toolCapabilities`,
   `capabilityLines`, `REASON_TOOL_UNREAD`, result types.
3. `main/tool-generate.ts` — argv, one run over an injected `AgentRunner`, timeout, writes under
   `tools/<slug>`; `INERT_TOOLS`. Green 11/11 (one check's expectation corrected: the dropped
   node's EDGE is a second named omission).
4. Channel `tool:generate`: contract → ipc collaborator (appended last) → preload → index.ts with
   the real `claudeCliRunner`, `claudePath`, `loginEnv`; the panels harness plants `state.toolReply`.
5. Renderer: `CreationHost.tool` + `CREATABLE_OBJECTS` `tool`; `arriveTool`; `PreviewBinding`
   `reviewed`/`tool` + parse (fails closed); BrowserNode makes no guest while unread; WorkflowNode
   banner; `markTemplateRead` / `markPreviewRead` as `onMarkRead` props only; Open and Start dev
   server refuse; inspector reach through a `templateOf` lookup; the refusal sentence widened.
6. `verify:verbs tool.door.1`, `creation.registry.1` names `tool`; `verify:ipc` 136; CLAUDE.md list
   and README diagram.
7. `verify:panels:product tool.1–3`; docs; full gate.
