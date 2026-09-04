# M80 — Templates

**Branch:** `m80-templates`. **Spec:** `docs/superpowers/specs/2026-09-04-m80-templates-design.md`.
**Plan:** `docs/superpowers/plans/2026-09-04-m80-templates.md`. **Status:** finished 2026-09-04.

**Thesis sentence:** a shape of work — panels, their directories, their first messages and the
edges between them — saved once and started again with two words filled in.

## What landed

- `shared/templates.ts`: `PersistedTemplate`, `TemplateNode`, `TemplateEdge`, `TEMPLATES_MAX`,
  `BUILT_IN_TEMPLATES` (one: `review this repository`), `allTemplates`, `isBuiltInTemplate`.
  `parseTemplates` with the record rules — a dropped node takes its edges, the template stays.
  `verify:layout template.1` (189/189).
- `renderer/palette/template-model.ts`: `templateHoles`, `fillTemplate` (the composer's own
  regex and fill rule, imported), `templatePanels`, `templateRefusal`. `verify:palette
  template.1–.2` (122/122).
- IPC: `template:list` / `template:save` / `template:delete`, the bridge section, main's
  handlers over the store (`templates()`, `saveTemplate`, `deleteTemplate`), both diagrams,
  `verify:ipc` at 79.
- The spawn sheet's Template group with ONE FIELD PER PARAMETER and a preview counting the
  shape; the palette's `New from <template>` rows (disabled by their own reason) and `Save
  selection as template…`; `instantiateTemplate` in Canvas — a preset node through main's
  spawn path with its id learned from the delta, a command node and a chat minted here, the
  edges through `setLinkAutomation`, one history entry, the chat's message inserted after the
  panel is seeded.
- `verify:panels template.1` (285/285); a `templates` shot scene; README row; CLAUDE.md note
  and counts; verify-suites counts; three `docs/load-bearing.md` entries; this log.

## Red first

- `verify:layout template.1` and `verify:palette template.1–.2` red at module scope (the two
  modules absent), then green as each landed.
- `verify:panels template.1` red once on the real defect it was written to find: the chat's
  first message went into an empty composer, because the insert bus reaches only a chat the
  store has seeded and the seeding is the panel's own hook. It is delivered after the commit.

## Decisions taken while building, and why

- **A preset node goes through main.** The absent-command rule is main's alone; the renderer
  learns the panel from its own array rather than being told.
- **The parameters are a form, not a chain.** The scope said "asked one by one"; the sheet is
  a form and asks its fields together, one field per parameter — the composer's fill step.
- **The chat's message is inserted, never sent**: a template must not start work unread.
- **Built-ins are code**, like presets: a new one ships with the app and cannot be deleted.
- **One history entry** for the whole shape.

## What this milestone does not do, stated

- A saved template records a terminal's command when it has one; a panel spawned from a
  preset saves its command, not the preset id (the renderer does not hold the preset's spec).
- Templates are not exported or shared between machines; they live in the layout file.

## The visual loop

**Before any critic**, the first `templates` scene showed the palette answering `No matching
command` — the shot harness had no template handlers — and then a sheet whose parameter label
was truncated to `REPOSITOR` and which still asked for a directory and a title that a template
does not use.

**The critic** (briefs + the PNG, fresh context). Accepted: `↵ start` is the state machine's
word for one panel and a template lays down a shape (`↵ create 2 panels`); the preview counted
the shape without naming it (`chat + terminal · after a turn`, the edge's own vocabulary); the
parameter's label sits above its field, left-aligned, never truncated. Declined, recorded: the
footer's `⌘N starts the default without asking` is accurate, not a contradiction of the top
bar's `⌘⇧N` (they are two different keys); the stock select, the footer's key hints as the only
commit affordance, the heading's size and the sheet's placement over the canvas are M65's own
design, unchanged by this milestone.

**The verifier** (spec + diff, fresh context): "delivered with gaps". Accepted and fixed, in
order of severity: the save verb recorded neither a preset nor a command for a preset-spawned
panel, so the commonest thing a user would save could not start (a terminal now saves its
spec's command and arguments, and a login shell saves as the `shell` preset); a refusal part
way through instantiation left chat sessions alive in main with no panel (every created
session is disposed); a preset node was spawned through `spawn:sheet`, which placed it itself,
committed its own history entry and left the renderer guessing which panel had arrived
(`preset:template` resolves it instead — main's answer, no delta, no jump, one entry); a
cycle in a template's edges was refused silently by `setLinkAutomation` and left the template
half applied (refused by name, before anything is minted); a malformed edge trigger was
coerced to `exit` (dropped with a warning, the absent/malformed rule); the save verb refused
nothing by name and never said what it dropped; it had no merged-view guard; instantiation
selected one panel rather than the shape; a user template could shadow a built-in id; the
palette showed no row at all when nothing was saved. The check now drives the SAVE VERB
through the palette rather than calling the bridge by hand, and asserts `where` and `title`
are hidden. Declined with reasons: the sheet's `<optgroup>` (one select, one list — the rows
carry their own refusal); `parseTemplates` accepting an empty `cwd` (a template with no
parameter and no directory is refused by main by name at create, which is where the directory
is known).

## Verification

Run alone, after the tmux verify server was killed: `npm run verify` green end to end —
`verify:layout` 189/189, `verify:palette` 122/122, `verify:ipc` 80 channels, `verify:panels`
285/285. The `templates` scene re-shot five times and read.
