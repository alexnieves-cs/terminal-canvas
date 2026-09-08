# Getting started with Terminal Canvas

A calm dark window with an infinite canvas in it. You arrange agents, terminals, files,
previews, workflows, pictures and notes on that canvas, and everything you put there stays where
you left it.

This guide describes what the app actually does today. Where something is a hand step, or is not
built, it says so.

## Install it

This build is **unsigned**, so macOS will refuse to open it on a double-click.

1. Build the app: `npm install`, then `npm run package`. The `.app` and the `.dmg` land in
   `release/`.
2. Open the `.dmg` and drag **Terminal Canvas** to Applications.
3. **Right-click the app and choose Open**, then confirm. (Double-clicking shows
   "cannot be opened because the developer cannot be verified"; the right-click Open is the
   Gatekeeper step that lets an unsigned app through, once.)

To run it from source instead: `npm run dev`.

## Your first conversation

The empty canvas shows one filled button: **Start a conversation**. It uses whichever engine the
app found on your machine.

- The app asks your login shell which CLIs are installed and reports three states per engine —
  installed, missing, or *unanswered* (a shell that timed out is not the same as a CLI that is
  not there). If one is missing, the launcher names the setup page and offers **Check again**.
- Installed never means signed in. The first message you send is what finds out; if the CLI
  needs a login it will say so in the panel, in its own words.

Type into the composer and press Enter. The panel is the conversation: your turns as bubbles,
the agent's as prose, and each tool call as one row you can expand.

## The starter canvas

**Open the starter canvas** (⌘K, then type "starter") lays out one captioned example of each kind
of object next to your agent: a terminal, a note, a workflow, a picture and a preview. Nothing in
it starts a process — the terminal is a card you click to start. Close anything you do not want;
the starter never puts back what you closed.

## Moving around

- **Pan** with a two-finger scroll or by dragging the background. **Zoom** by pinching, or ⌘= and
  ⌘−. **⌘0** resets, and **Zoom to fit** frames everything.
- Panels **drag** by their header and **resize** from their edges. Select several with a marquee.
- As you zoom out, panels become cards and then blocks — the far view keeps each object's
  identity and an honest summary rather than shrinking its text into noise.

## The palette and the verb line

**⌘K** opens the palette: every verb this app has, filtered as you type, with a reason beside
anything that cannot run right now (a row is never hidden — a row that disappears is
indistinguishable from a feature that was never built).

**Run a verb…** is a line you type: `focus n3`, `note-add sticky`, `preview-width phone`,
`export-canvas`. The same lines work from a terminal:

```sh
tc plan "note-add sticky"
```

A destructive verb asks first, and it asks in the app, not in the terminal.

## Workflows

A workflow is a shape of work you can run more than once. Open one and you get a library, a
diagram and the inspector:

- Drag a block from the library onto the diagram, or add one from the palette.
- Drag from a block's port to another block to connect them; a connection that would make a loop
  is refused while you are still dragging, and nothing is committed.
- The inspector edits the selected block's own fields.
- **Run** starts the shape you can see. **Save** writes it back; if someone else saved that
  workflow underneath you, the save is refused and your draft is kept.
- **Test this node** runs one block on its own and tells you what it answered, how long it took,
  and — if it failed — why. It does not start the blocks around it.

Two blocks do work by themselves: an **Action** block runs one verb line, and a **Fetch** block
does an HTTP GET. A Fetch block will not POST: writes go through `tc api`, where an approval is
asked on the teammate's own chat first.

## The preview

Select the terminal your project runs in and choose **Preview: open the project**. The app asks
that panel's own processes what they are listening on and reads its `package.json` — it starts
nothing. If nothing is listening, it offers to start the project's dev script in a terminal panel
you can see and stop.

In the preview pane: four named widths (Phone, Tablet, Laptop, Full width), **Capture** (a real
picture of the page, placed on the canvas), and a reload that happens by itself when a file
changes — only for pages served from your own machine.

## Pictures and notes

- **Drop** a picture on the canvas, or **paste** one when nothing else has the keyboard. The app
  keeps a copy of its own, named by the picture's content, so moving the original does not break
  it. If the bytes go missing, the object stays with a **Replace** button.
- **Add a sticky note**, **Add free text** or **Add a named region**. A region is a boundary with
  a name; clicking inside it reaches whatever is in there, not the region.

## Sharing a canvas

**Export this canvas…** writes one file. It says what travelled, how many secrets it scrubbed,
and what it left out and why — a watcher would arm itself on the other machine, a review names a
repository that is not there, and a picture's pixels are only included when you ask for them
(`export-canvas <path> with-pictures`), because nothing can scrub a picture for you.

**Import a canvas…** makes a **new** workspace, gives everything new identifiers, and starts
nothing.

## Telling us something is wrong

**Prepare feedback…** opens a draft in your own browser with the version, your platform, which
engines were found and what is open on the canvas — scrubbed, and it tells you how much was
scrubbed. This app does not submit it. You read it, change it, and send it yourself.

## What is still yours to do

- Sign in to your agent CLI in a terminal the first time; the app never asks for a password.
- Keep an eye on cost: the inspector's Machine section shows tokens and dollars per panel, and
  `agents.budgetUsd` stops work at a ceiling you set.
- Back up your own work. Export writes a file; the app keeps your layout under its own
  application-support directory and does not sync anywhere.
