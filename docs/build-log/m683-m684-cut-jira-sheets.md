# M683–M684: Jira and Sheets removed

Alex chose to delete the hidden features for good (Sheets, Jira and Relay) on 2026-11-11.
This log covers the two that came out cleanly. Relay shares the multiplayer server, the
shared canvas ops and presence, so it is a separate change.

## M683, the Jira panel

Gone: `main/jira-client.ts`, `renderer/jira/`, the four `jira:*` channels and the bridge's
`jira` member, the `jira` credential service, `jira.open`, `openJira` in the verb table,
`labs.jira`, the Jira glyph and kind word, and `verify:jira`.

Kept on purpose, because saved data still names them: `WorkItemSource 'jira'` (a board item
added from Jira before this still reads), `providerState('jira')`, the offline types, and the
paste parser's Jira URL arm. A saved `jira` panel falls to the layout parser's
unrecognised-kind drop.

The Electron checks that leaned on a Jira panel now use a GitHub panel, which has the same
shape (a work-item panel with a Connect verb): `frame.1`, `context.3`, the overview words and
tones. `jira-comment.1` went with the panel; `verify:meta panels-split.2` gained a `RETIRED`
set for ids whose feature was deleted on purpose, so a deletion is not read as a check lost
in the panels split.

## M684, Sheets

Gone: `shared/sheet*.ts`, `shared/csv.ts`, `renderer/file/SheetNode.tsx` and
`sheet-controllers.ts`, New Sheet, the `sheet-edit` and `sheet-review` verbs, `labs.sheets`,
the sheet styles, `verify:sheet`, and the `xlsx` dependency. That package came from
cdn.sheetjs.com rather than the npm registry, so `npm ci` no longer needs a second host
(the cloud containers could not reach it).

A `.csv`, `.tsv` or `.xlsx` now opens as a plain file panel. A saved `sheet` view is dropped
without a warning, since nothing in it was malformed. `verify:draft` keeps the generic draft
checks that decks still ride and drops the sheet adapter's.

## Goldens

No scene showed a sheet. The integrations scene showed a rejected Jira credential and the
main fixture held a Jira panel, so `integrations` and the scenes over that fixture change.
They are re-taken only after the gallery has been looked at.
