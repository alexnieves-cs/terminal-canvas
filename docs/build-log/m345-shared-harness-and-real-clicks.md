# M345 — a shared workspace in the harnesses, and what the first real click through the account menu found

**Verdict: shipped, and it found three real defects in the primitives layer, all fixed.**
This milestone closes the M336–M338 owed items "a Members-view golden" and "an Electron
DOM check that clicks through the menu and dialog". The first real click through the
account menu showed that **no row of a force-mounted Radix menu could be selected with a
real mouse**. The share dialog it should have opened was, once opened, **unclickable**,
kept **no focus**, and **ignored Escape**. All three trace to the primitives layer
(M276); all three are fixed and pinned. As a side effect, `reach.1`, red since M277, now
passes. Built 2026-09-26 on local `main` on top of M344.

## What the check found

**1. A real click on a menu row selected nothing** (`primitives/MotionSurface.tsx`).
`MenuContent` renders `<Radix.Content asChild><MotionSurface>…`, so Radix's Slot hands
its props to `MotionSurface`: its **ref**, handlers, aria and data attributes.
`MotionSurface` took only its four named props and dropped everything else. Radix's
DismissableLayer judges "inside" by the node that ref points at, and with no node, every
`pointerdown` inside a force-mounted menu read as OUTSIDE it. The menu hid on the press,
and the release landed on the canvas. A probe in the shot harness recorded it exactly:
`pointerdown:shell__account-share → pointerup:canvas → click:shell`. Every existing
check selected rows with a dispatched `.click()`, which never presses, so none of them
could see it.

This affected every force-mounted menu adopter from M276 on: the View menu, the account
menu, and WorkNode's assign and swarm menus. `MotionSurface` now merges the slot's props
the way Radix's own Slot does: the child's props win, className joins, style merges, and
a handler both define runs the child's first.

**2. The fix's first form froze the renderer** (the same file). Composing the refs in a
`useMemo` handed React a new ref callback every render, because Radix composes a fresh one
each render. React then detached (null) and re-attached the node on every commit, and
behind Radix's `setContent(node)` that is a render loop. `verify:panels:product` hung in
`work.action.1`'s reload (`did-finish-load` never came), and the hang survived a 1.6x
watchdog, which is what separated it from the load flakes of the same hour. The element
now gets ONE stable callback that writes the node to whatever refs are current. A
changed ref is handed the existing node in the layout pass, and because it is the same
node, the state behind it bails out.

**3. The share dialog opened unclickable, unfocused, and deaf to Escape**
(`MotionSurface.tsx`, `primitives/Dialog.tsx`).
- **Unclickable.** A modal Radix layer turns the BODY's pointer events off and its
  content's back on (`pointer-events: auto`) through the style the slot hands over.
  `MotionSurface` wrote `pointerEvents: undefined` over it while open. The probe read
  `body none, card none`. The layer's own value now stands while open.
- **Unfocused, and deaf to Escape.** `DialogContent` was force-mounted, so its focus scope
  and dismiss layer had lived since app start. The scope never "mounted" on open, and
  focus stayed on `<body>`. A closed force-mounted menu registered later outranked the
  dialog as Radix's highest layer and swallowed Escape. The `Dialog` wrapper already keeps
  Radix open until Motion's exit completes (its `mounted` state), so force-mounting was
  never needed for a dialog. It is dropped. `ShareDialog` is the only adopter.

**Tried and taken back:** an `onCloseAutoFocus` handoff on the account menu. It was built
on the theory that the menu's focus return dismissed the dialog. The mode-transition
probe (`[]`: the dialog never opened) disproved that theory, and the check passes without
the handoff.

## What landed for the harnesses

- **The panels harness has account and presence doors** (`panels-harness.cjs`:
  `harnessAccount`, `harnessPresence`). They are OFF by default. A part turns them on with
  `harnessAccount.turnOn(wc)`, which sends `auth:changed`, the shot harness's rule. Every
  earlier check's top bar stays as it was written.
- **`verify:panels:product` `account.click.1` and `share.click.1`**, the last checks in
  the part. They use real input events (`sendInputEvent`, the pointer arriving before it
  presses), hit-test what is PAINTED, and send Escape as a real key. The account opens its
  menu (the signed-in account, both sharing doors, Sign out). Its *Share this workspace…*
  opens the dialog painted over the canvas with focus inside, naming the workspace and
  offering the organization. The menu is gone, and Escape closes the dialog.
- **Two shot scenes** (`shot.cjs`), after `relay`. A shared workspace is turned on the
  same way (`shotShared`, off until then):
  - `shared-canvas`: the roster strip names sam in sam's colour, sam's cursor has a tag,
    and two of sam's panels stand as placeholders beside the owner's relay terminal. One
    is a relay with a session (**Attach**, M343), and the other is a terminal.
  - `share-members`: the share dialog's Members view for the owner: ada (you) as owner, sam
    as editor, lin as viewer, and octocat, in the organization but not the share.

## Checks

- `verify:panels:product` 112/120. `account.click.1` and `share.click.1` are new and pass.
  `reach.1` turned green. The eight remaining reds are the baseline: `starter.1` and the
  seven `workflow.*`.

## Gate

`npm run verify` (2026-09-26, 715.6s): 59/61. The two red suites carry only baseline reds:
- `panels:agents` 80/82: `template.1`, `detail.1`.
- `panels:product` 112/120: `starter.1` and the seven `workflow.*`. `reach.1` passes, the
  baseline is one smaller, and `account.click.1` and `share.click.1` pass.

Every other Electron part (core, shell, kinds, orchestrate) passes with the
`MotionSurface` change. While iterating, the product part timed out four times. Two were
the load flake (load average about 13). Two came from the ref-composition render loop
described above, which a 1.6x watchdog did not cure; that is how the two were told apart.
`verify:visual`: 70/71 after the goldens (starter red, on purpose).

## Goldens

Three goldens were written (`UPDATE_GOLDENS=1`), each after a fresh-context critic's
sentence. `share-dialog` was forced by deleting its golden: its one change, a focus ring,
is under budget but deliberate.

- **shared-canvas** (new, third composition): "Matches intent: the roster strip shows sam as a magenta 'S' avatar. Below ada's own selected relay terminal ('relay · shell', 'You are in control', End session, live ada@relay output) are sam's two placeholders. Each has a magenta-tinted, dashed-bordered header with a magenta dot and 'sam' at the right. The relay one reads 'sam's terminal on the team relay · shell.' with an Attach button, and the terminal one ('tests — api') reads 'Terminal on sam's machine — nothing runs here.' sam's magenta pointer sits inside it with a 'sam' name tag. Nothing is clipped or overlapping, and sam's colour is the same on the avatar, dots, names, borders, cursor and tag."
  - The critic's notes, recorded and not acted on: the roster tile shows the initial, not the name, which is RosterStrip's design since M331; the tile's blue status dot is the connection mark; the placeholder shares the title `relay · shell` with ada's own, told apart by the `sam` tag and the dashed frame.
  - The first composition was judged a DEFECT: sam's panels ran off the right edge, the cursor was off-screen, and "sam's colour is not consistent". The fixture had given sam an arbitrary hex, while every real peer's colour is `colorOf(userId)`, which the placeholders read. The scene now takes `colorOf` from the harness entry, puts sam's panels beneath the relay, and pans up with a real wheel.
- **share-members** (new): "Matches intent: one opaque card (rgb 246,247,250) sits over a uniformly dimmed canvas, top bar and sidebar. It shows the title '“api” is shared', the sentence 'You are owner: arranges everything and decides who is in.', and a four-row Members list: 'ada-lovelace (you)' with a plain grey 'Owner' label and no picker, 'sam' with an Editor picker, 'lin' with a Viewer picker, 'octocat' with a Not in picker, and a Done button. Nothing is clipped, overlapping or see-through, and the pickers are right-aligned in one column." The critic noted that focus lands on Done (see below) and that the copy 'You are owner:' has no article.
- **share-dialog** (forced): "Matches intent, and otherwise reads the same as the golden: 'Share “api”', the what-crosses sentence ('…its place, its kind, a scrubbed title and who owns it. No command, folder or transcript leaves this Mac.'), the Organization select on Acme, the owner/members line, the teal Share button and Done. The only visible change is a teal focus ring around Done." That ring is this milestone's fix made visible: the dialog now takes focus when it opens. It lands on Done because the organization select is still loading when the focus scope mounts.
- **account-menu** and **relay**, unchanged: "looks the same as the golden … pixel differences are text anti-aliasing only".

**Owed from the round:** the minimap draws no placeholders; initial focus should land on
the dialog's primary control rather than Done; "You are owner" wants its article.

## Owed

- **An Electron check with a shared NOTE bound** (M339's owed item: Source and Rich bound,
  Reload reverting). It needs a real canvas-sync and doc behind the harness's presence
  doors, not a pushed view. Unscheduled.
- **Other force-mounted layers.** Menus stay force-mounted on purpose: their rows are
  addressed while closed (`.shell__merge`). The trap is closed for the dialog, but a
  closed menu still registers a dismiss layer, so any FUTURE force-mounted modal can be
  outranked the same way. The comment in `Dialog.tsx` says so.

Next: M346 (Arc 1: the collab server keeps its rooms — Postgres persistence with
snapshots, `server/collab/persistence.ts`).
