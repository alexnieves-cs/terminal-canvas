# M94 — The second dead-end audit: build log

Branch `m94-audit`, 2026-09-05. Scope: the scope document's row M94 — every surface this run
added walked; every row finished or disabled by name; keyboard reach for every new control
checked by a real `sendInputEvent` where a click check exists; the manual-only list re-read
entire; `docs/dead-end-audit.md` rewritten.

## The walk

By source and by the suites, as M59's was. Every `REASON_*` constant in `commands.ts` was
already named in the audit (`verify:meta audit.1` pins that, and it stayed green through the
run), so the walk's work was the surfaces whose refusals are not palette constants: the chat
composer's arms, the codex reasons, the sheet's disabled options, the pane's toggles, the
History rows, the annotate strip, the broker's audit rows. Each is now an entry in the
audit's "surfaces this run added" section rather than a line appended at the end.

**Found.** One thing, and it was the check's, not the app's: the first keyboard walk started
at `rename` and read the M92 toggles as unreachable, because they sit BEFORE rename in the
bar. A walk from the bar's first enabled action visits every enabled action in DOM order;
the check asserts the order and skips disabled actions by name, which is what Tab does.

## Keyboard reach

`verify:panels reach.1` is the new kind of check the scope row asked for: a REAL Tab from
the context pane's first enabled action and from the launcher's first verb, asserting every
enabled control is visited in order. The launcher's seventeen verbs (the harness's presets
included) and the pane's nine actions all sit in the tab order. What it does not walk is
recorded in the audit.

## The manual-only list

Re-read entire. Nothing struck — the run added surfaces beside the list's entries, not
checks beneath them. Five entries added (a real codex turn, the reset dialog's snapshot
line, the ring's real minute, annotate mode on a trackpad, `Cmd+Z` over the note editor),
each saying whether it was seen once by hand or not at all.

## Harness lesson

A watchdog fired once mid-run with no check red; a stray Electron from the previous run was
holding the harness's socket. `pkill -f Electron` before the rerun cleared it — the memory's
own rule, missed once more.
