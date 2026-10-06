# AGENTS.md

This file is what Codex reads. It is deliberately short. **[CLAUDE.md](CLAUDE.md) is the
index of this repository**: a short page of the rules everything rests on, and a table saying
which doc to open for which task — including which run is current. Read it before your first
change; it is addressed to any engineer, not to one tool. Then open only the doc its table
names for your task. The large ones (`docs/load-bearing.md` and its `-recovered` sibling,
`docs/verify-suites.md`, `docs/ideas-backlog.md`) are for grepping by module or suite name,
never reading whole.

## The one command

```sh
npm run verify
```

There is no unit-test runner and no linter. `npm run verify` chains every plain-node suite,
the typecheck, the build, and the real-Electron suites; CLAUDE.md says how much weight it
carries. `npm run verify:visual` (goldens) and `npm run verify:packaged` (the packaged
binary) are outside the chain. `npm run dev` unsets `ELECTRON_RUN_AS_NODE` first; if you see
`Cannot read properties of undefined (reading 'whenReady')` your shell exports it.

## Rules that are Codex-specific

Every other rule — check-id scoping, goldens, the four doors, absent/malformed/unknown,
the two lifetimes, the IPC diagram's dual pin, restyle-class stability, the no-styling-
dependency rule, commit format — is stated once, in CLAUDE.md or the doc its table names
(product-rules.md for anything UI/token/golden). It is not repeated here: read it there, and
if it ever seems to disagree with something below, CLAUDE.md wins. Restating it here would
just be a second copy to forget to update.

What's actually specific to running as Codex in this repo:

- **Never push to `origin`, never create a remote object, never modify anything outside this
  repository.** This is a Codex sandbox constraint, not a rule CLAUDE.md states for "any
  engineer."
- **Minimal changes.** Targeted fixes over comprehensive rewrites; no unrelated cleanup. The
  repository answers questions about itself; read its docs before searching the web.

Where anything else lives — build logs, ledgers, specs, plans, the backlog, the visual
register — is CLAUDE.md's index table. It is the one place that mapping is kept, so a
finished run can't be left named as current in a second copy here.
