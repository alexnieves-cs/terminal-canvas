# M257 — shell and navigator clarity

Spec: `docs/superpowers/specs/2026-09-11-m257-shell-navigation-clarity.md`.
Plan: `docs/superpowers/plans/2026-09-11-m257-shell-navigation-clarity.md`.

## State

Implementation in progress.

## Evidence

- RED: `npm run verify:styles` reported 61/63 after the milestone checks first named the direct headings and wide labelled dock.
- GREEN: `npm run typecheck`; `npm run verify:styles` (63/63); `npm run verify:rail` (206/206); `npm run verify:meta` (50/50); `npm run verify:panels:shell` (98/98, including persisted filtering and folding).
- Visual gate: the pre-update run completed all 60 scenes and rejected all 60 expected shell changes; after the critic register and update, a clean rerun passed 62/62 (one preceding run hit the starter scene's intermittent arrangement failure, then reproduced cleanly).
- Packaged gate: pending.

## Golden critic register

| Scene | Critic sentence |
| --- | --- |
| launcher | The empty canvas now starts with a recognizable mark, a direct Create action, centered workspace identity, global retrieval copy, and an uncluttered dock. |
| kinds | The shell hierarchy is clearer around the unchanged panel-kind composition, with the primary canvas content retaining visual priority. |
| kinds-dark | The new identity, search, View trigger, and compact dock remain legible and restrained in the dark theme. |
| trail | The activity trail remains the focal content while the simplified top bar reduces competing controls. |
| skills | Skills reads as a named Content destination in the dock without changing the skills workspace itself. |
| chat | The chat composition keeps its emphasis while Create and global search become easier to identify. |
| integrations | Integrations now has a distinct Connections destination and no longer competes with a generic grid glyph. |
| github | The GitHub composition is unchanged and sits inside the more legible workspace shell. |
| across | The cross-panel scene benefits from explicit workspace identity without adding noise to the canvas. |
| vault | Notes now appears as a direct Content destination while the vault content remains visually dominant. |
| watcher | The watcher scene retains its status hierarchy under the quieter top-bar controls. |
| browser | Browser content keeps its available canvas width at standard density and the shell labels remain discoverable. |
| teammate | Teammates now uses a distinct people mark in the Connections group rather than another grid-like icon. |
| routine | The routine content is unchanged while the surrounding navigation has clearer action language. |
| board | Tasks is now named directly in the Work group and the board stays the visual subject. |
| chat-copilot | Copilot chat remains readable with the new retrieval search and consolidated View control above it. |
| memory | Memory content retains its hierarchy while Notes and Files gain clearer dock identities. |
| supervisor | Supervisor content remains stable and the shell exposes fewer unexplained primary controls. |
| templates | Template content is unchanged and Create reads as the cross-kind entry point it actually is. |
| runs | Run content remains primary while the dock destinations use distinct, learnable names. |
| graph | The graph keeps its full visual hierarchy under the simplified application bar. |
| edge-firing | The active edge remains obvious and the quieter shell does not compete with its motion state. |
| edge-waiting | The waiting edge state remains legible beneath the more compact View affordance. |
| composer | The composer retains its working space while search now promises panels, files, tasks, and commands. |
| tool-objects | Tool objects remain unchanged and the surrounding navigation communicates product areas more directly. |
| approval | Approval state continues to command attention without top-bar layout controls competing beside it. |
| verbs | Verb presentation is unchanged while Create replaces the implementation-specific New panel label. |
| auto | Automation remains the scene focus and the shell identity is more distinctive without becoming louder. |
| subagents | Agent content remains primary, with the navigator language and navigation destinations easier to scan. |
| palette | The palette sits coherently beneath a top bar whose search wording now matches global retrieval. |
| palette-query | Query results retain focus while the surrounding shell uses direct action and workspace labels. |
| lineup | The lineup remains balanced inside the simplified top-level chrome. |
| header | Header details remain readable and the new product mark provides clearer application identity. |
| flip | The flipped panel state remains the visual subject beneath the consolidated View entry point. |
| spawn-sheet | Sheet creation is still clear while the global Create action no longer implies terminals only. |
| start-work | The start-work flow retains its hierarchy and benefits from direct Tasks and Workspaces destinations. |
| palette-dark | The palette and revised shell preserve contrast and hierarchy in dark mode. |
| search | Search results now sit under copy that accurately describes global panels, files, tasks, and command retrieval. |
| search-empty | The empty-search state remains clear and its trigger now communicates the full retrieval scope. |
| inspector-detail | Inspector detail remains the secondary surface while pane controls move into View. |
| inspector-work | Work inspection remains stable and the primary bar carries only identity, creation, retrieval, and View. |
| inspector-tools | Tool inspection remains legible with the same reduced top-level control density. |
| navigator-panels | The navigator now exposes compact filters, direct title-case section counts, and cleaner panel rows. |
| navigator-workspaces | Workspace navigation remains readable beneath the new filter strip and direct section language. |
| navigator-files | File navigation gains a clearly named dock destination and the navigator stays compact. |
| attention | Needs-you rows now receive a restrained amber wash that is visible without overwhelming the row identity. |
| overview | The overview keeps its broad composition while the revised shell clarifies where the user is. |
| group | Grouped canvas content remains primary and the dock grouping reinforces the product mental model. |
| group-collapsed | Collapsed canvas groups remain legible alongside navigator sections that can now also be folded. |
| merged | The merged view stays visually stable and its control is discoverable inside View rather than occupying the primary bar. |
| zoomed-out | The zoomed canvas retains maximum emphasis at standard density under the compact dock. |
| zoomed-out-dark | The zoomed dark canvas preserves contrast with the revised mark and navigation chrome. |
| compact | Compact mode shows a useful workspace/task breadcrumb, abbreviated retrieval search, and icon-only dock without overflow. |
| workflow | Workflow content remains dominant and Tasks is plainly discoverable in the Work group. |
| workflow-edit | The wide 156px rail displays persistent labels and mental-model groups while leaving the workflow editor balanced. |
| wide | The wide shell uses the available room for persistent dock labels, grouping, and shortcuts without becoming a second navigator. |
| reduced-motion | The revised shell remains complete when motion is reduced, with no interaction depending on animation. |
| ink | The ink treatment keeps its intended mood while the product mark and direct labels remain recognizable. |
| file-missing | The missing-file state retains priority and clearer Files navigation offers an obvious recovery destination. |
| starter | The starter canvas presents a stronger product identity and a Create action that covers every supported object kind. |
