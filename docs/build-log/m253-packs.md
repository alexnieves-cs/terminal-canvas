# M253 — packs, Phase A

Spec: `docs/superpowers/specs/2026-09-10-m253-packs.md`.
Plan: `docs/superpowers/plans/2026-09-10-m253-packs.md`.

A pack is one discipline's library objects — workflows, saved prompts, presets — plus the credentials
and external tools that work needs, in one `.tcpack` file. Its import is read-first and inert. Phase B
(a dev-relations integration pack on the existing `github` credential) is sketched in the spec and
**not built**.

**Numbered M253, not M251.** This milestone first took M251, which branch `m246-deck-tools` had
already committed (`feat(m251)` deck → .pptx, `feat(m252)` describe a tool, both numbers the user
chose). It was renumbered before merging, and its owed canvas doors are dated M254. That branch
also adds a seventh `redactSecrets` caller (`main/deck-export.ts`) to `verify:verbs gate.2`, as
this one does (`shared/pack.ts`). Whichever reaches main second re-pins that list to eight.

## What landed

- `shared/pack.ts`: `buildPack`, `parsePack`, `packRequirements`, `remapPack` and `packSentence`.
  - It has its own `kind: 'pack'`, never a portable kind. Each parser refuses the other's file by name.
  - The manifest follows the three-arm rule per key. The contents list is reconciled against the
    payload, and an unlisted item is not added.
  - Credentials are named by service and field only.
- `main/pack-handlers.ts`: one factory for `pack:read` / `pack:add` / `pack:export`, built by
  production and by the panels harness.
  - Read holds the parse under a token. Add takes only the token and mints ids against the store.
  - Export is main-built from the store.
- `Preset.reviewed?: false`. An unread pack preset is refused by name in main at the menu, the
  palette, the spawn sheet and `tc spawn`. `preset:mark-reviewed` clears it.
- Renderer:
  - the `PackPreview` sheet, which shows name, version, contents by kind, per-field needs, warnings
    and the inert promise before *Add N objects*;
  - palette rows `pack.import` and `pack.export`;
  - "I've read this" rows for an unread preset (whose spawn row is disabled with
    `REASON_UNREAD_PRESET`) and for an unread workflow. This also closes M190's gap: until now,
    nothing ever cleared a template's `reviewed: false`.
- Verbs `import-pack` and `export-pack` (destructive). Both are refused to a teammate's plan, and
  their canvas doors are owed by name (M254). The two read statements are in `EXCLUDED_ACTIONS`.

## Evidence

- RED first:
  - `verify:file pack.manifest.1–.4`, `pack.build.1`, `pack.requires.1` and `pack.remap.1` failed
    0/7 on "pack.ts does not export …", then passed 7/7.
  - `verify:layout preset.reviewed.1` failed on the unparsed field, then passed.
- The end-to-end checks, `verify:panels:product pack.import.1` and `pack.import.2`, were written
  after the renderer. They were NOT watched red against an absent module — recorded here rather
  than claimed.
- `verify:panels:product pack.import.1` and `pack.import.2` pass 2/2 (2026-09-10 21:59, under
  `/tmp/tc-electron-lock`, after the harness fix d9487ee6). The observed needs were GitHub ·
  personal access token as not-connected and mastodon as unknown-service.
- The last full `npm run verify` was 39/43, and none of the four reds is caused by packs:
  - `verify:canvas` 2–4 and `verify:panels:kinds` broadcast.* are red on main at c9fc193f.
  - `verify:panels:product reach.1` and `reach.3` are red on main too: M207/M208 moved the
    secondary verbs behind "More actions…".
  - `verify:pty-manager` 14 was a load flake; it passes 63/63 when rerun alone.
- `verify:ipc` passes at 138 channels, re-pinned from 134.
- `verify:verbs gate.2` names `shared/pack.ts` as the seventh `redactSecrets` caller, and
  `agent-door.7` refuses both pack verbs.

## The critic

A fresh-context review of the feature commit found two more doors onto an unread pack preset,
beyond the four the first cut guarded. Both are fixed.

1. **A workflow node bound to a preset.** `presetTemplate` (`preset:template`) handed back the
   template unchecked, and `instantiateTemplate` minted a panel straight from it. It now answers
   `{ refused }` with `unreviewedPresetReason`'s sentence. The renderer shows that sentence
   instead of "names a preset that no longer exists".
2. **Cmd+N.** The set-default row was not gated, and Cmd+N spawns from a template pushed ahead of
   time, which never passes a spawn-time refusal. The row is now disabled with
   `REASON_UNREAD_PRESET`, and `resolveDefault` never answers an unread preset: it falls back to
   the first built-in, however that preset came to be named the default.

`verify:layout preset.reviewed.2` pins the second fix. It was written after the fix, so it was not
watched red. The first fix has no dedicated check yet; one is owed below.

The critic confirmed as correct:
- the parser's three arms;
- the scrub and the `env` omission;
- the single-use token;
- both absent-key rebuilds;
- the four original doors.

## Owed

- A check that a workflow node bound to an unread pack preset is refused by name, not minted
  (the critic's first finding, fixed but not pinned).

- A canvas door for each pack verb (M254).
- Picking individual items on export; Phase A exports the whole user library.
- An inspector "I've read this" control. Phase A's door is the palette row.
- The tool probe's `unanswered` arm is reachable only when no probe runs. Main's `which` answers
  found or not-found.
- Phase B, until confirmed.
