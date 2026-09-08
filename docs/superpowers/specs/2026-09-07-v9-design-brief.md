# Terminal Canvas 5.0 — design brief

Act 0 proposal, 2026-09-07. Amends the
[Obsidian brief](2026-09-05-design-brief-obsidian.md) and the
[4.1 product brief](2026-09-07-m162-product-polish-brief.md). The
[v9 finish prompt](2026-09-07-v9-finish-prompt.md) governs conflicts. Existing principles
survive unless struck below with a reason. Planned milestones are in the
[v9 plan](2026-09-07-v9-plan.md); their evidence belongs in the run’s ledger.

The visual thesis is a calm dark canvas of lit glass objects, with cyan guiding the next
action and enough space to read the work. The content hierarchy is the working object first,
named places second, selected-object context third, and one immediate next action. The
interaction thesis keeps the camera’s existing flight, the existing hover/focus reveal and
finite arrival/attention motion. No new animation system is needed.

## Product shape

One native window holds a rail of named places, a freeform canvas and a contextual inspector.
An agent, terminal, file, preview, workflow, image and note are equal authored objects.
Equality means the same selection, movement, marks, grouping, undo and export rules; it does
not mean giving an image a terminal toolbar or charging it a WebGL slot. Persistent agents
keep their names and places. The terminal remains a useful object among the others.

Orca supplies this canvas structure. n8n contributes a searchable node library, visible
connections, a configuration inspector and execution status on the graph being edited.
BridgeMind One supplies named destinations and the single-window posture. The 4.1 Claude and
Codex references remain the register for conversation and review panels. These are design
roles supplied by the prompt and repository, not claims of a new measured competitor audit.

## Material and typography that survive

Dark is the flagship; light remains complete and follows the existing system setting. Cyan
is the interface accent and never replaces the state vocabulary. Glass sits over the existing
blur and aura, with a hairline and lit top edge. Frames use 12px corners, controls/cards 8px,
chips 5px and pills the existing full radius. There is one resting shadow, `--lift`, on the
frame; rows and sections do not acquire one. Far tiers pay no blur. Do not add a grid or
decorative material behind ordinary controls.

Use system SF through `--font-ui` for names, labels, prose and notes. `--font-mono` is an
explicit leaf-level choice for code, commands, paths and terminal cells. Keep the existing
type ramp, 14px/1.5 prose, 72ch measure and 20px reading inset. A form or library row can keep
the 13px control size. Every new token name is declared in both theme blocks; structural
tokens stay on `:root`. `--well` remains paired with the xterm background, and measured hex
tokens are not replaced with rgba spellings that make contrast checks vacuous.

At most one filled primary control appears per surface. A workflow editor’s Run is primary;
Save is a quiet action with a dirty indicator. In a conversation, Send occupies the existing
primary position and Interrupt follows the runtime’s current rules. Destructive controls
retain their named confirmation path and never gain a reassuring primary fill.

## Rest, identity and context

A frame at rest carries glyph, name and one state. Existing chrome verbs reveal on hover,
focus or selection without shifting layout; the DOM aliases and tab order survive. Paths
use `shared/display-path.ts`, with the full value in Detail and tooltips. Editable path
inputs keep their real value. CPU, RAM, tokens and monetary figures remain in the inspector,
never the rail, frame or HUD. Counts such as “3 nodes” describe content and may remain.

The rail names places and objects in plain language. The selected object gets one clear
selection treatment; the inspector names that same object and shows fields that change it.
A workflow node’s selection does not show the enclosing workflow panel’s unrelated process
metadata. An image offers content and sizing; a note offers its text; a frame offers its name
and region. Any unavailable action stays present with a reason that names the next useful
step. Avoid duplicating a refusal as two permanent explanation lines above a graph.

## First launch

The first action is “Start a conversation” with an available engine, followed by an ordinary
composer. Installed, missing and unanswered discovery are separate states; signed in is not
inferred from a binary’s presence. A missing prerequisite gets one plain setup sentence, a
working setup link and Check again. A returning user sees their canvas intact.

The starter canvas puts the agent at working size and the other examples in named nearby
regions, with a short caption per kind. It teaches through useful editable objects rather
than a compulsory modal tour. All supported kinds are discoverable; viewing examples never
launches a fleet of processes. The terminal keeps the M170 agent card treatment when it is
an agent. A user can send the first message without understanding a shell command. Live
authentication and installation delays are reported honestly in the timed hand check.

## Workflow editing

The workflow remains an object on the canvas. Opening or maximizing it gives a library, a
diagram and the contextual inspector, within the same native window. Search narrows the
library by name and purpose; each entry has a glyph, a name, one useful sentence and an
example. Dragging previews placement before drop. A keyboard Add action performs the same
operation at the established placement point.

Nodes show names and sentence-case metadata. Ports and the connection preview reveal the
direction and whether a proposed edge is allowed. Invalid wiring explains the refusal and
commits nothing. The inspector renders fields from the kind’s schema, preserving a draft
when validation or a stale save refuses. A built-in workflow saves as a copy. Switching
between the diagram and its deliberately bound canvas editor preserves the exact definition.

Run shows each node’s queued, working, waiting, finished or failed outcome using the existing
state tones and named outcome detail. A result belongs to a particular run snapshot, so a
later edit never rewrites it. Test this node reports input, output, duration and a named
failure without falsely running its neighbors. Writes pause at the existing approval door;
the graph and agent surface show the same pending request. Cron and webhook nodes clearly
say whether they are armed and that they run only while the app is available.

## Preview and media

A preview reads as the app beside its code. The address is secondary to the rendered page;
device widths and reload are compact named controls. Discovery names the project and the
source of its answer, distinguishes multiple candidates from no answer, and offers a dev
script without executing it. A failed page retains its address and offers Retry. File-change
reloads coalesce; they do not flash the frame or reconstruct the guest unnecessarily.

Images preserve aspect ratio and show real pixels; missing bytes leave an object with a
Replace action. Sticky notes use readable UI text and restrained theme tints. Free text is
editable type with selection affordances rather than a large empty terminal frame. A named
frame defines a region with a quiet boundary; its interior does not swallow another object’s
gesture. Existing ink and file-backed Markdown stay useful alongside these objects.

Creation, selection, drag, resize, lock, pin where meaningful, maximize, group, delete and undo
follow existing geometry semantics. An unsupported mark says why; it does not vanish. New
object renderers retain frame/selection aliases while allowing the body’s material to match
its content. Semantic zoom preserves identity and an honest content summary. No media
gesture can enter the session-disposal path merely because a component unmounted.

## Sharing and extensions

Export names what is included, what was scrubbed and what was omitted. Import previews the
type and warnings, creates a separate workspace, and keeps every executable thing inactive.
An unknown plugin is a named disabled object with a repair path. Image pixels cannot be
claimed as automatically redacted: outward image inclusion is an explicit human review
choice, while agent export omits pixels and says so. Existing text and PNG exports remain.

An extension is understandable from its declaration: name, version, node/panel kinds and
bounded capabilities. Its fields and outputs look like built-ins. Installing or importing it
never creates a new trust path into Electron, the filesystem or credentials. The example
plugin must work from the documented external directory, not from a special fixture-only
registration. Feedback opens a scrubbed browser draft the person can inspect and submit.

## Deliberate amendments

| Earlier principle | 5.0 amendment, reason and acceptance evidence |
|---|---|
| ~~M133: the workflow is only a projection; the live canvas is the editor and Save is disabled~~ | M182–M184 make both views editors of one template. Replace the disabled-Save assertion with round-trip, conflict and cross-view agreement checks; preserve authored coordinates and historical runs. The check changes must be named in the ledger before implementation. |
| ~~4.1’s launcher leads with three equally weighted New panel / Chat / Open file cards~~ | M180–M181 give the first conversation priority because a beginner needs one start. Keep the other doors reachable and preserve their aliases. A first-launch golden and a complete start/send check replace the visual assumption. |
| ~~The 4.1 inspector action bar’s arrangement is fixed because a reach check walks its order~~ | M183 makes configuration the inspector’s main job for workflow nodes. Preserve every existing action and test keyboard reach in the resulting layout; a former layout is not a reason to leave editing unbuilt. |
| ~~A plan cannot create an object because a pointer-only door takes a world point~~ | New data verbs use the existing placement policy when no point is supplied. M180 establishes four-door closure; later object milestones prove the same operation through pointer, palette, workflow and agent execution without a second placement algorithm. Human-only credential, approval and pixel-review decisions remain explicit exceptions. |

No Obsidian material principle is retired. The 4.1 face, path, metrics, state and rest rules
survive. The panel arrival remains a rise: its previously struck scale stays struck because
it broke annotation geometry. No rule permits transforming `.pf__body`, changing xterm cell
metrics, bypassing the flush gate, renaming aliases, adding credential readers or weakening
the broker audit.

## Acceptance register — closed at 5.0.0 (M192)

Every row below is closed with the milestone that implemented it and the evidence that holds it,
or struck with the reason. The ledger `docs/build-log/m180-m200-ledger.md` carries the
per-milestone detail, every declined finding by name, and the sentence for every golden that
changed.

| Principle | Closed by | Evidence |
|---|---|---|
| Obsidian material, two themes, face/path/rest/metrics rules | M191, and every act's own critic | `verify:styles` 56/56 (theme parity, one primary, one resting shadow, the tone block), `verify:panels` `rest.1`/`header.1`, and thirteen scenes re-sentenced in M191 after two critics walked all 57 goldens. **One defect stands and is not re-baselined**: `palette-dark` renders its chrome light, recorded as owed with a hand check |
| A first conversation without terminal knowledge | M180–M181 | `verify:onboarding`, product `onboarding.start.1` / `onboarding.agent.1` / `starter.1`; the timed human trial is owed and named |
| Equal core objects and a useful starter | M181, M186–M187 | `image.kind.1`, `note.kind.1` (every other kind's partition false for it, `isTerminalPanel` included), `note.1`, `asset.1`, product `starter.1` / `image.2` / `note.1` |
| One template edited in both views | M182–M184 | `edit.1–.6`, `store.edit.1`, `run.def.1`, `run.outcome.1`, product `workflow.edit.1–.3` / `workflow.save.1`; a run's outcomes are drawn from its own snapshot, so a later edit cannot rewrite them |
| Library, wiring and configuration inspector | M183, M188 | `library.1–.2`, product `workflow.lib.1` / `workflow.wire.1` / `workflow.inspect.1`; the schema table is one registry the library, the inspector and the executor all read |
| Live preview, width and capture | M185 | `preview.1`, `preview.capture.1`, `preview.device.1`, product `preview.1`; **the real dev server behind discovery is owed** as a hand check, by the same rule that keeps the network out of `verify` |
| Useful bounded integrations | M188, partly STRUCK | The `http` GET node ships with every write refused by name (`node.http.1`); Slack, email, webhook and cron nodes are STRUCK — each needs a token, a sender domain, an armed listener across a relaunch or real elapsed minutes, and this run can prove none of them. GitHub keeps its audited `tc api` path |
| Portable work with inert import | M189 | `portable.1` (nothing of this machine travels; three parse answers; the remap), product `portable.1` — the import spawns no PTY and an imported workflow's action nodes are refused until read |
| External node and panel declarations | STRUCK | A declarative plugin registry is a new trust path into Electron, the filesystem and the credential store, and this brief's own evidence for it requires an example installed from an external directory by a person. Neither is here rather than a loader nobody has run from outside the repository |
| Named places and contextual actions | M180, M183, M187, M191 | `verify:rail` 194/194, the inspector's node editor, and M191's fix for the one case this brief named: a selected workflow node no longer shows the enclosing panel's process metrics |
| Four doors or explicit exceptions | M180–M190, closed at M188 | `closure.v9.1` binds every v9 verb to a palette row that exists, an agent line that BINDS, a canvas gesture, and a WORKFLOW door — an `action` node whose line binds to the same verb, with `action` a kind the library offers. `node-test` alone keeps an owed workflow door, with its reason |
| Intentional motion and accessible input | Inherited, re-checked | `reduced-motion` and `compact` scenes, `verify:styles` motion rules, and the disabled-reason reveal M191 added follows the same opacity rule (never `display`), so a script's click still lands |
| Installable 5.0 with feedback and guidance | M190, M192 | `feedback.1`, `guide.1`, product `feedback.1`; `npm run verify`, `npm run verify:visual` and `npm run verify:packaged` green at the version; `release/Terminal Canvas-5.0.0-arm64.dmg`; `docs/getting-started.md`; `docs/release-notes/5.0.0.md` |

The Act VIII critics walked every committed golden, including the unchanged ones. Thirteen
findings were fixed at their surface; twenty-one are declined BY NAME in the ledger with the rule
each cites and the consequence of leaving it. This register is the finished brief: not an
assertion that the pictures look premium, but a list of what was built, what was proved, and what
was refused with a reason.
