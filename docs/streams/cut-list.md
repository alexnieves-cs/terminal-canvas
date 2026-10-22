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
| Accounts, sharing, presence, People | `labs.accounts` | the account menu and avatars, the People segment, `account.sign-in`, `canvas.people`, `share.*` |
| Relay terminals | `labs.relay` | `object.create.relay` |
| Decks | `labs.decks` | `object.create.deck` |
| Sheets | `labs.sheets` | `object.create.sheet` |
| Jira panel | `labs.jira` | `jira.open` |
| Toolbox and Memory panels | `labs.toolbox` | `panel.toolbox`, `panel.memory` |

The list itself is `src/shared/labs.ts`; `verify:palette labs.*` pins it against the
schema and the palette. The switches live on Settings → General and as palette rows.

## What "hide" means

- **Hide what mints, never what acts on what exists.** A deck already on a canvas still
  renders, edits (`deck.edit`) and exports; a Jira panel already there still offers
  Connect Jira…, so the credential rows stay. Hiding them would leave a saved object
  with a dead end, which `labs.3` refuses. This is narrower than the doc's first draft,
  which also hid the deck/sheet verb rows and the Jira credential row.
- **A room opened anyway keeps its way out.** `#/world` still opens World (it is a typed
  address, and `TC_WORLD=1 npm run dev` uses it); while it is up the lens and ⌘⇧W stay,
  so leaving is never the hidden thing.
- **The agent line and the workflow node stay.** `tc plan create-deck` is typed on
  purpose; the four-doors rule is about the verb existing, and it still does.

## Removed

Nothing. A Remove happens only on a row the owner sets to Remove, in its own PR.
