# M181 — the captioned starter canvas

The second and last milestone of Act I. M180 gave the empty canvas one primary action; M181
gives that action somewhere to land: a starter canvas with the person's agent at working size
in the middle and one captioned example of each object kind the app supports today in a named
region beside it, minted through the ordinary paths, idempotent, and never laid over a canvas
the person has edited.

## What a first run sees

On a canvas whose workspace has never carried the starter and holds no panels, the launcher's
primary `Start a conversation` mints the conversation as M180 does AND applies the starter
manifest around it: the chat panel at the world origin at working size, and in a group named
`Examples` to its right a dormant terminal card (never spawned — it wakes on the first click,
M4b's rule), a note (a real Markdown file, prose mode, M27), a workflow panel projecting the
built-in `review this repository` template (M133), and an image panel showing a real picture.
Each example carries a one-sentence caption as a panel-anchored annotation (M93), so the
caption follows its object and dies with it. The camera stays on the agent; the examples sit
inside the working view's right edge at 100 %. Nothing spawns: the chat spawns on its first
send, the terminal on its first click, the workflow is a projection, the note and the image
are files. A starter that launched a fleet of processes would be the opposite of calm.

The primary's hint says what it will do (`opens your canvas with a captioned example of each
kind`) so the extra objects are not a surprise. When no engine has been discovered the starter
is refused by name — the starter begins with an agent, and a canvas that hides the readiness
screen behind five example objects would take the setup sentence away from the one person who
needs it — so the launcher and its readiness rows stay in front.

A returning person sees their canvas intact. The starter record on the workspace (`starter`,
absent on every pre-M181 file, malformed dropped by name, a `keys` list of the manifest keys
ever applied) is what makes the manifest idempotent: a key already applied is never minted
again, whether its object is still there or was closed on purpose. A later act that adds an
object to the manifest (M185's preview, M187's full image lifecycle, M188's notes and frames)
raises `STARTER_VERSION` and adds a key; applying the starter again mints ONLY the new keys.

## The image foundation

The fifteenth kind, `image`, is the minimal foundation Act IV extends: `{ kind: 'image',
image: { path } }` with an absolute path, sessionless like the file panel, equal in selection,
drag, resize, marks, grouping, undo, tiering and export. Main reads the bytes (`image:read`:
PNG, JPEG, GIF or WebP by magic number, under `IMAGE_MAX_BYTES`) and answers a data URL or a
named arm — `missing`, `too-large`, `not-an-image` — and the panel shows the picture at its
own aspect ratio inside the body, or the arm's sentence with the path on the frame's `title`.
No drop, paste or screenshot door lands here; M187 owns ingestion and asset identity, and its
record shape will add to this one rather than replace it. The starter's picture is a small
bundled PNG main writes beside the note under `userData/starter/`, once.

## Doors

Canvas: the launcher's primary on a first run, and a `Starter canvas…` line among the
launcher's prompt lines (disabled by name once every key is applied). Palette: `Open the
starter canvas`. Agent: the `starter` verb through M180's plan door. Workflow: the same
recorded omission as M180's verbs, due M189, in `V9_DOORS`.

## What is not here

No modal tour, no seeded prompt sent to the agent, no preview object (a browser panel needs an
http(s) page and the starter has no project to preview; M185 adds it to the manifest with its
discovery), no sticky note or frame (M188), no image drop or paste (M187). The two-minute
launch-to-first-answer trial stays a hand check.
