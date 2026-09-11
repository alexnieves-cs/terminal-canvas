# M252 — Describe a tool

## Why
A person should be able to say what small tool they want and get a canvas object that does it —
without the canvas ever running code nobody has read. An agent's answer is from outside, so it
takes the rule imports already follow: it arrives inert.

## Shape
- **Input** — a description, through all four doors of one creatable kind (`CREATABLE_OBJECTS`
  entry `tool`, `requires: 'folder'`): the pill row, palette `object.create.tool`, `tc plan
  create-tool <description>`, and an action node. With no description the pill and palette open
  a one-line prompt (the palette first — input mode clears on a closed palette).
- **Generation, in main** (`main/tool-generate.ts`) — ONE headless run:
  `claude -p --output-format json --tools "" --json-schema <schema> --append-system-prompt … -- <description>`.
  `--tools ""` gives the agent no tools, measured against claude 2.1.268's help; its answer is
  data. `--` ends the options so a description is never a flag. Stdin closed; a timeout kills.
- **The answer** (`shared/tool-spec.ts`) — a **workflow** (through `parseTemplates`, existing
  node kinds only; an unknown node costs itself and its edges, named in `dropped`) or an **app**
  (≤ 20 files, relative paths only — one that climbs out or is absolute refuses the whole app;
  must have `index.html`; a dev script and a port). An app's files are written only under a
  fresh `<folder>/tools/<slug>[-N]/`, with a `package.json` whose dev script is the one shown.

## Inert on arrival
- A workflow is saved `reviewed: false`, so M190's refusal names every action block until read.
  The refusal sentence now says *from outside this canvas (a file, or an agent's answer)*.
- An app opens as a preview whose binding is `reviewed: false`: the pane creates **no guest**,
  and Open and Start dev server refuse by name (`REASON_TOOL_UNREAD`). A malformed flag fails
  closed.
- **"I've read this"** on the workflow panel or the pane is the only thing that lifts either —
  a person's act with no verb, palette row, agent line or workflow node (`tool.door.1`), the
  shape of Mark reviewed (M202). It also gives imports the way to be read they lacked.

## What it can reach, before it runs
`toolCapabilities` reads reach off what the tool IS: a workflow's blocks (their folder, HTTP
hosts, terminal commands and action lines); an app's folder, every address in its files and its
dev script. Shown on the unread object itself and in the inspector (workflow and browser arms,
with a `read` field). Scope policy (M196) still grants nothing; session grants (`agent:grants`)
remain the chat's own, and a chat a tool later starts shows them in its own inspector.

## Saving as a template
A workflow tool IS a template (`template:save`), kept unread until read. `shelf:save` is the
Skills pane's layout, not a template store, and is not used.

## Checks
`verify:tool` (new): reply arms, dropped nodes, refused paths, reach, and the generator over a
fake runner (argv, one spawn, writes only under tools/, workflow writes nothing, failure, timeout
kill, refusals before spawning). `verify:panels:product tool.1–3`: the real renderer with a
planted answer. `verify:verbs tool.door.1` and `creation.registry.1`. `verify:ipc` to 136.
