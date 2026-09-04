# M85 — The vault

**Branch:** `m85-vault`. **Spec:** `docs/superpowers/specs/2026-09-04-m85-vault-design.md`.
**Plan:** `docs/superpowers/plans/2026-09-04-m85-vault.md`. **Status:** finished 2026-09-04.

**Thesis sentence:** the notes an agent and a person write about a project, linked to each
other, reachable as a place rather than as a directory listing.

## What landed

- `shared/vault.ts`: `parseWikiLinks` (strict `[[name]]` / `[[name|text]]`; a reference link
  and an unclosed `[[` are text), `buildVaultIndex` (names by basename and by relative path,
  case-insensitive, the path winning a collision; backlinks with the line, both links from one
  note, never a note against itself), `resolveWikiName` (null is a real answer).
  `verify:file vault.1`.
- `main/vault-read.ts`: every `.md` under the root, recursive, titled by first heading or
  basename, both caps REPORTED, a missing root answering empty with its reason.
  `verify:file vault.2`. `vault:read` in the contract and both diagrams; `verify:ipc` at 88.
- `vault.root`, the app's first `text` setting — and the `text` type reaching the palette's
  row builder, the store's write door and the schema's parse door.
- The Vault pane: the navigator's fourth (`shell.navigator` gains `vault`), notes by title
  newest first, a filter, three states before the list, the cap under it, a refresh, and a
  re-read on every `file:changed` so an agent's note appears without a gesture.
- The note: `[[links]]` painted as controls inside the vault (resolved opens; unresolved is
  dashed and offers to create the note, named what the link said), a Backlinks section with
  three states, and open-to-READ inside a vault. `verify:panels vault.1`.

## Red first

- `verify:file vault.1/.2`: red at bundle scope, the two modules absent.
- `verify:panels vault.1`: red three times for three real facts — the `text` setting was
  refused at both doors (below), the harness had no `vaultRead`, and the note auto-entered its
  editor so no link was clickable (below).

## Decisions taken while building, and why

- **Not a kind.** A note is a file panel in prose mode; the vault is a pane and an index.
  Every rule about what a note is stays in one place.
- **A vault note opens to read.** Its links are the point; ✎ is one click away.
- **Null resolves are links.** See the load-bearing entry.
- **The fourth pane, not a mode of Files.** The dock's own comment said a fifth navigator
  would be cheap, and it was.

## The visual loop

See the triage below.

## Verification

`npm run verify` run alone after the verify tmux server was killed, exit code 0: `verify:file`
44/44, `verify:layout` 193/193, `verify:palette` 122/122, `verify:ipc` 88 channels,
`verify:panels` 294/294. The `vault` scene re-shot after both triages and read: the
`· create` hint, the titles in Backlinks, the marked row, the folder prefix.

## Triage: the critic

**Accepted and fixed.** An unresolved link gave no sign of what a click would do (it now
trails a dim `· create`, the rail's own idiom). One note had three names across the pane,
the body and Backlinks (Backlinks now shows the pane's title; the index carries titles). The
open note's row in the pane was unmarked (it carries the selected-row bar). The folder sat
in the trailing column where every other pane puts a state word (it is a dim leading prefix
now, the way the body writes a path). The scene proved only Backlinks' answered state (the
empty arm is now asserted in `verify:panels vault.1`).

**Declined, with a reason.** *The file panel's two-line absolute path row.* Inherited from
M16 and read by existing checks as the full path; the memory node's left-truncation rule
could reach it in a later pass, but not as a side effect of this milestone.

## Triage: the verifier

Verdict: delivered with gaps. **Accepted and fixed:**

- **A typo'd root walked `$HOME`.** `resolveCwd` falls back to the home directory; the read
  now expands and realpaths, and a missing folder is the reader's own "no vault" arm.
- **No refresh for the root, and a re-walk on every `file:changed` anywhere.** Main now
  watches the root itself (`vault:changed`, debounced); the renderer re-reads on that only.
- **The palette had no row for the `text` setting** — the edit had been lost in an earlier
  aborted script, so the spec's "set from the palette" was false. Restored, and the
  `Manage settings…` count includes it.
- **`[[a]]` inside code was a link.** Fenced blocks and inline backticks are skipped;
  `verify:file vault.1` now feeds both.
- **Create-from-link swallowed three refusals.** Re-prompts by name, with the catch.
- **Prefix matching was against the setting as typed.** Every comparison uses main's
  resolved root now.
- **Fresh prop objects defeated `Navigator`'s and `FileNode`'s memos on every mousemove.**
  Both objects are memoised on their fields.
- **A re-read replaced the list with `reading…`**, unmounting the filter mid-typing. Pending
  paints only before the first answer.
- **A vault note could snap into its editor later** when the root was cleared or re-typed,
  and `vaultReady` stuck false if the settings read rejected. Decided once; ready on catch.
- **Blank on the folder line cleared the vault**; blank cancels now and `none` clears.
- **The parser's `text` arm had no check.** `verify:layout text.1`.

**Declined, with reasons, the spec amended to say so.** *A "no vault set" state in the
Backlinks section:* a note outside a vault shows no section, because there is no index to
ask. *Truncating an over-cap note:* skipped and counted instead, since half a note indexes
half its links. *Basename collisions:* the alphabetically first wins and the relative path
is the unambiguous spelling — recorded as the rule. *`titleOf` scanning forty lines and
counting a `#` in a fence:* a note with long front matter titles by its basename, which is
honest if plain; left as a limit.
