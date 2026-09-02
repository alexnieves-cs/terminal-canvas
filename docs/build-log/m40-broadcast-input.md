# M40 — Broadcast input: the exits

**Status:** finished 2026-09-01.
**Branch:** `m40-broadcast-input`. **Spec:** `docs/superpowers/specs/2026-09-01-m40-broadcast-input-design.md`.

One line: M31's broadcast mode already met the requirement; M40 is the audit that found it
had one exit and no chord, and added both.

## What landed

- `Cmd+Shift+I` arms and disarms broadcast (`useBroadcastChord.ts`). Not `Cmd+Shift+B`:
  `useShellChrome` matches `KeyB` without testing Shift.
- A Stop control on the banner (`.link-banner__stop`, `shellControl`, the one pointer-reachable
  element of a `pointer-events: none` banner), and the chord hint beside it.
- Both run the palette row's `toggleBroadcastInput` through `paletteActionsRef`, so the guard
  lives in one place.
- `verify:panels` `broadcast.1` (palette-armed, real keystrokes, both M39 logs carry the sentinel,
  real click on Stop, next sentinel reaches one) and `broadcast.2` (the chord). Watched red:
  `stop=null`, `two={a:true,b:true}`.
- README bullet + Keyboard row; load-bearing entry.
- Found by `broadcast.2`: the Stop press bubbled to the canvas host's background handler and
  cleared the selection (the banner is the one shell control inside the host). Fixed with
  `stopPropagation` on its mousedown; recorded in load-bearing.
- M39 verifier notes folded in here: `scrollback.6` (the no-newline fallback was untested),
  `redact.4` (a bare JWT), a `--recorded` card-line style, and the real `scrollback.persist`
  gate in `main/index.ts` named on the manual-only list. The verifier also noted the worktree
  branch-collision fix rode M39's merge; it was M37's defect found by M39's checks, and it is
  on main.

## Decided against

- A first-time confirmation dialog: the mode is visibly armed and reversible with one key.
- A per-panel "listening" badge: the banner's count plus the selection highlight already say which.
