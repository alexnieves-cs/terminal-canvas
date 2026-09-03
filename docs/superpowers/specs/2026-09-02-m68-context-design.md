# M68 — The context pane finished

**Status:** design, 2026-09-02. **Branch:** `m68-context`.
**Brief principles built against:** 7 (three states, never two), 3 (identity leads), 6
(every control says what it is), 9 (copy). Feature and surface: shot, looked at, critiqued.

## What this milestone is for

The context pane has three tabs grouped by question — Detail, Work, Tools — and each has a
seam the dead-end audit could not see. Work hides a section whenever it has nothing to say,
so a login shell in a plain directory shows one sentence and three absent headings, and the
user learns to stop reading the tab. Detail repeats the pid the pinned header already shows
and spends two rows on `command` / `asked for` when, for nearly every panel, they agree. The
Jira panel with no credential says `Connect Jira before loading tickets.` and offers no way
to. The Files pane names a directory but not whose; the Workspaces pane can switch, rename
and delete but has no door to the merged view, which lives only in the top bar.

## Design

### Detail

- **No field repeated from the pinned header.** The header shows the heading, the state word,
  `reattached` and the pid; the field list no longer renders `pid`. The model keeps the field
  (the header reads it from there); the VIEW filters it — `visibleDetailFields(fields)`, pure,
  in `inspector-fields.ts`.
- **`command` and `asked for` collapse when they agree.** The `asked for` row renders only
  when its value differs from the resolved command (an absent spec — main chose the login
  shell — always differs, so verify:rail 21's question "why does this say login shell" keeps
  its answer). Same filter.

### Work

- **Every section renders, each with three arms.** `Changes`: not a repository / reading… /
  the file list (the model's `hidden` arm becomes the first line, `this directory is not a
  repository`). `Runs`: `no runs yet` / rows. `Cost`: `no agent pinned — cost unknown` / `no
  answer from this agent yet` / the four figures. The combined "does no work of its own"
  sentence goes; a sessionless kind's Work tab says so per section. The earlier rule — hide
  Changes for not-a-repo so a placeholder does not teach the user to skip the tab — is
  overruled by the brief's third rule: a heading whose line says *why* there is nothing is
  not a placeholder, and three absent headings read as a broken tab.

### Tools

- **Commands and permissions.** The Toolbox section already lists commands, skills, MCP
  servers and hooks. It gains a `permissions` line from `toolbox:permissions` — the mode
  and the count of allow/deny rules — with its own three arms (no directory / reading… /
  the line). Rendered under the same heading, above the rows.

### The Jira panel

- **A Connect verb.** The no-credential note is followed by a `Connect Jira…` button that
  opens the palette in its Credentials scope (`openPalette('credentials')`), the same door
  the palette's own row uses. `shellControl`, in the body, never in the chrome.

### The navigator

- **Files names its root panel.** The header reads `<root> · <panel name>` — the basename as
  now, then the selected panel's label — so a tree rooted on a panel the user did not click
  says whose it is.
- **Workspaces carries the merged-view door.** A row at the end of the list: `merged view`
  with the hint `every workspace at once, read-only`, pressed while merged, toggling
  through the same `toggleMerged` the top bar uses. Rename and delete stay as they are
  (delete already confirms through the palette).

## What it must not break

- verify:rail 21 and verify:panels 87 (separate `command`/`spec-command` in the model and in
  the DOM when they differ).
- The inspector's frozen-model rule: every new line derives from the existing models or a
  new three-state result in `useInspectorDetail`, never from a per-render fetch.
- The merged view stays read-only; its door is a toggle, not an enter/leave pair.

## Checks

- `verify:rail context.1` — `visibleDetailFields` drops `pid`, drops `spec-command` when equal
  to `command`, keeps it when different or absent, and preserves order.
- `verify:panels context.2` — a plain shell in a non-repository directory: the Work tab shows
  all three headings, each with its first-arm line; `context.3` — a Jira panel with no
  credential shows the Connect verb and clicking it opens the palette in the Credentials
  scope; `context.4` — the Files pane's header names the selected panel; the Workspaces
  pane's merged row toggles the merged view and reads pressed.

## Definition of done

Every item; checks red first where the shape exists; shot; looked at; critiqued; verified;
merged; branched `m69-overview`.
