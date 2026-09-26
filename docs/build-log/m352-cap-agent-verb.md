# M352 — `cap-agent`: an agent's own caps, through four doors, and a door can only tighten

**Verdict: shipped.** Arc 2.3. M351 gave an agent's own caps a place on its chat's record,
and main enforces them. M352 is the verb that sets them, `cap-agent <panel> <cap>`, with
all four doors:
- **canvas**: the Caps fields on the Inspector's Work tab;
- **palette**: `Cap this agent…`;
- **agent**: `tc plan cap-agent ch1 5usd`;
- **workflow**: an action node `cap-agent ch1 200k`.

The Work tab now shows main's meter against the caps in force, and whose each cap is. A
held agent's hold is said there in one amber sentence that names its own fix.

**The agent and workflow doors can only LOWER a cap.** A cap an agent could raise through
`tc plan` would bind it only as long as it agreed to be bound. Raising, removing or
resetting a cap is a person's decision, made in the Inspector or on a typed palette line.

Built 2026-09-26 in the worktree on top of M351, then landed on local `main` after it.

## What landed

- **`planCapChange(own, value, origin, current)`** (`shared/agent-session.ts`), pure. The
  value is one comma-joined token:
  - `5usd` or `$5`: a spend cap;
  - `200k`: a context cap;
  - `5usd,200k`: both;
  - `0usd` or `0k`: no cap of that kind for this agent;
  - `none`: neither;
  - `default`: clear the agent's own caps, so the Settings caps apply;
  - `default-usd` or `default-k`: clear one (the Inspector's blank field).

  Through a door (`origin: 'door'`) every figure must be above 0 and at or under the cap
  in force. `none`, `default`, the per-figure resets and 0 are refused by name
  (`CAP_DOOR_REASON`). Bad tokens, out-of-range figures, a unit named twice, and a set
  plus a reset of the same unit are refused by name.
- **The verb**:
  - `VERBS` and `V9_DOORS` rows (`shared/verb-table.ts`);
  - `PaletteActions.capAgent` and the `agent.cap` row (`palette/commands.ts`), which
    opens the verb line like `note.tint` and says "select an agent conversation first"
    when no chat is selected;
  - a slice of its own (`canvas/palette-actions/caps.ts`), which writes the record as
    one history entry and reads the cap in force from MAIN's meter;
  - the executor arm (`palette-actions/executor.ts`), which passes the step's `origin`.
- **`CapHold.own`** and `capSentence`: a hold under the agent's OWN cap says "raise its
  own cap in the Inspector's Work tab (or cap-agent in the palette)", not a setting's
  name.
- **The Inspector** (`shell/inspector-fields.ts capsField`, `shell/Inspector.tsx
  CapsSection`, styles): a Caps section under Cost on a chat's Work tab. It holds:
  - two lines in main's figures, for example `$0.42 of $2.00 — this agent's cap` and
    `118k tokens of 150k — Settings cap`;
  - the hold's sentence in amber, mixed a quarter towards the text colour so it clears
    AA on both themes;
  - two fields, each named on screen (`Spend cap $`, `Context cap … k tokens`; a blank
    field reads "Settings"), and Set, which sends ONE verb value, so it is one undo;
  - the verb's own answer.
- **Auto's stuck word for a cap is `cap reached`**, parallel to `limit reached`. The first
  word, "the agent reached its own cap", was long enough to push the chat header's
  controls past its frame.

  `Canvas.tsx` passes the verb as a person's door. `useRailModels.ts` hands the meter to
  the model.

## Decisions, and why

- **A door can only tighten, and "tighter" is judged against MAIN's cap in force** (the
  meter's `caps`), not the record alone. A record with no own cap still has a Settings
  cap binding it. Setting an own cap above that would LOOSEN the agent while looking
  like "adding a cap". An uncapped agent can be capped by a door, since any figure is
  tighter than none.
- **The same verb function serves every door.** The Inspector's Set calls
  `capAgent(id, value, 'person')`, the palette's typed line runs the executor as a
  person, and `runAgentPlan` passes `'door'` for the agent and the workflow (M248's
  origin). No second writer can disagree with the verb about the grammar or the rule.
- **Blank is "the Settings cap", and 0 is "no cap".** These are two different settings a
  person makes. The field says "Settings" when blank, so nothing on screen reads as a
  zero that means "unlimited".
- **The lines are main's figures, the fields are the record's.** After a Set the lines
  update when main has re-read the save (M351's hook), so the Inspector never claims a
  cap main is not enforcing yet.

## Checks

- `verify:agent-session cap.plan.1`:
  - a person may set, raise, clear, remove and reset;
  - a door may lower, and may cap an uncapped agent;
  - a door is refused raising, 0, `none`, `default` and a reset, all with
    `CAP_DOOR_REASON`;
  - bad, out-of-range, repeated and set-plus-reset values are refused by name.
- `verify:rail caps.field.1`:
  - "not reported yet — no spend cap" at rest, never $0.00;
  - main's figures against the cap in force, and whose each cap is;
  - a hold's sentence that names the agent's own fix and no setting;
  - the record's figures for the form.
- `verify:verbs` (29/29): the closure checks bind the new doors. `closure.v9.1` runs
  `tc plan cap-agent ch1 5usd` and the node's line against the fixture, and `slices.1`
  sees one owner for `capAgent`.
- `verify:palette` (161/161).
- **The `inspector-caps` scene is a click-through as well as a picture.**
  - It fills the dollars field and clicks Set: the real canvas door, through the real
    verb.
  - It pushes what main sends when a result crosses the cap: the status, the auto run
    stuck with reason `cap`, the run's dropped continuation, and the meter.
  - It asserts the verb's answer (`spend cap $2.00`), the hold's sentence and the stuck
    chip's `cap reached`, and throws otherwise.
  - It dismisses the chip and shoots, then clears the cap through the same door.

  It runs LAST in the sequence, from the fixture with the share off, so no later scene
  inherits its cap, meter or selection. Placed mid-sequence it could not find the chat's
  rail row: the rail had no rows at that point, and `selectRail` misses silently (Owed).

## Gate

`npm run typecheck` is clean. The full `npm run verify` ran in 734.0s: 59/61 suites, and
every red is the baseline.
- `verify:panels:agents`: `template.1` and `detail.1`.
- `verify:panels:product`: `starter.1` and the seven `workflow.*`.

The plain tier was green, including `verify:agent-session` 175/175, `verify:rail`
251/251, `verify:verbs` and `verify:palette`. `verify:visual`, run by hand with
`UPDATE_GOLDENS=1`, wrote two goldens, both judged below: `inspector-caps` (new) and
`palette-query`. Its only red is `starter`, which stays red on purpose.

## Goldens

`inspector-caps` is a new scene, so its golden is new. It was judged by three
fresh-context critics, each handed only the pictures and the intent.

- **Round 1: DEFECT, three fixes sent back.**
  - "the amber auto chip reads 'auto · complete · stuck — the agent reached its own cap',
    and it pushes the next control … past the panel's right border". The word became
    `cap reached`. The header's overflow itself predates M352 and is owed (M356).
  - The amber sentence measured "roughly 4.2:1, … just under the 4.5:1 AA line". It is
    now mixed a quarter towards the text colour.
  - "neither field is labelled Spend or Context, so the pairing depends on the units
    alone". Each field is now named on screen.

  An earlier shot had also shown the chat still counting an auto run
  (`auto · complete · 0/8`) beside a hold, left over from the M97 scene. The scene now
  pushes everything main sends when it holds an agent, not only the meter.
- **Round 2: DEFECT.** The Caps section "matches intent", and the amber measured "about
  5.8:1, which passes AA". One real flaw: "the '$' prefix pushes the spend input about 7
  CSS px right of the context input". Both rows now have a unit slot of the same width.
  - **Recorded disagreement.** Round 2 read the chat's `end?` close control as "a
    destructive 'end this agent' confirmation left pending … most likely a leak". It is
    not. A chat's close reads `end?` whenever its process is alive (`ChatNode.tsx`,
    `armed: alive`). A held agent's process IS alive, because a hold keeps the agent. The
    `chat` golden shows × because its agent is asleep. The intent now says so.
- **Round 3: Matches intent.** "Under COST, the CAPS section shows `Spend $2.10 of
  $2.00 — this agent's cap` and `Context 118k tokens of 150k — Settings cap`, both fully
  legible and unclipped … The heading, the divider rule, the muted-grey labels against
  dark values, and the light bordered rounded Set button all match the COST/RUN/'Open
  review' language … about 5.9:1, which passes AA … Their boxes share the same left and
  right edges … On the chat panel the header holds ⋯, claude, a green `idle` pill,
  auto, Open terminal session, expand and a red-outlined `end?`, all inside the frame.
  Nothing overlaps, and no waiting row appears." It made two notes.
  - The grey `Settings` placeholder is "about 4.3:1". That is the inspector input's
    placeholder colour everywhere (`.inspector__input`), not this section's, so it is
    observed, not changed here.
  - The header's `auto` is the Auto… door, a bordered button, and not the result chip,
    which was dismissed as intended.

`palette-query` changed too, and was not expected to. The new `Cap this agent…` row's
subtitle holds g…r…o…u…p in order, so the fuzzy subsequence filter matches it to
"group" and lists it below the fold. The list is one row longer. A fresh critic, handed
the old and new pictures, answered: "Matches intent … the diffs are sub-pixel
antialiasing jitter on glyph edges only … consistent with the described one-row-longer
list shifting the scroll offset by a fraction of a pixel … No unexplained differences —
no blockers." The other difference it found was the inspector's live `pid`.

## Owed

- **M355 (proposed): the hold as a decision.** A held agent should reach the decision
  queue with "Allow $N more" (the verb, as a person) and "Stop". Today the hold is said
  on the Work tab and in the composer's refusal.
- **The composer does not show a hold until a send is refused.** A chip beside the
  state pill ("held — $2.10 of $2.00") would say it at the rest layer. It belongs with
  M355's decision.
- **M356 (proposed): a resolved auto chip crowds the chat header past its frame.** With a
  stuck or done chip and its dismiss, the header's `auto`, `Open terminal session`,
  maximise and close controls overflow the panel's right edge. The close button becomes
  unreachable. The chip is built to shrink (`flex: 1 1 auto; min-width: 0`) and does not,
  so the header row (PanelFrame's) is not constraining its children. This predates M352:
  any stuck reason does it, and "a permission question went unanswered" is longer than
  the cap's. The scene asserts the chip and then dismisses it, as a person would, rather
  than baking the defect into a golden.
- **`selectRail` fails silently when the dock is not on Panels.** The click returns false
  and nothing throws. Where the rail is not showing, `inspector-detail`'s
  `selectRail('live')` does nothing, and the scene shoots whatever an earlier scene left
  selected. That may well be `live`, but the scene does not make it so. Making the
  helper throw could move that golden, so it is recorded here, not changed.
- **The panels harness has no chat with a live meter**, so the Set click-through is the
  shot scene's. A `verify:panels:agents` check would need a fake agent runtime that
  reads caps, which is M355's harness work too.

Next: M353 (the orchestration scenes wait for their Changes pane, then the two goldens are
re-judged), then M354 (a node's spend survives an app relaunch).
