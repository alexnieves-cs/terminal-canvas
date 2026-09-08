# M187 — images arrive: drop, paste, and an app-owned asset

The first milestone of Act IV. M181 made the image a kind with a path. M187 gives it the
three ways a picture actually arrives — a Finder drop, a paste, an agent's screenshot — and
the asset identity the plan asks for: bytes the app owns, not a path into somebody's Downloads
folder that is gone next week.

## The asset

`main/assets.ts`: `saveAsset(bytes, mediaType)` writes `userData/assets/<sha256>.<ext>` and
answers `{ id, path, bytes }` — the id IS the hash, so the same picture dropped twice is one
file and an undo can never point at bytes another panel still shows. `readAsset(id)` is
M181's `readImage` over that path. A ring: `ASSETS_MAX_BYTES` (256 MB) pruned oldest-first by
mtime, and a prune never removes an asset any workspace's records still name (the store is
asked). The image record gains `image.assetId?: string` beside `path`; absent means M181's
plain path (a file the person points at, still supported), present means the app owns the
bytes and `path` is its cached location.

## The three doors

A Finder DROP of an image file onto the canvas (the M59 drop door, which already takes a
path) mints an image panel at the drop point through `saveAsset` — a copy, so moving the
original leaves the canvas whole. A PASTE with an image on the clipboard mints one at the
camera's centre (M145's `clipboard-file` already writes the PNG; this routes it to the asset
store instead of `attachments`). An agent's screenshot (M186's `preview:capture`) writes
through the same door, which is why its picture is an ordinary image panel.

A dropped file that is not an image is refused by name, as `attachments.ts` already refuses;
a file over `IMAGE_MAX_BYTES` is refused with its size.

## Replace, and a missing asset

The image panel's chrome gains `Replace…` (the OS file dialog through `file:open`'s door) and
`Reveal` (M37's `worktree:reveal` shape). A record whose asset is gone keeps the panel and
says so with `Replace…` beside it — M181's `missing` arm, now with a verb.

## Doors

Canvas: the drop, the paste, `Replace…`. Palette: `Add an image…`. Agent: `image <path>`
through M180's door (the path must be absolute and inside a place, M100's gate). Workflow:
the M189 omission.

## Not here

Sticky notes, text and frames (M188). Export of the bytes (M193's portable file, where the
pixels are an explicit human choice).
