# The cut list (E1–E2, M495–M496)

The owner's decision, 2026-10-22: **keep 22 surfaces, hide 7, remove none** — then
**World kept on**, with a switch to hide it, once hiding it was measured to move 35 of
the goldens the owner had just approved (the lens sits on every resting canvas). So six
are hidden and World is shown by default. The
reasoning for each row is in the cut-list doc posted on the Stream E thread; this file
records what was decided and what "hide" means in the code.

## The switches (one setting each; all off by default but World)

| Surface | Setting | Doors that hide |
|---|---|---|
| World 3D view (**on** by default) | `labs.world` | the 2D \| World lens, ⌘⇧W, Sessions' Show in World, the `world.view` row |
| Accounts, sharing, presence, People | `labs.accounts` | the account menu and avatars (until someone is signed in), the People segment, `account.sign-in`, `canvas.people`, `share.*` |
| Relay terminals | `labs.relay` | `object.create.relay` |
| Decks | `labs.decks` | `object.create.deck` |
| Toolbox and Memory panels | `labs.toolbox` | `panel.toolbox`, `panel.memory` |

The list itself is `src/shared/labs.ts`; `verify:palette labs.*` pins it against the
schema and the palette. The switches live on Settings → General and as palette rows.

## What "hide" means

- **Hide what mints, never what acts on what exists.** A deck already on a canvas still
  renders, edits (`deck.edit`) and exports. Hiding them would leave a saved object
  with a dead end, which `labs.3` refuses. This is narrower than the doc's first draft,
  which also hid the deck/sheet verb rows and the Jira credential row.
- **A room opened anyway keeps its way out.** `#/world` still opens World (it is a typed
  address, and `TC_WORLD=1 npm run dev` uses it); while it is up the lens and ⌘⇧W stay,
  so leaving is never the hidden thing.
- **The agent line and the workflow node stay.** `tc plan create-deck` is typed on
  purpose; the four-doors rule is about the verb existing, and it still does.

## Removed

Alex chose to delete these for good on 2026-11-11. Each went in its own commit.

- **Jira panel (M683).** The panel, `main/jira-client.ts`, the `jira:*` channels, the
  bridge member, the credential service, `jira.open`, `labs.jira` and `verify:jira`. A saved
  `jira` panel falls to the layout parser's unrecognised-kind drop. `WorkItemSource 'jira'`
  stays so saved board items still read.
- **Sheets (M684).** The sheet view, its session, formula engine and xlsx reader, New Sheet,
  the `sheet-edit` / `sheet-review` verbs, `labs.sheets`, `verify:sheet` and the `xlsx`
  dependency (served from cdn.sheetjs.com, a second host `npm ci` had to reach). A `.csv`
  opens as a plain file panel and a saved sheet view is dropped quietly.
- **Relay terminals** are still listed above. They share the multiplayer server, the shared
  canvas ops and presence, so their removal is its own, larger change.
