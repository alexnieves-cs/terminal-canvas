# M21: The agent's toolbox — Implementation plan

Design: [`../specs/2026-08-30-m21-agent-toolbox-design.md`](../specs/2026-08-30-m21-agent-toolbox-design.md).
Backlog: `docs/ideas-backlog.md` #26, the read-only half.

Branch `worktree-m20-toolbox`, off `main` at `022e2db`.

---

## Shape

M16's file panel established a spine and this milestone is the same spine with
a different reader. The mapping is close to 1:1 and the two departures are the
part worth reading.

| M16 (file panel) | M21 (toolbox) |
|---|---|
| `shared/file-panel.ts` — result union + caps | `shared/toolbox.ts` |
| `main/file-read.ts` — never-throwing reader | `main/toolbox-read.ts` |
| — | `main/toolbox-scan.ts` (**pure**, plain-node tier) |
| `main/file-watch.ts` — a watcher | `main/toolbox-cache.ts` (**a cache, not a watcher**) |
| `file:read` / `file:close`, `file:changed` | `toolbox:read` / `toolbox:permissions`, **no event** |
| `renderer/session/file-store.ts` | `renderer/session/toolbox-store.ts` |
| `renderer/file/file-node-model.ts` | `renderer/toolbox/toolbox-node-model.ts` |
| `renderer/file/FileNode.tsx` | `renderer/toolbox/ToolboxNode.tsx` |
| `verify:file` + `file-entry.cjs` | `verify:toolbox` + `toolbox-entry.cjs` |

**Departure 1: a pure scanner splits off from the reader.** M16 needed no
`file-scan.ts` because "read a file" has no parsing in it. Every toolbox kind
has a format this repo does not own — YAML frontmatter, `settings.json`'s hook
tree, `~/.claude.json`'s project map — so the parsing and, critically, the
PROJECTION live in a pure module in the cheapest verify tier. That is the split
`git-args.ts`/`git-runner.ts` and `subagent-scan.ts`/`subagent-watch.ts` already
make, and it is what lets the security boundary be checked with no filesystem
in earshot.

**Departure 2: pull, not push.** See the spec. `FileWatchers` is keyed by panel
id and half of this feature's sources are shared by every panel, so reusing it
would arm twelve watchers on four paths. A cwd-keyed cache validated by a stat
sweep replaces it, and the node renders `readAt` so a stale answer is honest.

---

## Tasks, as executed

**0. Documents.** This plan and the design spec.

**1. `src/shared/toolbox.ts`.** `ToolEntry` as a discriminated union with a
shared base (the uniformity is a descending staircase: `scope`/`sourcePath`
universal, `id`/`kind`/`active` nearly so, `name` for four kinds, `description`
for three, and hooks have neither). `ToolActive`'s five arms. `SourceRead`,
`PermissionCounts`, `UnresolvedToggles`, `ToolOverflow`, `ConfigFreshness`.
Every cap, each with the specific unbounded input it bounds — and
`SETTINGS_MAX_BYTES = 1 MB` with the measurement that forces it in its own
comment.

Permissions are deliberately **not** a `ToolEntry`. The criterion is stated
rather than felt: an entry is a thing that came from a file, is individually
present or absent, and is individually enabled or not. A permission rule passes
the first two and fails the third — being in `allow` IS its enablement — so
`active` would be degenerate on 1,346 rows. They get a sibling field.

**2. `src/main/toolbox-scan.ts` (pure).** The parsers and the projection.
Hand-rolled frontmatter (no YAML dependency, and no parser differential),
`commandName`'s two-level namespacing, `projectMcpServer`, `hookProgram`,
`readClaudeJson`'s four-path allowlist, the two MCP gate pairs,
`parsePermissionCounts`/`parsePermissionRules`, `skillOverrideOff`,
`unresolvableOverrides`, `parseEnabledPlugins`, `countHooks`.

**3. `scripts/toolbox-entry.cjs` + `scripts/verify-toolbox.cjs`.** 43 checks.
Both `@shared` and `@renderer` aliases — `@shared` is load-bearing here (the
caps are real value imports) and `@renderer` is carried for the reason
CLAUDE.md's alias entry records. The fixture tree is built under
`mkdtempSync(join(tmpdir(), 'tc toolbox '))`.

Checks 11, 15/16 and 22 were **fault-injected** rather than merely written, and
each injection turned exactly the intended check red while its over-correction
guard stayed green.

**4. `src/main/toolbox-read.ts` + `toolbox-cache.ts`.** The real-fs half, taking
`home` as a parameter so the fence cannot be forgotten, plus
`resolveToolboxHome()` honouring `TC_TOOLBOX_HOME` (the shape
`TC_CLAUDE_PROJECTS` and `TC_TMUX_SOCKET` already have). `configStamps`
stamping files as well as directories. The LRU cache keyed by resolved cwd.

**5. IPC — two invokes, `EXPECTED_CHANNELS` 41 → 43.** `toolbox:read` and
`toolbox:permissions`, both matching `/^[a-z]+:[a-z-]+$/` so `verify:meta` 15's
count guard stays green, both added to the README's one `--invoke-->` fence so
`verify:meta` 14 does. `registerIpcHandlers` gains a `toolboxCache` parameter,
appended last so no positional call site shifts; the three harnesses that call
it get a stub or a real cache.

**6. The panel kind.** `ToolboxSource` in `shared/toolbox.ts` (beside
`FileSource` in `shared/file-panel.ts`, because `layout-schema.ts` needs it and
`shared` must never import from `renderer`), `ToolboxPanel`, `isToolboxPanel`,
`makeToolboxPanel`, and `isTerminalPanel`'s fourth negation. The schema arm and
parser, the `layout-adapt` round trip both ways, and the id-prefix regex
widened to `/^[nrfjt](\d+)$/` — which **also fixes M19's Jira gap**, found by
this work rather than introduced by it.

tsc did the finding here rather than a reviewer: adding the union member turned
every site that assumed non-review/file/jira meant terminal into a compile
error, which is the property `isTerminalPanel`'s own comment claims and this is
the milestone that exercised it.

**7. The inspector's Toolbox section.** `buildToolboxFields` +
`toolboxSignature` in `inspector-fields.ts`, its own prop on `Inspector` — the
`review`/`reviewSignature` shape rather than a sixth parameter on
`buildInspectorModel`, because the inventory arrives asynchronously on its own
clock. The Canvas query effect copies the review effect line for line,
including `setToolbox(undefined)` unconditionally before the invoke and a
STRING dep rather than the panel object.

**8. The node.** `toolbox-node-model.ts` (appended to `rail-entry.cjs`),
`ToolboxNode.tsx`, CSS with tokens only. `data-scroll-host` on the scrolling
element, which is why `shouldYieldWheel` needed no edit.

**9. Checks.** `verify:rail` +12 (both models, two fault-injected),
`verify:viewport` +2 (the constructor and the five-way partition, one
fault-injected), `verify:layout` +3 (the schema arm, the individual drop, the
adapter round trip), `verify:panels` +4 (end to end, including the projection
observed in rendered DOM and the no-`pty.kill` close with its non-vacuity
half).

**10. Documentation.** README milestone row, CLAUDE.md verify table and
load-bearing entries, backlog #26 rewritten down and its sequencing item struck.

---

## What went wrong, kept for whoever reads this next

- **The Electron binary was never installed in this worktree.** `npm install`
  exited 0 and the postinstall's `electron-rebuild` ran, but
  `node_modules/electron/dist` did not exist — so the first full `npm run
  verify` stopped at `verify:pty` with `No such file or directory`. Worse, the
  first attempt piped the run through `tail`, so the shell reported **exit 0
  from `tail`** and the failure read as a pass. Two lessons, and the second is
  the transferable one: `node node_modules/electron/install.js` is the fix
  CLAUDE.md's Gotchas already record, and **never pipe a verify run into
  anything** — capture to a file and read `$?`.
- **`parseLayout` returns PERSISTED records, not `Panel` objects.** A check
  written against `panels[0].rect.id` threw a `TypeError`, which aborted the
  run at that line and took every check below it with it — exactly the trap
  CLAUDE.md's "A check that THROWS aborts the run" entry describes. The suite
  reported a lower total rather than a failure.
- **A blanket `warnings.length === 0` clause is usually wrong.** A fixture with
  no camera makes `parseLayout` legitimately warn. Assert that no warning names
  the panel under test instead.
- **`shared/` importing from `renderer/` typechecks and is still wrong.** The
  first cut declared `ToolboxSource` in `panels.ts` and imported it into
  `layout-schema.ts`, which compiles fine and points the dependency the wrong
  way. `FileSource` living in `shared/file-panel.ts` is the precedent that says
  where it belongs.
