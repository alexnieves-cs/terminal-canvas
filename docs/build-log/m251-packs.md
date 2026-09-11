# M251 — packs, Phase A

Spec: `docs/superpowers/specs/2026-09-10-m251-packs.md`.
Plan: `docs/superpowers/plans/2026-09-10-m251-packs.md`.

A pack is one discipline's library objects — workflows, saved prompts, presets — plus the credentials
and external tools that work needs, in one `.tcpack` file. Its import is read-first and inert. Phase B
(a dev-relations integration pack on the existing `github` credential) is sketched in the spec and
**not built**.

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
  their canvas doors are owed by name (M252). The two read statements are in `EXCLUDED_ACTIONS`.

## Evidence

- RED first:
  - `verify:file pack.manifest.1–.4`, `pack.build.1`, `pack.requires.1` and `pack.remap.1` failed
    0/7 on "pack.ts does not export …", then passed 7/7.
  - `verify:layout preset.reviewed.1` failed on the unparsed field, then passed.
- The end-to-end checks, `verify:panels:product pack.import.1` and `pack.import.2`, were written
  after the renderer. They were NOT watched red against an absent module — recorded here rather
  than claimed.
- `verify:ipc` passes at 138 channels, re-pinned from 134.
- `verify:verbs gate.2` names `shared/pack.ts` as the seventh `redactSecrets` caller, and
  `agent-door.7` refuses both pack verbs.

## Owed

- A canvas door for each pack verb (M252).
- Picking individual items on export; Phase A exports the whole user library.
- An inspector "I've read this" control. Phase A's door is the palette row.
- The tool probe's `unanswered` arm is reachable only when no probe runs. Main's `which` answers
  found or not-found.
- Phase B, until confirmed.
