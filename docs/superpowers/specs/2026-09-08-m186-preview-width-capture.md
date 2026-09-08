# M186 — device widths and a real screenshot

The second milestone of Act III. M185 found the project and put it on the canvas; M186 gives
the preview the two things a person actually does with one: look at it narrow, and take a
picture of it.

## Device widths

The preview's chrome carries a compact width control: `Full`, `Phone` (390), `Tablet` (834),
`Laptop` (1280) — `shared/preview-widths.ts`, a closed table with one name and one number
each. The width resizes the GUEST inside the body, never the panel: `.pf__body` is never
transformed (the M144 rule), so the guest gets `width: <n>px; margin: 0 auto` and the body
keeps its own box. The chosen width rides the panel record (`preview.width?: number`, absent
means full) with the record rules. A width wider than the body scrolls the body, never the
canvas.

## The screenshot

`preview:capture` in main: the guest resolved by the panel id the node registered (M103's
own map), checked to be a webview, captured with `webContents.capturePage()`, and written as
a PNG under `userData/screenshots/<panel>-<stamp>.png`, pruned to `SCREENSHOTS_KEEP`. It
answers the path and the size, or a NAMED arm — `no-guest` (the pane has no live page),
`not-a-preview`, `too-large`. The renderer opens the file as an M181 IMAGE PANEL beside the
preview, so the picture is a canvas object like any other, with its provenance in its title
(`preview · <host>`). No second page-script reader: `browser-read.ts` stays the only
`executeJavaScript` caller (`verify:verbs gate.3`).

## Doors

Canvas: the width control and a `Capture` verb on the preview's chrome. Palette: `Set preview
width…`, `Capture the preview`. Agent: `preview-width <panel> <name>` and `preview-capture
<panel>` through M180's door — the capture an agent can ask for is the same file, and its
image panel is the same object. Workflow: the M189 omission.

## Not here

Video, scrolling capture, or a capture of a remote page's cross-origin frames (Electron's
own limits). The image's asset identity is M187's.
