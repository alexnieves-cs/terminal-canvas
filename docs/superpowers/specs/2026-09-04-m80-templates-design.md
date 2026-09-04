# M80 — Templates

**Status:** design, 2026-09-04. **Branch:** `m80-templates`. **Kind:** feature + surface.
**Briefs built against:** 1.x principles 3 (identity leads), 6 (every control says what it
is), 7 (three states), 9 (a disabled row names the fix); 2.0 principles 10 (three natures,
one canvas), 11 (one vocabulary), 13 (an edge says what it does).
**Thesis sentence:** a shape of work — panels, their directories, their first messages and
the edges between them — saved once and started again with two words filled in.

## What this milestone is for

M78 made the graph runnable and M79 made a run a record. Building the graph is still hand
work every time: spawn a chat, spawn a terminal, draw an edge, set its rule, type the first
message. A TEMPLATE is that shape saved — a record beside presets — with `{{parameters}}`
in the places that change (a repository, a branch, a prompt's own holes). Instantiating it
asks for those, mints the panels through the ordinary create paths, draws the edges, and
places the whole thing where a spawn would go.

## Design

### The record (`shared/templates.ts`, `layout-schema.ts`; verify:layout)

- `PersistedTemplate`: `{ id, name, description?, nodes: TemplateNode[], edges:
  TemplateEdge[] }`. A `TemplateNode` is `{ key, kind: 'terminal' | 'chat', presetId?,
  command?, cwd, title?, message?, dx, dy, w?, h? }` — `key` is the template's own name for
  the node (edges name keys, never panel ids); `dx`/`dy` place it relative to the
  instantiation centre; `message` is a chat's first message. A `TemplateEdge` is
  `{ from, to, trigger }` over M78's five triggers.
- Top level in the layout, beside `presets` and `prompts`: templates are not a workspace's.
  The record rules: absent is every pre-M80 file and warns nothing; a template that is not
  an object, has no usable id or name, or has no node is dropped by name; a node with an
  unusable key or kind is dropped and the template kept if a node survives; an edge naming a
  key that did not survive is dropped and the template kept; `TEMPLATES_MAX` (30).
- `BUILT_IN_TEMPLATES`: one, `review this repository` — a chat in `{{repository}}` whose
  first message is `Review the working tree for correctness and name every silent failure.`,
  and a terminal in `{{repository}}` running `git diff --stat`, with an edge from the chat
  `after a turn`. Built-ins are merged with the user's the way `allPresets` merges presets,
  and cannot be deleted (the same refusal, by name).

### The pure model (`renderer/palette/template-model.ts`; verify:palette)

- `templateHoles(template)`: the unique `{{name}}` names across every field of every node
  and edge, in first-seen order (`composer-model.ts`'s `placeholders`, applied to a record
  rather than to one string — the same regex, imported, never a second copy).
- `fillTemplate(template, values)`: every field with its holes filled; a hole with no value
  stays as typed, the composer's own rule.
- `templatePanels(template, centre)`: the nodes as `{ key, kind, centre, ... }` in node
  order, `dx`/`dy` applied around the centre — the geometry the canvas mints from.
- `templateRefusal(template, presets, claudeAvailable)`: the named reason a template cannot be
  instantiated — a node names a preset that is gone, a chat node with no `claude`, a node
  naming neither a preset nor a command, or edges that make a LOOP (amended after the
  verifier: `setLinkAutomation` refuses a cycle silently and at the last moment, which would
  leave a template half applied) — or undefined.

### The surfaces

- **The spawn sheet** gains a `Template` group in its `what` control, listing built-in and
  user templates. Picking one replaces the sheet's directory/title fields with ONE FIELD PER
  PARAMETER (the composer's fill step, amended from the scope's "one by one": the sheet is a
  form, and a form asks its fields together), plus the preview line naming what will be made
  (`2 panels · 1 edge`). `Create` instantiates.
- **The palette**: `New from template…` opens the sheet with that template chosen; a
  template that cannot be instantiated is a disabled row with `templateRefusal`'s sentence.
- **Saving**: `Save selection as template…` — the selected panels and every enabled handoff
  edge among them, named through the palette's text line. A terminal saves its spec's own
  command and arguments; a panel with NO command is the login shell and saves as the built-in
  `shell` preset (amended after the verifier: saving it as nothing made the template
  unstartable). A selection with no usable panel refuses by name; other kinds are dropped
  with the count in the sentence; the merged view refuses by name (its rects are lane-space).
- **Instantiation** resolves a preset node through `preset:template` — main's own answer, and
  the reason for the milestone's fourth channel: only main turns an absent `command` into the
  login shell, and the first cut spawned through `spawn:sheet` and then guessed which panel
  had arrived (amended after the verifier: two history entries, a visible jump, and the wrong
  panel under a concurrent spawn). Every node is minted here and the edges added with
  `setLinkAutomation`, in ONE history entry, selecting the whole shape; a refusal part way
  disposes every chat session already created. A chat node's `message` is delivered through the store's insert bus, never
  sent: the user presses Send (a template must not start work the user has not read).

## What it must not break

- `verify:layout`'s preset and prompt records (templates are a sibling key, not a change).
- M78's cycle refusal (a template's edges go through `setLinkAutomation`, which refuses one).
- The spawn sheet's existing rows and its refusal path.

## The failure modes this guards against, each with its check

| Failure | Check |
|---|---|
| A malformed template dropping the file; a dropped node leaving a dangling edge; a pre-M80 file warning | `verify:layout template.1` |
| A hole in a nested field missed; a filled template still carrying `{{ }}`; a hole with no value blanked | `verify:palette template.1` |
| A template with a missing preset instantiating anyway; a chat node with no `claude` | `verify:palette template.2` |
| The sheet's template rows absent, or its parameter fields not asked | `verify:panels template.1` |
| Instantiation minting the panels but not the edge, or in two history entries | `verify:panels template.1` |

## Manual-only, added

- The built-in template against a real repository with a real `claude` (the harness mints
  its chat through the fake runner).
