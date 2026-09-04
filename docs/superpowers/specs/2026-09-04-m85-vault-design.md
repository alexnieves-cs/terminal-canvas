# M85 — The vault

**Status:** design, 2026-09-04. **Branch:** `m85-vault`. **Kind:** feature + surface.
**Briefs built against:** 1.x principles 3 (identity leads), 6 (every control says what it
is), 7 (three states), 9 (a disabled row names the fix); 2.0 principle 12 (a body is a well).
**Thesis sentence:** the notes an agent and a person write about a project, linked to each
other, reachable as a place rather than as a directory listing.

## What this milestone is for

M27 gave the app a note: a file panel in prose mode, created from the palette into the
selected panel's directory. What it did not give is a PLACE for notes — a folder that is the
project's writing, where a note can point at another note and you can see what points back.
The scope decision settles the shape in advance and this spec keeps it: **a vault is not a
new panel kind.** A note already is a file panel; a vault is many of them plus an index. The
whole milestone is therefore a navigator pane, a link syntax, a backlinks section under the
note, and one channel.

## Design

### The syntax and the index (`shared/vault.ts`, pure — `verify:file`)

- A link is `[[name]]`, the spelling every tool that has this feature uses; `[[name|text]]`
  renders `text` and points at `name`. A name is matched against a note's BASENAME without
  its extension, case-insensitively, and a name with a path (`meetings/2026-09-04`) is
  matched against the path relative to the vault root. Anything else is literal text — the
  same closed rule `composer-model.ts`'s `{{hole}}` names obey.
- `parseWikiLinks(body)` → the links in a note, with their offsets, so the renderer can paint
  them without a second parse.
- `buildVaultIndex(files)` → `{ byName, backlinks }` over `{ path, body }` rows: which note a
  name resolves to, and for each note the notes that point AT it, each with the line it was
  named on. Pure and plain-node checked: the index is the milestone.
- **An unresolved link is not an error and not hidden.** It renders as a link with a distinct
  mark and opening it OFFERS TO CREATE the note — the "a row that disappears" rule reaching a
  link: a `[[name]]` that quietly reads as text is a note somebody meant to write.

### The read (`main/vault-read.ts`, `vault:read`)

- `vault:read(root)` → every `.md` under `root` (recursive, capped at `VAULT_MAX_FILES` 500
  and `VAULT_MAX_BYTES` per file), as `{ path, title, body }` rows, plus a `skipped` count.
  Read in MAIN, like every other filesystem verb; the renderer has no `fs`.
- The cap is REPORTED, never silent: a vault of 900 notes says how many it did not read.
- The renderer builds the index from those rows, so the pure half stays pure.

### The pane (`renderer/shell/`, the Files pane's second mode)

- The Files pane gains a `Vault` mode beside its tree: rooted at the vault folder, it lists
  every note by TITLE (the first `# heading`, else the basename), newest first, with a filter
  line. Clicking a row opens the note as a prose file panel — M27's own verb, unchanged.
- The vault's root is a SETTING (`vault.root`, absolute path, empty by default) in
  `shared/settings-schema.ts`, set from the palette; with none set the mode is present and
  says so with the verb that fixes it, never hidden.
- The pane refreshes on `file:changed` for its root, so an agent writing a note into the
  folder appears without a gesture — the watch M22 already has.

### The note (`FileNode.tsx`, prose mode)

- A prose file panel whose path is inside the vault root renders `[[links]]` as controls:
  clicking one opens the target as a prose panel, or offers to create it when it resolves to
  nothing.
- Under the body, a `Backlinks` section: the notes that point at this one, each a row naming
  the note and the line. Three states — no vault set, none pointing here, and the list.

## What it must not break

- No new panel kind: a note stays a file panel in prose mode (`verify:panels 94`'s dispose
  count and the sessionless rules unchanged).
- The editor's compare-and-swap save (M22) and the prose rendering (M27) are untouched.
- `fs:list` and the file tree keep working exactly as they do; the vault mode is a second
  mode of the same pane, not a replacement.

## The failure modes this guards against, each with its check

| Failure | Check |
|---|---|
| `[[a]]` inside code, or `[a]`, read as a link; a `|` alias losing its target | `verify:file vault.1` |
| A backlink list that misses a second link from the same note, or lists a note against itself | `verify:file vault.1` |
| The cap silently dropping notes | `verify:file vault.2` |
| An unresolved link rendering as plain text | `verify:panels vault.1` |
| A click on a link opening the wrong note, or nothing | `verify:panels vault.1` |
| The backlinks section showing "none" when no vault is set | `verify:panels vault.1` |

## Amended after the verifier

- **A fourth navigator pane, not a mode of Files.** The dock's own comment said a fifth
  navigator would be cheap; `shell.navigator` gains `vault`.
- **A note OUTSIDE the vault shows no Backlinks section at all** — there is no index to ask,
  and an empty heading would claim nothing points here when nothing was asked. The three
  states are therefore inside the vault: reading, none, the list.
- **An over-cap note is SKIPPED and counted**, never truncated: a truncated note would index
  half its links and show half its backlinks, silently.
- **The refresh rides main's own watch on the root** (`vault:changed`, debounced), not
  `file:changed` — see `useVault.ts`.
- **A basename that two notes share resolves to the alphabetically first**; the relative
  path is the unambiguous spelling and always wins. Recorded as the rule, not hidden.
- **Blank on the folder line cancels; `none` clears.**

## Manual-only, added

- A real vault of several hundred notes, for the cap's shape on a real disk.
