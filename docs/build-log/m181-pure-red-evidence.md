# M181 — the pure-tier checks, watched red

The plain-node half of M181's red-first pass (plan step 1 and the pure part of step 2),
written by a fresh-context check writer before any production module existed. Three suites
were touched and run under plain node on 2026-09-08, on `v9-act1-onboarding` at b8cd4b3
(the M180 commit) in an isolated worktree. No Electron suite was run.

## How a missing module fails by name rather than aborting the suite

Each suite bundles a fixed entry list with esbuild at module scope, so a bare
`require('../src/shared/starter.ts')` for a file that does not exist would throw inside
`buildSync` — before the first `ok()` — and every pre-existing check in the suite would be
lost with it (the verify-suites rule: a throw's RED is not evidence). The three entry files
therefore require the new modules inside a `try { require(...) } catch { return {} }`, the
shape `scripts/file-entry.cjs` already used for M145's `clipboard-file.ts`: esbuild treats a
require inside a try block as a warning rather than a bundle error and leaves it as a runtime
require, which throws and is caught. Each new check then guards on the export's presence and
records `FAIL … — <module> does not exist` as its detail.

`image.record.1` needs no guard: `layout-schema.ts` exists and drops `kind: 'image'` today
as an unrecognised kind, which is the real red the check exists to turn green.

## `node scripts/verify-layout.cjs`

Exit code **1**. Tally printed: **`234/238 passed`**.

FAIL lines, all four new:

- `starter.1` — `src/shared/starter.ts does not exist`
- `starter.2` — `src/shared/starter.ts does not exist`
- `starter.3` — `src/shared/starter.ts does not exist`
- `image.record.1` — kept `n1,n2`; warnings `dropped panel i1: unrecognised kind "image"`
  (and i2, i3, i4 likewise). The valid image panel `i1` is dropped today; the check wants it
  kept with `image.path === '/tmp/welcome.png'` and only i2/i3/i4 dropped by id.

Every pre-existing check (234, the count `CLAUDE.md`'s table records) PASSED.

## `node scripts/verify-viewport.cjs`

Exit code **1**. Tally printed: **`137/139 passed`**.

FAIL lines, both new:

- `starter.plan.1` — `src/shared/starter.ts does not exist`
- `image.kind.1` — `makeImagePanel / isImagePanel do not exist in src/renderer/panels/panels.ts`

Every pre-existing check (137) PASSED.

## `node scripts/verify-file.cjs`

Exit code **1**. Tally printed: **`83/85 passed`**.

FAIL lines, both new:

- `image.1` — `src/main/image-read.ts does not exist`
- `starter.prepare.1` — `src/main/starter-prepare.ts does not exist`

Every pre-existing check (83) PASSED.

## What each new check asserts

| Suite | Id | Asserts |
|---|---|---|
| layout | `starter.1` | `parseStarter`: `undefined` → `undefined` with NO warning; a string, a number, `null`, an array, a string/negative/non-integer `version`, a non-array `keys` and a missing `keys` each → `undefined` with exactly ONE warning; `['agent', 3, 'terminal', null, 'note']` → `agent,terminal,note`; mutating the result (`keys.push`, `version = 99`) leaves the input untouched |
| layout | `starter.2` | a workspace without `starter` has no `starter` key after `parseLayout` AND no `"starter"` substring in `serialiseLayout`'s text, with zero warnings; `{version: 1, keys: ['agent','note']}` survives parse → serialise → parse; `{version: 'one', keys: []}` drops by name (a warning mentioning `starter`) with the workspace kept |
| layout | `starter.3` | `starterKeysToApply(undefined)` is five keys, `agent` first then `STARTER_OBJECTS`' keys in order; a record holding all five → `[]`; `keys: []` → the same five; `['agent','note','not-a-key']` → the manifest keys minus `note`; `carryStarter({})` has no `starter` key (`in` test); `carryStarter({starter})` is a copy (different object AND different `keys` array) with the same content; `AGENT_KEY === 'agent'` |
| layout | `image.record.1` | `kind: 'image'` with `image.path: '/tmp/welcome.png'` survives parse and re-parse beside two terminals; a missing `image`, `path: 7` and `path: 'relative/welcome.png'` each drop THAT panel with a warning naming its id; the surviving ids are exactly `n1,i1,n2` |
| viewport | `starter.plan.1` | `STARTER_VERSION === 1`, `AGENT_KEY === 'agent'`; keys are exactly `{terminal, note, workflow, image}` once each and none is `agent`; every `kind` ∈ `{terminal, file, workflow, image}`; every caption non-empty and ending in `.`; every rect has finite `dx`/`dy` and `w, h > 0`; no two rects overlap (strict AABB test) |
| viewport | `image.kind.1` | `makeImagePanel('img1', {1000,-250}, 7, path, title)` is centred on the point (`x + w/2 === cx`, `y + h/2 === cy`), `kind: 'image'`, `z: 7`, carries `image.path` and `title`; `isImagePanel` is true for it and FALSE for fourteen others (terminal, a kind-less legacy record, file, review, jira, github, toolbox, chat, memory, watcher, browser, work, skill, workflow); all thirteen existing `is*Panel` partitions are false for the image panel |
| file | `image.1` | `IMAGE_MAX_BYTES === 5 MiB`; a real PNG (magic `89 50 4E 47`) is `data`/`image/png` with `bytes` equal to the file and a data URL that decodes back to the same bytes; `FF D8 FF` in a `.txt` is `image/jpeg`; `GIF89a` in a `.bin` is `image/gif`; `RIFF....WEBP` in a `.dat` is `image/webp`; a `.png` holding text is `not-an-image`; a PNG of `IMAGE_MAX_BYTES + 1` bytes is `too-large` with `bytes` and `cap` and NO `dataUrl` key; a missing path is `missing` and never throws |
| file | `starter.prepare.1` | `prepareStarter(<fresh nested dir>)` creates the directory, returns `notePath = <dir>/welcome.md` and `imagePath = <dir>/welcome.png`, `wrote` lists exactly both; a second call has `wrote: []`, the same paths and a byte-identical note; after overwriting `welcome.md` with the person's own text a third call has `wrote: []` and the text is byte-identical; `welcome.png` reads through `readImage` as `data`/`image/png`; the note's first line starts with `# ` |

## Assumptions where the agreed API left room

- **`too-large` carries no `dataUrl` key** — the API says the bytes are never read into the
  data URL; the check asserts `!('dataUrl' in result)` on that arm, which is the only way a
  suite can see "not read" rather than "read and discarded".
- **`prepareStarter` creates a NESTED missing directory** (`<fixture>/starter fixture/nested/starter`,
  with a space in the path): "creating `dir`" is read as `mkdirSync(dir, { recursive: true })`.
- **`starterKeysToApply` order** is read literally: `agent` first, then `STARTER_OBJECTS` in
  array order, filtered — the check compares joined strings, so a different manifest order
  is the manifest's to choose but the function must follow it.
- **`carryStarter`'s copy is deep to one level**: `result.starter !== input.starter` AND
  `result.starter.keys !== input.starter.keys`, so a later `keys.push` at one copy site cannot
  reach the record another site holds.
- **The malformed `starter` warning** on the workspace is matched only by the word `starter`
  in its text; the exact sentence is the implementation's.
- **`makeImagePanel`'s size** is not pinned (no `IMAGE_W`/`IMAGE_H` was agreed); only the
  centring and `w, h > 0` are.
- **The overlap test is strict** (`a.dx < b.dx + b.w && …`): two rects that share an edge do
  not overlap.
- The `starter.plan.1` check does NOT assert the examples sit inside any working view — the
  spec's "inside the working view's right edge at 100 %" depends on the agent's size, which
  the renderer owns; that is `verify:panels:product starter.1`'s.

## Files touched

- `scripts/layout-entry.cjs`, `scripts/viewport-entry.cjs`, `scripts/file-entry.cjs` — the
  guarded requires.
- `scripts/verify-layout.cjs` — `starter.1`, `starter.2`, `starter.3`, `image.record.1`.
- `scripts/verify-viewport.cjs` — `starter.plan.1`, `image.kind.1`.
- `scripts/verify-file.cjs` — `image.1`, `starter.prepare.1`.
- This file.
