# ACP against the backend registry (M112)

**What this is.** The Agent Client Protocol's method set, read against `shared/agent-backends.ts`'s
`BACKENDS` table, to answer one question M99 could not: is the table missing a dimension? No
`BackendDef` field is added here — a field lands with the `acp` row that has a consumer for it
(the customer-free-abstraction rule, M23-spec §9.1). Sources: agentclientprotocol.com/protocol
(overview, tool-calls), read 2026-09-06.

## The premise M99 stood on has expired

Act I's M0 line — "No ACP-speaking CLI is installed" — was true on 2026-09-05. On 2026-09-06
`@zed-industries/claude-code-acp` 0.16.2 is on npm: an ACP agent over stdio wrapping the
installed `claude`. The protocol is measurable on this machine with one `npx`.

## The diff

| ACP | `BACKENDS` today | Finding |
|---|---|---|
| `session/load` | `resumes` | same fact |
| `session/cancel` | `interrupts` | same fact |
| `session/request_permission` — options of kind `allow_once` / `allow_always` / `reject_once` / `reject_always` | `asksPermission` (one kind); M98's grant is `allow_always` | a `permissionKinds` dimension. Consumer: the approval card's verbs, which today show two or three |
| `ToolCallKind`: `read` `edit` `delete` `move` `search` `execute` `think` `fetch` `other` | — | **the data M102 wanted**: read-only decided by DATA, not a path heuristic. Consumer exists (`main/broker.ts`'s read-only gate); only an ACP stream carries it |
| `session/set_mode` | — | no consumer |
| `session/update` variant `plan` | — | M97's chip could project it; consumer only with an `acp` row |
| `elicitation/create` | — | structured questions — the approvals' third shape after permission and grant; no consumer |
| client-side `terminal/create` `output` `wait_for_exit` `kill` `release`, `fs/read_text_file` `write_text_file` | — | **the inversion**: the AGENT asks the HOST for terminals and files. This canvas as an ACP *client* whose panels are the agent's terminals is a milestone, not a row |
| prompt content blocks incl. `image` | `images` | same fact |
| `initialize` — `agentCapabilities` / `clientCapabilities` negotiated at runtime | the static table | an `acp` row's capabilities would be FILLED from `initialize`'s answer, not written by hand — the one row whose facts the CLI states itself |

## What an `acp` row would cost, re-costed

1. Three streams recorded into `scripts/fixtures/agent-session/acp/`: `initialize → session/new →
   session/prompt` with a tool call; one with a `session/request_permission`; one `session/load`.
2. A JSON-RPC layer over the manager's line seam. ACP is BIDIRECTIONAL: `request_permission` is a
   request the host ANSWERS by id, where claude's is a line the host writes. M98's `preAnswer`
   fits it exactly (a grant answers `allow_always` before the request is pending).
3. The row: `adoptsThreadId: true` (`session/new` mints `sessionId`), `asksPermission: true`,
   `interrupts: true` (`session/cancel`), `resumes` from `agentCapabilities.loadSession`,
   `reportsCost: false` (ACP carries no cost), `oneProcessPerTurn: false`, `closeStdin: false`.
4. `registry.1`'s grep rule holds: the adapter reads the table, never the name.

Declined for M112 by scope — the cost is now measurable and written down.
