# M91 — Decisions and the small things: build log

Branch `m91-decisions`, 2026-09-05. Scope: `docs/superpowers/specs/2026-09-03-v2-scope-decision.md`
row M91 (no separate spec: every item here is a decision the scope document already took, and
this log is where each is recorded with what was measured).

## The web panel, declined — with the spike measured

A throwaway Electron script (kept in the session scratchpad, not the repo: it is a
measurement, not a check) loaded the built renderer and tried both honest shapes:

| Shape | What happened |
|---|---|
| `<iframe src="https://example.com/">` appended inside `.world` | `securitypolicyviolation` fired with `effectiveDirective: frame-src`, `blockedURI: https://example.com/`; the frame "loaded" its error document. The shipped CSP (`default-src 'self'`) refuses it, as §5 said, and relaxing it is out of scope for this run. |
| A `WebContentsView` at window `{100,100,400×300}`, then the world transformed by `translate(200px,150px) scale(0.5)` | The view's bounds were unchanged: it does not pan, zoom, clip or z-order with the world. Making it follow would be a per-frame reposition against every gesture the canvas has. |

The decision in §5 stands, with numbers under it. Both backlog entries (#9 tier 3, #14 tier
3) are retired; `link:open` is the door for a page.

## The rail widened

`--shell-nav-w` 260px → 300px, and the narrow-shell drawer that stands in for the rail
matches it. `verify:styles rail-w.1` pins both. The three build logs that recorded truncated
titles (M66, M67, M68) are answered by a frame decision rather than a per-row ellipsis rule.

## The identity line's repository

M86 did it (`inspector-fields.ts`'s repository suffix on the branch line, from `git:status`).
No change here; recorded so the row is not read as undone.

## The far view's hairlines at 22% in dark

The frame's 1px border lives in world space, so at 22% it paints 0.22 device pixels and the
dark theme's `--line-strong` on the dark ground vanishes with it (M67 deferred this to M69;
M69 answered the ring, not the hairline). The fix is geometric, not chromatic: at the
`summary` and `block` details the border is thickened in world units so it stays about one
device pixel on screen. `verify:styles far-line.1` pins it.

## The launcher's verbs as invitations

A preset row read as its preset's name (`Claude`) where every other row read as a verb
(`New panel…`, `Open a file…`). It reads `Start Claude…` now, with the directory in the
hint as before. The second backend's door (`Chat with codex…`) joins the launcher beside
claude's, disabled by name when codex is absent — M90 put it in the sheet and not here.

## The load-bearing reconciliation

The archived M24-era draft (`origin/archive/m24-github-work-panel:docs/load-bearing-details.md`,
327 bold-led paragraphs) was diffed against `docs/load-bearing.md` (314) by paragraph token
similarity. Three random draft-only entries were read against their nearest paragraph on main
to calibrate: all three were genuinely absent, not reworded. Result: 192 entries absent from
main whose every backticked symbol still resolves in `src/`, `scripts/` or `build/`; 27
whose named symbols are gone. The 192 are folded into a NEW file,
`docs/load-bearing-recovered.md`, verbatim, under a preface that says exactly what admitted
them (symbol presence, not re-verification) — an entry that is wrong belongs deleted, and a
reader is told to grep before relying on one. The 27 are listed at its end by lead and
missing symbol. The main file's head links to it. This is the "cheap diff, folded where
still true, the rest listed" the scope row asked for, with "still true" scoped honestly.

## Findings (critic on the rail and the launcher)

Eight findings on three PNGs; two accepted, six declined.

**Accepted.** (1) The codex door's reason ended in an ellipsis mid-sentence — a disabled
row that half-names its fix. A disabled verb's hint now wraps. (2) `Start Claude…` beside
`Chat with claude…` spelled one agent two ways in one list; the chat verbs are `Chat with
Claude…` / `Chat with Codex…` now (the chrome's mono `codex`/`claude` is the binary's name,
which stays lowercase).

**Declined.** (3, 5) The tooltip, the subagent callout and the attention popover floating
over unrelated panels are the fixture's composition: the scene stages a hover and an open
popover at once to show both, and each is anchored in the live app (the popover to the bell,
the tooltip to its row). (4) The GitHub list's clipped left edge is a seeded panel lying
under another seeded panel, not an inset; the fixture is scenery. (6) The fainter frames at
22% are asleep and sessionless kinds at their tone's dim line — M67's deliberate dimming,
now at the same thickness as every other frame (`far-line.1`). (7) The cluster's position is
the fixture's camera. (8) `⌘N` and `⌘⇧N` are two verbs (the default preset now; the sheet),
and each line names its own.

