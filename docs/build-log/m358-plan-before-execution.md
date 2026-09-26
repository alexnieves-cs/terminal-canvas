# M358 — plan before execution: a plan is read and approved, never granted

**Verdict: shipped.** Arc 2, plan-before-execution. claude in plan mode (`--permission-mode
plan`, the spawn sheet's `plan` row since M120) reads and plans, then ends its plan with ONE
tool call, `ExitPlanMode`, whose input is the plan as Markdown. That call reaches this app
as an ordinary permission request, so allowing it is approving the plan: the CLI leaves
plan mode and starts on it. Before this milestone, the app treated it as any other tool:
- the plan was a JSON-escaped string in a code block;
- the row said `ExitPlanMode · plan`;
- the answers were `Allow once`, `Allow ExitPlanMode for this session` and `Deny`.

A session grant on that tool pre-answered every LATER plan with nobody reading it. That
is the opposite of plan-first, and it was one click away on every plan.

Now:
- **the plan is read as the agent wrote it**: Markdown, in its own scroll, in the chat's
  composer well and in the queue's detail (the Orchestrate board's expanded row is the
  same detail);
- **the answers are `Approve plan` and `Keep planning`**, with no session grant in
  either surface;
- **main refuses a session grant for `ExitPlanMode`** (`approvals.ts`), whatever a
  renderer sends, so a grant can never pre-answer a plan;
- **`Keep planning` tells the agent what to do next**: revise the plan, ask what should
  change if it is unclear, and present it again before starting. A bare "denied" leaves
  the agent guessing.

## What landed

- **`PLAN_TOOL` and `planOf`** (`shared/transcript.ts`): the CLI's tool name, and the
  plan a request carries.
- **`chat/chat-model.ts`**:
  - `approvalAction` returns a `{ plan }` input as prose, whole;
  - `toolArgument` returns the plan's first line without its heading marks;
  - `approvalHeadline('ExitPlanMode')` is "start on this plan";
  - `denyMessageFor(toolName)` gives a plan `KEEP_PLANNING_MESSAGE` and every other tool
    M76's one message. Both deny sites use it (`ChatConversation.answerRequest`,
    `palette-actions/presets.ts answerApproval`).
- **The chat card** (`ChatConversation.tsx`): a plan request is its own block,
  `data-chat-plan`. It holds a sentence, the plan through the chat's `Markdown`, and
  `Approve plan` / `Keep planning`.
- **`ApprovalDetail.tsx`**: the same for the queue and the board, `data-approval-plan`.
  The scope sentence says what each answer does.
- **Styles**: `.chat__plan` and `.approval__plan`, bordered scrolls, so a long plan never
  pushes its answers out of reach.
- **The composer's status line** (`reasonChatPending`) says "claude has a plan waiting —
  approve it or keep planning above", not "allow or deny above".
- **The Needs you popover's scroll stops above its sticky foot**
  (`.dock__popover { scroll-padding-bottom }`). A plan's detail is taller than the
  popover. Scrolled into view, or reached by Tab, its `Approve plan` landed under the
  sticky Notify/Sound foot, painted over. The scene found it: its first scroll put the
  answers exactly there.

## Decisions, and why

- **Approve is allow ONCE, and there is no "for this session" at all.** A plan is
  approved each time one is presented. The renderer does not offer the grant, and main
  refuses it, because M98's grant is keyed by tool name and `preAnswer` would answer the
  next plan before a person saw it.
- **The plan stays a `permission` in the queue, not a new kind.** The answer path, the
  duplicate grouping, the history record and the board's inline detail all stay one
  path. M359 changes the words.
- **The fixture line is constructed, not recorded.** It is the recorded
  `permission.jsonl` request with the tool name and the `{ plan }` input claude documents
  for `ExitPlanMode`. Recording one needs a real plan-mode turn, which is a paid run this
  session does not make. Owed, with the exact shape to confirm.
- **Plan-first is the spawn sheet's `plan` mode, which already existed.** This milestone
  makes its end usable. A per-teammate "always plan first" default is its own decision.

## Checks

- `verify:rail plan.read.1` also pins the composer's status line.
- `verify:agent-session plan.grant.1`:
  - the `ExitPlanMode` line parses as a permission request carrying the plan;
  - main's tracker refuses its session grant while a Bash grant still holds;
  - through the real manager's `preAnswer`, a later plan stays pending and nothing
    answered it.
- `verify:rail plan.read.1`:
  - the plan reads whole as prose;
  - its row argument is its first line;
  - its headline is "start on this plan";
  - its deny asks for the plan again, and every other tool keeps M76's message.
- The `plan-approval` scene, a golden. It asserts:
  - the card's and the detail's answers are exactly `Approve plan, Keep planning`;
  - no session grant is offered;
  - the plan rendered as Markdown (a list);
  - the detail's `Approve plan` is the element painted at its centre (hit-tested).

`npm run verify:visual`: `plan-approval` is a new scene, and every other scene passed
against its golden (the approval scene included, because a tool request's detail is
unchanged).

## Goldens

`plan-approval` is new. The first two written goldens were looked at and fixed before
any critic saw them:
- **The detail's answers were out of view**, under the popover's sticky foot, which led
  to the `scroll-padding-bottom` fix above.
- **The header showed `auto stuck di…`**, owed as M368 above, with the chip dismissed in
  this scene.

The composer's line also said "allow or deny above", and now says the plan's words.

- **Round 1: Matches intent.** "The plan renders as Markdown in its own bordered scroll:
  a bold heading … a numbered list (1–4) with inline code … Two answers sit below:
  'Approve plan' and 'Keep planning' — no 'for session'/'Allow' button anywhere …
  the composer's status line reads: 'claude has a plan waiting — approve it or keep
  planning above.' … [In the popover] 'Approve plan' and 'Keep planning,' then the
  explaining sentence … complete and in view. 'Keep planning' is rendered in red …
  Nothing clipped, overlapping or illegible." The tool wording it saw is the gap
  disclosed as M359.

## Gate

`npm run typecheck` is clean. The full `npm run verify` ran in 718.6s: 59/61 suites, and
every red is the baseline.
- `verify:panels:agents`: `template.1` and `detail.1`.
- `verify:panels:product`: `starter.1` and the seven `workflow.*`.

The plain tier was green, including `verify:agent-session` (`plan.grant.1`),
`verify:rail` (`plan.read.1`) and `verify:styles`.

## Owed

- **Record a real `ExitPlanMode` request** with a plan-mode claude turn, and replace the
  constructed line. Confirm `input.plan` is the whole input, and whether the CLI sends
  any other key.
- **M359: the queue says a plan as a plan** (its blocker, why, next step, affects line
  and the row's summary). Built beside this milestone.
- **M368 (proposed): a narrow chat header with a wider pill.** The `plan-approval`
  scene's first shot showed `auto stuck di…`. Beside the `needs you` pill (about 28px
  wider than `idle`), a 560px chat's resolved chip shrank below its head and its
  dismiss. M356's hit-test covers the `idle` state only. The scene now dismisses the
  chip first, because the chip is left over from the caps scenes and is not part of a
  plan's story.
- **A teammate's "plan first" default.** A chat started from a teammate could open in
  plan mode by default. That is a roster setting with its own door.

Next: M359 (the queue says a plan as a plan).
