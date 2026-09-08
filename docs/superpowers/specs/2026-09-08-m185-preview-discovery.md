# M185 — the preview panel: discovery, the dev script, and reload

The first milestone of Act III. M103's browser guest already renders an http(s) page on the
canvas. M185 makes one of those panels a PREVIEW of the project beside its code: found from
what is already true (a port a panel's own process opened, or a `dev` script in the project's
`package.json`), reloaded when the project's files change, and honest about which answer it
has.

## Discovery observes; it never runs anything

`main/preview-discover.ts`, pure over injected readers: given a panel's process tree (M91's
`ps` reader, already in main) and a project root, it answers a list of CANDIDATES, each with
its source — `port` (a listening port attributable to that panel's own process tree, read
from `lsof -nP -iTCP -sTCP:LISTEN -a -p <pids>`, injected as a lister so a check drives a
fake) or `script` (a `dev`/`start` script in `package.json`, with its command). A port
candidate carries the url `http://127.0.0.1:<port>/`; a script candidate carries no url and
its verb is `Start dev server`, which is OFFERED and never run by discovery. Three states,
never two: no candidate (a sentence naming what was looked at), one candidate (opened), and
several (a chooser — a port a person did not mean is worse than a question).

## The preview panel

A browser panel gains `preview?: { root: string; source: 'port' | 'script' | 'url' }` —
absent on every M103 panel, which stays a plain browser pane. A preview panel's chrome adds:
the project's name (the root's basename, the path rule), a device-width control (M186's), and
`Reload`. The address stays secondary — the rendered page is the point — and the guest's own
`getURL()` remains the authority (M103's rule, untouched).

## Reload on a real change

`main/index.ts` arms ONE recursive `fs.watch` per preview root (M84's arming, reused), which
answers on `preview:changed` with the root; the renderer reloads that root's guests through
`browser-store.ts`'s reload — coalesced at 250 ms, ignoring `.git`, `node_modules`, `dist`,
`out` and dotfiles (a build tree writes hundreds of files and a reload per file is a flicker,
not a preview). A page that fails keeps its address and offers `Retry` (M103's arms).

## Doors

Canvas: `Preview…` on a panel's `⋯` menu (its process tree is what makes discovery possible)
and the launcher's `Open a preview…` line. Palette: `Open a preview…`. Agent: `preview
<panel>` and `preview-reload <panel>` through M180's door. Workflow: the M189 omission.

## Not here

The width presets and the screenshot verb (M186). A remote page's permissions (M103's
hardened guest is unchanged). Starting a dev server is an offered verb, never automatic.
