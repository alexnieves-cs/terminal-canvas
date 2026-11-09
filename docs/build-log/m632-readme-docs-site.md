# M632: the README shows the real app, and the user guide is a site

Tier 1 of the 2026-11-02 plan (items 1.1, 1.3, 1.4 and the comparison page from 5.4).

- **Real pictures.** The README, the landing page and the guide show
  `verify/visual/goldens/<scene>.png` directly: the captures the Mac runner
  painted and a person approved, the same files `verify:visual` compares
  against. The seven palette-reduced mockups in `docs/assets/screens/` are
  deleted (the originals stay in `docs/redesign/mockups/`). No copy is kept, so
  a re-taken golden changes the README with it; `verify:meta` `readme.2` goes
  red if a scene the README names is renamed or removed.
- **A short README.** Hero, why, what it does, three uses, a look around,
  install, six shortcuts, links. `readme.1` holds the ceiling.
- **Where the rest went, unchanged apart from relative links:**
  `docs/features.md` (What it does, What it looks like, What it does not do,
  Accessibility), `docs/architecture.md` (Architecture, with the IPC diagram;
  check 14 reads it there), `docs/development.md` (Stack, Prerequisites,
  Getting started, Verification), `docs/milestones.md` (the table;
  `milestones.1` reads it there and refuses a stray row in the README).
- **The user guide.** `docs/guide/*.md`, readable on github.com and rendered
  by `scripts/build-site.cjs` (with the app's own Markdown grammar, `src/shared/markdown.ts`; `verify:deck` `deck.deps.1` refuses a Markdown library) into `/docs/`
  on the Pages site, in the landing page's frame, with no script. The build
  fails on a guide page it does not name and on a link that resolves to
  nothing. `verify:demo` `demo.docs.1` makes the first comparison in the chain.
- **The keyboard page is generated** from `src/shared/shortcuts.ts` by
  `npm run guide:keys`; `guide.keys.1` pins it. The old README table had
  drifted from the registry (it still called `⌘N` "New panel").

## What the pictures are, and are not

They are the shot harness's scenes: the real renderer in real Electron on a
Mac, on fixture data, with agents asleep because the runner has no agent CLI
signed in. They are not a recording of a live session. That is plan item 1.2
(a 60 to 90 second screen recording) and it needs a real Mac; the README's
video slot is gone until there is a video to put in it, and
`docs/assets/CAPTURE.md` still says how to record one.

## Checked by hand

The site was built locally (with a stub in place of the demo) and its pages
opened in Chromium at desktop and phone widths, dark and light: no horizontal
overflow, no console error, every local link resolved.
The supported-agents table was read against `src/main/presets.ts`,
`src/shared/cost.ts` and `src/shared/agent-backends.ts`.
