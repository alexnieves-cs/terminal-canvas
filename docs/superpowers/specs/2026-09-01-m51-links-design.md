# M51 — Cmd-click a path or URL

**Status:** designed 2026-09-02. Backlog #54, reinstated by the scope
amendment (§7) and gated, as the entry itself says, on the hover half of
pointer correction.

## What this milestone is for

Agent CLIs print `src/main/pty-manager.ts:118`, `http://localhost:5173` and
stack traces all day, and none of it is clickable. A link provider turns
every printed path and URL into a Cmd-click — but link underlines follow the
HOVER, and pointer correction is anchored to a slot pinned at mousedown, so a
hover that never followed a mousedown is uncorrected at any zoom ≠ 1: the
underline would appear over the wrong cell. A link that underlines the wrong
cell is worse than no link, so the hover is fixed first.

## Decisions

1. **Hover is corrected against the slot under the cursor, per event.** In
   `xterm-pointer.ts`, a `mousemove` with no button held resolves
   `target.closest('.panel__slot')` for THAT event and, at scale ≠ 1, is
   replaced by a corrected clone exactly as a drag's move is; the pin is
   still released, so a stale pin cannot outlive a gesture. A hover outside
   any slot passes untouched, so the HUD's world cursor and every
   document-level move handler see the original.
2. **The scanner is pure and shared** (`shared/link-scan.ts`):
   `findLinks(line)` returns `{ kind: 'url' | 'path', text, start, end }`
   ranges. URLs are `http(s)://…`; paths are absolute, `~/`, `./`, or
   relative with at least one `/`, optionally `:line` or `:line:col`, and a
   trailing `.,;:)` is not part of either. Plain-node tested.
3. **One link provider, registered in `create-terminal.ts`.** It maps
   `findLinks` over the rendered line, underlines on hover, and activates
   ONLY on Cmd-click — a plain click stays a click, because agent TUIs use
   clicks. Activation goes to main through `link:open` with the panel's live
   cwd; the renderer never opens anything (`default-src 'self'`,
   `will-navigate` blocked outright, because a navigation kills the
   window's PTYs).
4. **Main opens, and refuses what it must.** A URL opens through
   `shell.openExternal` only if its protocol is `http:` or `https:`; a path
   is resolved against the panel's cwd (`~` expanded), its `:line:col`
   suffix stripped, and opened through `shell.openPath` only if it exists —
   the answer is a result (`opened` | `refused` with a reason), never a
   throw, and never a window navigation. Opening at a line needs an editor
   integration this milestone does not add; the limit is stated in the
   result's reason for a path with a suffix.
5. **tmux `mouse` stays off**, load-bearing for all of M4a's pointer work.

## Verification

- `verify:viewport` `links.1`: URLs and paths with line suffixes are found
  with exact ranges, trailing punctuation excluded, plain words ignored.
- `verify:panels` `hover.1`: at scale ≠ 1 a REAL mouse move over a link's
  cell reports that link's text through the provider's hover (a corrected
  hover — the uncorrected one lands cells away); `links.1`: a REAL
  Cmd-click on it reaches main's `link:open` with the text and the cwd, a
  plain click does not, and the window did not navigate.
- `verify:ipc` moves by one (`link:open`); `verify:meta` against both
  diagrams.
