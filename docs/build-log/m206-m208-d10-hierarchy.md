# M206–M208 — D10 hierarchy, navigation and contextual controls

## Outcome

D10 is built on `worktree-d10` in three commits: M206 names the shell by object/task role,
M207 discloses generic inspector controls, and M208 gives workflow Run uncontested primacy and
finishes the visible audit wording. No persisted record, IPC channel, runner or session lifetime
changed.

## What changed

- **M206:** the credential/service navigator is **Connections**. The Panels navigator groups
  browser and memory with Files, watcher with Workflows, and Toolbox/Skill under Capabilities;
  `Work` replaces the implementation-shaped `Boards`. An unknown future kind remains visible in
  Capabilities. Skills is still reusable inventory/assignment; Toolbox is still selected-context
  inspection.
- **M207:** Restart and live chat decisions remain contextual actions. Lock/pin/fill, front-end,
  rename and preset actions remain mounted with their existing reasons behind `More actions…`.
  Link and the armed Close remain directly reachable. Changing selection closes the disclosure.
- **M208:** workflow Run remains filled and visible; Trigger, Stop, Save, Delete and Build with AI
  remain mounted behind one disclosure. GitHub kind/state metadata is a sentence-case state pill.
  Connections wording reaches the palette, pane, dock and teammate grant note.

## Audit reconciliation

**Read** `docs/ux-audit-4.1.md`, backlog #86 and #88 against HEAD. Already closed before this act:
workflow block metadata is sentence case with `·` (`workflow-diagram.ts`); turn pluralisation is
present (`Inspector.tsx`); compact drawer top has `compact.1`; the skill menu stays beside its
wrapping name; lineup preview is a sentence; run facts are one data line; tool groups already have
the shared group model. D10 retained those implementations and their checks.

**Built here:** category labels, Connections wording, inspector/workflow action hierarchy and the
GitHub state pill.

**Still open, deliberately not disguised as D10 evidence:** backlog #86 needs a repository root
resolved in main and carried to the file/toolbox models; adding a speculative renderer resolver
would violate the path authority it is meant to fix. Backlog #88's deterministic shot clock/PTY
tail, edge-label inset, and conversion of the remaining bespoke empty arms need harness or data
work beyond this presentation act. The backlog entries remain open.

## Verification

- **red → green:** `m206.groups.1` failed on the former groups, then `verify:rail` passed 204/204.
- **green:** `npm run typecheck`; `npm run build`; D10 checks `m206.groups.1`,
  `m206.connections.1`, `m207.context.1`, `m208.hierarchy.1`.
- **green:** `npm run verify:packaged` 12/12.
- **observed:** the generated Connections, GitHub, workflow and inspector-detail scenes. Critic:
  *Connections names the authority it contains; GitHub metadata reads as state rather than code;
  workflow has one obvious Run; inspector configuration no longer competes with the next action.*
- **gate owed:** `npm run verify` stops in wave 1 on inherited base reds: `verify:meta`
  `milestones.1` (README lacks M244), `verify:palette` `sheet.1` (D09 ordering), and
  `verify:styles` 4–6 (existing literal tokens). The D10 scoped checks pass. `verify:visual`
  paints all 60 scenes but the base goldens broadly differ and the starter scene cannot paint;
  no blind rebaseline was performed. The immediately preceding D09 record names the same gate
  condition. A real-Electron shell diagnostic additionally inherited review/link fixture failures
  under load; its D10 restart/machine/inspector checks passed.

The act is therefore **built, with the repository gate owed**, not claimed complete.
