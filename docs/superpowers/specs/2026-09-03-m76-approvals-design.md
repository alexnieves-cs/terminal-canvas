# M76 — Approvals as a canvas affordance

**Status:** design, 2026-09-03. **Branch:** `m76-approvals`. **Kind:** feature + surface.
**Briefs built against:** 1.x principles 1 (one state vocabulary), 6 (every control says what
it is), 9 (a disabled row names the fix); 2.0 principles 10 (three natures, one canvas), 11
(the same vocabulary whoever produced it), 13 (an edge says what it does — here, an
attention row says what it wants).
**Thesis sentence:** the first thing the canvas lets a person DO for an agent without going
to it — answer the question it is asking, from wherever they are.

## What this milestone is for

M73 put a permission request on the chat card: the tool, its input in mono, Allow and
Deny. That is one place, and it is the place the user is least likely to be looking when
the question arrives — the whole point of a canvas of agents is that most of them are off
screen. M43 built the attention machinery for terminals: a queue, edge pips, Cmd+J, a dock
badge, an OS notification, a beep. None of it knows a chat panel exists. M76 joins the two:
a pending permission puts the chat panel in `needs you` on EVERY surface the vocabulary
already reaches, and the question can be answered from each of them.

## Design

### Main owns pending, and says so once (`main/approvals.ts`, verify:agent-session)

- `createApprovalTracker({ sink, emitState, label })`. It is driven by the manager's own
  events (`permission-request`, `permission-answered`, `permission-dropped`, a `disposed`
  status) and keeps one set of pending request ids per panel. A panel whose set goes from
  empty to non-empty **enters** `needs you`: the tracker emits `agent:state` `wants-you`
  for that id — the SAME channel and word the terminal detector uses, so the renderer's
  attention store, the edge pips, Cmd+J, the popover, the workspace counts and the palette's
  `state:` ordering all light up with no code of their own — and drives the sink exactly as
  `PtyManager.syncAttention` does: a notification when the window is not focused and the
  setting allows, a beep when that setting allows, both only on ENTRY. A second request
  while one is pending re-notifies nothing. The set going empty emits `idle`; a dispose
  drops the panel from the tracker and emits nothing (the renderer clears the store at
  every panel-removing call site already).
- The notification names the tool: title `claude asks to run <tool>`, body `<label> needs
  you`, where the label is the chat's directory name. Its click is the existing
  `attention:jump`, which frames the panel and never wakes anything.
- **One badge, two authors, one writer.** `createAttentionUnion(sink)` returns two child
  sinks sharing the real one; each child's `badge(n)` records its own count and the real
  badge gets the SUM. `PtyManager` is handed one child and is otherwise untouched; the
  tracker gets the other. Without the union the two would overwrite each other's number
  and the badge would be whichever spoke last.
- `agent:acknowledge` (focus) clears a TERMINAL's `wants-you`; it does nothing for a chat,
  because the chat's `needs you` is a fact — a question with no answer — not a bell. Only
  an answer clears it. The renderer's own `chatState` already says `needs you` from the
  snapshot's pending list, so the card, the rail row and the far tiers agree with the
  attention store by construction: two readings of ONE fact main holds, never a second
  author.

### The renderer's list of questions (`chat-store.ts`)

- `useApprovals()`: every pending request across every chat panel on this renderer, as
  `{ id, requestId, toolName, argument }[]`, cached and rebuilt only when MEMBERSHIP
  changes (the attention store's own discipline — a streaming chat must not re-render the
  dock at the flush rate). `argument` is `toolArgument(input)` — the same short form the
  transcript's tool rows use.

### Where the question can be answered

- **The card, at every tier.** Live: M73's block, unchanged. Summary (`PanelFrame` gains a
  `far` slot rendered under the summary's state word): the tool name and its argument in
  mono with Allow and Deny. Block: the tone alone — a block is a colour, and a control
  smaller than a word is not a control.
- **The context pane.** The action bar leads with `Allow` and `Deny` on a chat panel —
  first, because they are the only two verbs whose delay costs something — enabled while a
  request is pending and disabled by name otherwise (`nothing is waiting for an answer`).
  They are present only on the chat kind, the rule the front-end verb set in M74.
- **The attention popover.** A row whose panel is a chat with a pending request carries
  `Allow` and `Deny` after the `jump` verb, each named with the tool (`Allow Bash`). The
  row is still the jump. A terminal's row is exactly as M63 left it: `needs you · jump`,
  and the spec states the limit plainly — a terminal's `wants-you` is "this panel is
  waiting", and nothing in this app can answer a question typed into a PTY on the user's
  behalf.
- **The palette.** Two rows per pending request, `Allow <tool> · <panel>` and `Deny <tool>
  · <panel>`, in the panel group, found by `allow`, `deny`, `permission`, `approve` and the
  panel's name. With nothing pending, one disabled row `Answer a permission request…` whose
  reason is `no agent is asking for permission` — hidden at rest and surfaced by its search
  terms, the credential rows' shape (amended after the verifier: a resting palette must not
  carry a permanent dead row; a person who types `allow` still learns the reason).
- **The OS notification**, as above. Its click frames the panel; the card is where the
  answer is given.
- **The card's composer** (amended after the critic and the verifier): while a question is
  open, Send is disabled with `claude is waiting for your answer — allow or deny above` (a
  reason that names the fix, distinct from the streaming reason), and the question block sits
  BETWEEN the well and the composer rather than inside the scroll host — the first scene
  showed it scrolled out of view at the moment it mattered. It is rendered in the
  transcript's tool-row idiom: a caps `asks` label, `<tool> · <argument>` in mono, the verbs.
- **A reloaded renderer** re-creates every chat by id; `agent:create` re-syncs the tracker so a
  still-pending question lights the attention surfaces again (amended after the verifier).
- Every one of these calls the one bridge verb M73 added, `agentSession.answer`, and every
  one of them clears the moment main's `permission-answered` event lands — the surfaces
  read the store, the store reads main. A deny from any surface carries the message
  `denied from the canvas`.

## What it must not break

- The terminal's attention path: `verify:pty-manager`'s M43 checks stay green with the
  child sink, which has the same interface.
- The attention store's snapshot discipline (membership change only).
- `verify:panels 94`'s dispose-site count: no new `registry.dispose` caller.
- No new channel: `agent:state` and `agent:answer` are reused. No new setting: the two
  attention toggles govern both natures, which is what principle 11 asks.

## The failure modes this guards against, each with its check

| Failure | Check |
|---|---|
| A second request re-notifying; a panel with two pending leaving `needs you` after one answer; a dispose leaving a phantom | `verify:agent-session approve.1` |
| Two badge authors overwriting each other | `verify:agent-session approve.2` |
| A notification while the window is focused, or with the setting off | `verify:agent-session approve.3` |
| A terminal's popover row growing Allow/Deny it cannot honour | `verify:rail approve.1` |
| The inspector's verbs vanishing rather than disabling | `verify:rail approve.2` |
| Palette rows absent when nothing pends | `verify:palette approve.1` |
| An exit with a question open leaving a phantom `needs you`; a reload losing the attention set | `verify:agent-session approve.4` |
| The composer's Send silent about the open question | `verify:rail approve.3` |
| Focusing the chat clearing its `needs you` like a bell | `verify:panels approve.2` |
| Answering from the popover moving the camera, or the card keeping the question after the answer | `verify:panels approve.1` |
| The palette's Deny not reaching the wire; the inspector's Allow not clearing the pane | `verify:panels approve.2` |

## Manual-only, added

- A real OS notification whose title names the tool, and its click framing the chat (the
  sink is injected; `verify:agent-session` proves the decision, not the toast).
