# M81 — The supervisor: plan

Spec: `docs/superpowers/specs/2026-09-04-m81-supervisor-design.md`. Branch `m81-supervisor`.

1. **Red first.** `verify:control status.1–.2` (the verb, its refusals, the model's shape and
   the not-answered note). `verify:agent-session supervisor.1` (the append flag, and none on
   a resume).
2. `control-protocol.ts`'s fifth verb; `control-handler.ts`'s `status` arm over an injected
   `canvas()`; `canvas:model` in the contract and the renderer's answer; main's wiring.
3. `headlessArgs`' `appendSystemPrompt`; `AgentSessionSpec`; the manager passes it.
4. The sheet's `supervisor of this canvas` row (disabled by name when one exists) and the
   supervisor's prompt and first message.
5. `verify:panels supervisor.1`: the real socket, the real model, one supervisor, the message
   inserted and unsent.
6. `npm run shot`: a `supervisor` scene. Critic, verifier, triage, build log, documents.
7. `npm run verify` alone; `graphify update .`; commit; merge; branch `m82-…`.
