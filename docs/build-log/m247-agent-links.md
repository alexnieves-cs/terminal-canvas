# M247 — agent → object links on the canvas

Spec: `docs/superpowers/specs/2026-09-10-m247-agent-links.md`.
Plan: `docs/superpowers/plans/2026-09-10-m247-agent-links.md`.
On `m245-sheet`, after M246.

## Evidence
- **Watched failing:** `verify:agent-links` 1/17 before `agent-links.ts` and the store existed;
  16/17 with the modules but no forget sites wired; green once every panel-removing site forgets.
- **Source:** each chat panel's turns → `indexToolFiles` (`tool-index.ts`, the one place a path
  is read out of a tool call) → `agentLinks` → the per-agent store. A sheet's pending draft adds
  a `draft` link to its proposer even without a Write call — the draft IS the touch.
- **Store:** per-agent cached snapshots and one layer-wide subscription; never the registry's
  version counter. `forgetAgentLinksFor` sits beside all four `forgetEdgesFor` sites in
  `Canvas.tsx` and in the palette's close loop BEFORE its sessionless `continue` — a file object
  is exactly what links point at, and that `continue` skipped every clear below it.
  `forgetAllAgentLinks` rides the reset/workspace switch with `forgetAllEdges`.
- **Cost:** `useChatsVersion` bumps on every streamed delta; the feed recomputes an agent only
  when its turns ARRAY or the set of objects changed (a per-agent identity cache).
- **LOD:** `agentLinkPlan` — `tail` (nearest) every link with its word, `summary` one per
  (agent, kind) toward the nearest object, `block` none.
- **Toggle:** the `canvas.agentLinks` setting (default on); four doors — the HUD's links button,
  the `canvas.agent-links` palette row (plus the settings row the schema generates), `tc plan
  agent-links off`, an action node with the same line. `verify:verbs` covers the doors.

## Fresh-context critic (feature-dev:code-reviewer, read-only)
Two findings, both verified and fixed.
1. **A chat's cwd can be the unexpanded `~`** (a chat started with nothing focused; main expands
   it, the renderer cannot), so its relative tool paths normalised to `/~/…` and every such link
   was silently dropped. A home-relative spelling now matches by path SUFFIX, and only when
   exactly one open object ends with it — two would be a guess (`agent-links.map.8`).
2. **The draft badge only raised the sheet**; the spec says it selects the first draft cell, so
   "Keep selected" works on the first click. The sheet controller gained `focusDraft()`, called
   after `goToPanel`.
Checked clean by the critic: the store (snapshot caching, forget iterating a copy, never the
version counter), forget-site parity, the mapping and LOD, the layer's pointer rules, the four
doors, and the turns-identity cache.

## Merged with open items (the user's decision, 2026-09-10)
Merged to local main with every plain suite green and each milestone commit typechecked in
isolation, but two things OPEN:
- **The Electron tier is unverified.** The one full `npm run verify` that reached it failed
  across all four panels parts (watchdogs, "Object has been destroyed") on a machine shared by
  several sessions' Electron tiers with memory near exhaustion; two attempts to compare it
  against M246 alone were OOM-killed. Until an idle-machine run says otherwise, M247's
  `Canvas.tsx` additions (the settings read, the chat-driven link feed) are not ruled out.
- **Milestone numbers collide:** branch `m246-deck-tools` also uses M246/M247 and must renumber
  when it merges.

## Honest limits
Terminal agents have no turns and Codex reports commands without paths, so neither produces
links. Paths are compared as spelled (with the `/private` symlink spelling normalised); a path
reached through another symlink does not match. No Electron check renders the layer; the layer is
a pure projection of `agentLinkPlan` over `link-geometry`, both covered in plain node.

## Incident recorded (M246's commit)
M246 was first committed by filtering zero-context (`-U0`) hunks of `Canvas.tsx`; `git apply
--unidiff-zero` placed a pure insertion (`runWorkflowFromPlan`) after its use, so that commit did
not compile — found only by typechecking the COMMIT in isolation, not the working tree. A repair
attempt then amended with `Canvas.tsx` reset to its parent (a shell `set -e` did not stop on the
filter's refusal). The final M246 commit rebuilt `Canvas.tsx` from its parent by seven exact,
count-asserted replacements, and was typechecked in isolation (exit 0). Lesson: when splitting one
file across commits, build the blob and typecheck the commit, never trust a zero-context apply.
