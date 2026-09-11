# M252 — Describe a tool

Spec: `docs/superpowers/specs/2026-09-10-m252-describe-a-tool.md`.
Plan: `docs/superpowers/plans/2026-09-10-m252-describe-a-tool.md`.

## What landed
- `shared/tool-spec.ts` — the schema and system prompt, `parseToolReply` (the schema object or a
  fenced JSON result; workflow through `parseTemplates`; app paths all-or-nothing), reach
  (`toolCapabilities`, `capabilityLines`), `REASON_TOOL_UNREAD`.
- `main/tool-generate.ts` — one `claude -p --output-format json --tools "" --json-schema …
  -- <description>` over an injected `AgentRunner`; stdin closed, a timeout that kills, refusals
  before any spawn; an app's files only under a fresh `tools/<slug>[-N]/` plus a `package.json`
  carrying the dev script; a workflow writes nothing. `tool:generate` wired to the real
  `claudeCliRunner` with the sessions' `claudePath` and `loginEnv`.
- `tool` in `CREATABLE_OBJECTS` (`requires: 'folder'`) — pill, palette, `tc plan create-tool`,
  action node. No description opens a one-line prompt (palette first).
- Inert on arrival: a workflow saved `reviewed: false`; an app's preview binding `reviewed:
  false` (parse fails closed), so the pane makes no guest and Open / Start dev server refuse by
  name. The unread refusal now reads *from outside this canvas (a file, or an agent's answer)*.
- "I've read this" on the workflow panel and on the pane — `onMarkRead` props only, no verb
  (`tool.door.1`). It clears the record, the renderer's rows and the DRAFT.
- Reach on the unread object and in the inspector (workflow via a `templateOf` lookup threaded
  like `templateNameOf`; browser from the binding), with a `read` field.

## Evidence
- `verify:tool`: first red was a HARNESS CRASH (an unguarded `readdirSync` ended the run before
  its tally) — fixed and not counted; then a clean 0/11; then 10/11, the one red a wrong
  expectation (the dropped node's edge is a second named omission — the check was made stricter,
  not looser); then 11/11.
- `verify:panels:product tool.1–3`: tool.1 and tool.3's refusals green from the first run whose
  setup was valid. tool.2 red twice with the mark cleared on MAIN'S record: its own detail
  (added to diagnose it) showed the spoken refusal after the press and a `node-test` a moment
  later making the note — a race between the save landing and the renderer's rows and draft.
  Fixed on both sides: the renderer's copies change the moment the save lands, and the check
  waits for the banner to leave (what a person waits for). tool.3 was red once for a harness
  reason (the saved selection lost to a racing autosave, so no folder was in scope); the seed now
  selects through the rail and asserts it is the only panel. Last run: tool.1–3 green, 102/104.
- `verify:verbs` 26/26 (`tool.door.1`, `creation.registry.1` with `tool`, `closure.v9.1` with
  `create-tool`); `verify:layout` 255/255; `verify:ipc` pinned to 136; typecheck clean.

## verify:panels:product is timing-sensitive BEFORE this branch
Four solo runs on this branch each failed a different pre-existing check (`onboarding.start.1`
twice, `browser.1` and `task.show.1` once), all of which run BEFORE the tool checks. One run of
the untouched base commit `7a3323d0` failed `work.action.1` and `review.task.2` and then the
230s watchdog. Recorded, not fixed here. Also found, not fixed: `verify:styles` 4–6 are red on
the base commit (57/60) and on this branch identically; this branch changes no CSS.

## Known limits (named, not fixed)
- Measured once, owed by hand: the field name of the schema-validated object in claude's
  `--output-format json` envelope. The parser accepts `structured_output` OR JSON in `result`,
  so either spelling works; a real run confirming which one is owed.
- Marking read is not an undo step (the `setChecklistView` precedent).
- The generated app's dev script is shown, not sandboxed: after a person reads it, Start dev
  server runs it like any project's.
- `main` gained M205 after this branch was cut; the merge is owed and not done here.
