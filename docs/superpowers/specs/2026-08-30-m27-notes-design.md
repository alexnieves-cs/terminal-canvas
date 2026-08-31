# M27 — Notes: a place on the canvas to write a sentence

## Decision

Every panel kind this app has is a read-out of something the machine already
knows — a diff, a file, a config, a ticket, a process. Nothing is a place the
user puts thought. M27 adds one: a **note**, created from the palette, backed by
a real `.md` file under the selected panel's cwd, opened on the canvas already
in edit mode and rendered as wrapped prose rather than numbered code lines.

A note is **not a sixth panel kind**. It is `kind: 'file'` with a new
`source.prose?: true`. A note is storage-identical to a file panel — the same
`FileSource`, the same `file:read`/`file:write`/`file:close`/`file:changed`, the
same compare-and-swap M22 hardened, the same directory watcher. The only genuine
divergences are rendering and initial state, and both are display facts. Adding
a kind instead would move `isTerminalPanel`, both `nextIdRef` regexes, five
dispose guards and three store clears — every one of which `CLAUDE.md` records
as a silent failure — to express a difference that is not a difference in what
the thing IS.

The note lives on disk because that is what makes it worth writing: it
version-controls with the project, an agent can read it, and it survives outside
the app. Closes the note half of backlog #14 tier 1.

## Safety contract

- Creation is `writeFileSync(target, seed, { flag: 'wx' })` — atomic
  create-exclusive. An `existsSync` check followed by a write is a TOCTOU, and
  in this app the racing writer is an autonomous agent in the same directory.
- An existing name is `exists`, its own arm, and the palette **re-prompts**
  rather than opening the file. "Create" and "open" are different acts, and the
  existing bytes are never touched.
- A name resolving outside the root is `refused` and nothing is written.
- `prose` is absent-stays-absent through `parseFileSource`, `toPanels`,
  `fromPanels` and `makeFilePanel` — a spread writes `prose: undefined`, where
  `'prose' in source` reads true.
- A truncated note is read-only, unchanged from M22: half a file saved back is a
  different file, in its most destructive available form.
- The editor keeps the `.file-node__editor` class, so `useNavGrid`'s target
  guard covers a note with no edit — a new class would silently reopen the
  documented `Cmd+G` unmounts-the-draft bug.

## Explicit non-goal

No markdown rendering. A renderer means a new runtime dependency this repo
refuses, or a hand-rolled parser whose failure mode is a parser differential
against whatever markdown tool the user actually uses. The value here is the
place to write, not the formatting. No note index, no backlinks, no search.

## Verification

`verify:file` covers `createFile`'s four arms, and the check that carries the
milestone is the one asserting an existing file's bytes are **unchanged** after
a refusal — the no-write half is the whole check, the rule `verify:file` 12
already states. `verify:layout` and `verify:viewport` prove `prose` survives
both persistence doors and the mint without becoming `undefined`.
`verify:rail` proves the prose body renders without a gutter while the
editability gate is untouched. `verify:palette` proves the row is disabled with
its exported reason rather than absent. `verify:panels` drives the real palette
row end to end and reads the saved bytes **off disk**.
