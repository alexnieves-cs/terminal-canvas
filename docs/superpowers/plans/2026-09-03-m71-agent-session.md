# M71 plan — the agent-session runtime

Spec: `docs/superpowers/specs/2026-09-03-m71-agent-session-design.md`.

1. **Fixtures.** Scrub the four streams recorded from `claude` 2.1.259 on 2026-09-03 (a
   one-word turn, a turn with a Bash tool call, a turn with a permission request answered,
   three turns with an interrupt control round trip) into `scripts/fixtures/agent-session/`:
   paths, hook outputs, tool and MCP lists and memory paths removed; session ids and message
   ids kept stable; every record type and every delta type from the spec present.
2. **`verify:agent-session` red.** `scripts/agent-session-entry.cjs` bundles
   `shared/transcript.ts` and `main/agent-session.ts` (+ `agent-session-args.ts`); the suite's
   fake runner replays a fixture in caller-chosen chunks, records every stdin line and every
   kill, and exits on command. Every check in the spec's table, plus the parser checks
   (`transcript.*`) and the argv builder (`args.*`). Watched failing against the absent
   modules for the right reason (module not found — recorded), then per check as the modules
   land.
3. **`shared/transcript.ts`.** The union, the events, `parseStreamLine`, `parseStreamChunk`.
   `transcript.*` green.
4. **`main/agent-runner.ts`, `main/agent-session-args.ts`, `main/agent-session.ts`.** The
   seam, the argv builder over `agentArgs`, the manager. `args.*` and `session.*` green.
5. **`main/claude-cli-runner.ts`.** The real runner. Confirmed by hand under plain node
   against the real CLI (a turn, a tool call, a permission request, an interrupt); the
   transcript of that run goes in the build log.
6. **Wiring.** `quit.ts` takes an optional `agents`; `main/index.ts` constructs the manager
   with the real runner and the resolved shell env and hands it to the quit sequence. No IPC.
7. **The documents.** `package.json` script and chain; README suite list and milestone row;
   CLAUDE.md suite table; `docs/verify-suites.md` row; `docs/load-bearing.md` entries (the
   identity rule's second layer, usage-per-turn vs cost-cumulative, spawn-on-send, the
   permission flag); backlog #8 rewritten down; build log. `npm run verify` alone, merge,
   branch `m72-…`.
