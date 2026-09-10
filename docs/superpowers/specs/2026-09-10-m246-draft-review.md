# M246 — per-cell draft review (a generic item draft)

## Why
The review gate (`review:diff`/`commit`/`discard`) works per FILE against a git baseline, and an
agent's write lands on disk before anyone looks. For a sheet that is the wrong grain: a person
wants to keep B2 and refuse C7. M246 makes an agent's sheet edit a DRAFT over the grid — changed
cells highlighted, old → new, kept or discarded per cell, per range, or all — and the file on
disk does not change until a person keeps something.

## The interface is generic (task 6 reuses it for slides)
`src/shared/draft-review.ts` knows nothing about cells:

```ts
interface DraftItem<V> { id: string; old: V; new: V }
interface Draft<V> { baseHash: string; by?: string; at: number; items: DraftItem<V>[] }
diffItems(before: Map<id,V>, after: Map<id,V>): DraftItem<V>[]   // structural, by id
stage(draft | undefined, item, baseHash, by, at): Draft | undefined // re-staging an id replaces it; new === old removes it
keep(draft, ids) / discard(draft, ids) → { apply: DraftItem[]; remaining: Draft | undefined }
draftState(draft, diskHash, outcome) → 'none' | 'pending' | 'conflict' | 'applied'
```

A sheet supplies ids (`B2`) and "apply" (set those cells). A slide deck will supply slide ids
and its own apply. The diff is structural — by id — never by text line.

## Where the draft lives, and restart (decided)
**In `SheetView.draft`, persisted with the layout** — which already lives in userData and is
already saved on every change. No sidecar file beside the user's CSV (a stray `data.csv.draft`
in their repo is litter an agent will read), and no new channel.

On restart a sheet is in exactly one of three states, plus the conflict a person must see:
- **no draft** — the key is absent (every sheet before M246, and one whose last draft ended
  with no record);
- **draft pending** — `draft` present and its `baseHash` equals the disk's hash;
- **applied** — every item resolved: `draft` is removed and `draftOutcome: { at, kept,
  discarded }` remains, so the header can say what happened last rather than nothing;
- **conflict** (a pending draft whose `baseHash` no longer matches the disk) — reported BY NAME:
  "data.csv changed on disk after f3's draft — B2 and C4 no longer read what the draft replaced".
  Keep is refused. **Rebase** re-reads the disk, adopts its hash, and drops (naming them) the
  items whose cell no longer holds their `old`; items whose cell still does stay pending.

`parseSheetView` applies absent/malformed to `draft` and `draftOutcome` (item cap 10,000; ids
must be A1 refs; values bounded strings). **A draft never leaves**: `portable.ts` strips it with
the rest of the view.

## What produces a draft
`sheet-edit` arriving through the **agent door** (`tc plan`, whose `caller.panelId` names the
agent) STAGES instead of writing, with `by` = that panel. The palette runner, a workflow action
node and the grid itself are a person's gestures and write directly. Because staging never
touches the file, `sheet-edit` leaves `TEAMMATE_REFUSED_VERBS`: a teammate may PROPOSE.

`sheet-review <panel> keep|discard <range|all>` resolves items. **Keep through the agent door is
refused by name** — "a draft is kept by a person" — because an agent keeping its own draft is the
approval this milestone exists to hand to a person. Discard through the agent door is allowed
(withdrawing a proposal changes no file).

## Writes
- **Keep** applies ONLY the kept items onto the current disk grid, in one compare-and-swap write
  through the session (so every rule M245 made — re-read first, refuse on stale — holds), then
  advances `baseHash` to the bytes just written; the remaining items stay valid because their
  cells were not touched.
- **Discard** writes nothing. The file is byte-identical.

## UI
Draft cells carry `is-draft` and show the NEW value; the formula bar shows `old → new` for the
selected cell. A contextual strip names the proposer and offers Keep/Discard for the selection
and Keep all/Discard all. The header's count — "3 changes" — appears **only when there are
some** (contextual layer; the rest layer never states a zero). `applied` shows in the strip as
the last outcome until the next draft.

## Checks (`verify:sheet`, `draft.*`)
Generic functions on non-cell items; a partial keep writes only the kept cells (compared cell by
cell); discard leaves the file byte-identical (Buffer against Buffer); a change underneath is a
`conflict` naming the file and the cells, and keep is refused; rebase keeps the still-valid
items; the view round-trips through `parseSheetView` and a malformed draft is dropped; the
export strips it; the agent door stages and cannot keep.
