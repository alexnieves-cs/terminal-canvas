# Feel reshape — task stage, create, attention, silhouettes

**Status:** design contract. Implementation is **sequenced** (path B): four milestones under this
one feel document. No new subsystem. Reuse Show related, Fit task, the creation sheet, the
command pill, and the attention set.

**Why:** The machinery of work already exists. The face still reads as an object inventory —
nine equal create doors, Fit all as the zoom habit, “agent” for teammate / chat / session, and
attention said three times at once. This contract makes the canvas feel like *work in
progress*.

---

## Locked decisions

| Topic | Choice |
|---|---|
| Ship shape | Sequenced milestones under one feel contract |
| Empty canvas | Composed strip: **Start work** (primary) · **Ask** (secondary) · **Create…** (tertiary) |
| Create when not empty | One persistent **`+`** opening the same create menu / sheet; kill the permanent 9-pill `NewObjectRow` band |
| Fit task as default camera | Fit task is the **primary** HUD zoom control; Fit all stays reachable (palette / overflow). Turning **Show related** or **Fit task** is the explicit stage entrance — **no soft follow** |
| Stage lighting | **Opt-in, sticky** (B): Show related or Fit task lights the stage; stays until Stop / Escape / clear related. Casual selection does not dim the room |
| Attention | Pill rest + expanded Attention rows are primary; rail dots + dock badge stay secondary; suppress **duplicate in-app** announcements when the pill already says the same thing |
| Silhouettes | Distinct display grammar and naming for teammate · chat · session; stop saying “agent” for all three in chrome. Code/IPC `agent:*` identifiers stay |

---

## Approaches considered

1. **Chrome-only** — copy and CSS, no camera/lens priority change. Rejected: Fit task as the
   default camera and the empty-canvas composition need real control priority, not paint.
2. **Projected feel on existing verbs (chosen)** — change defaults, rest-state priority,
   create chrome, toast gating, and display names. Four sequenced milestones. No new stage
   store, no auto-pan on membership churn.
3. **New `taskStage` subsystem** — unified stage mode with soft follow and a single attention
   channel. Rejected: overbuilds what Show related + Fit task + pill already do; soft follow
   risks camera churn against living sessions.

---

## Feel contract (all four beats)

### 1. Task stage

With the related lens **on** (sticky after Show related or Fit task):

- Unrelated panels dim; the task cluster brightens / rings (existing M204 lens — keep the
  effect, make Fit task a first-class entrance that also lights it when framing).
- The command pill’s rest sentence names the **task** when there is no higher-priority
  attention waiting: the work-item title (one sentence), never a zero statement.
- Rest priority becomes: **attention → task (lens on) → running → selected → empty**.
- Fit task is the primary zoom control in the HUD cluster; Fit all is secondary.
- Fit task frames the active task (lens’s item, else the single selection’s task) — existing
  `fitTaskTarget`. Entering via Fit task also turns the lens on for that task so stage and
  camera agree.
- Exit: lens bar Stop, Escape (existing dismiss), or clearing related — camera is not forced
  back to Fit all.
- Declined: continuous soft-follow when members join; auto-dim on mere selection of a
  task-linked panel.

### 2. Create — one door, not nine

- Remove the permanent nine-pill `NewObjectRow` band from the occupied canvas.
- One `+` (canvas-adjacent, always discoverable) opens the **same** create surface the shell’s
  Create / sheet already uses (M257 / M262 Task | Panel). Do not fork a second menu of nine
  equal pills.
- **Empty canvas** (no panels): replace the nine-pill band with one composed next step:
  - Primary: **Start work** → existing Start work / board-dispatch path
  - Secondary: **Ask** → focus command pill / create supervisor chat (same affordance as
    today’s Ask / first send)
  - Tertiary: **Create…** → the shared create menu
- Palette and agent/workflow doors for create stay; this only collapses the permanent face.
- Four doors for each creatable kind remain satisfied via palette / sheet / agent line /
  workflow — not via nine permanent canvas pills.

### 3. One attention story

- **Primary:** command pill rest when attention > 0, and the expanded Attention list (dock
  popover / pill Jump into the same queue).
- **Secondary:** rail state dots and the dock badge count — keep for glanceability; do not
  add a third competing sentence in the canvas feedback toast when the pill already shows
  attention.
- **Suppress duplicates:** when pill rest is already `attention` with a non-empty sentence,
  do not also `say()` / canvas-feedback a restatement of the same queue fact. The polite live
  region (`useAttentionAnnouncer`) may still name *which* panel arrived (that is not the
  pill’s count sentence). OS notifications when the app is backgrounded stay — the person
  cannot see the pill.
- Copy stops saying “agent” for the queue: prefer **chat** / **session** / the panel’s
  silhouette name (beat 4), e.g. “1 chat needs you”, not “1 agent needs you”.

### 4. Teammate · chat · session silhouettes

Product rule already: a teammate is an identity, a chat is its conversation, a session is its
execution. Make that legible.

| Role | What it is | Display lead | Must not say |
|---|---|---|---|
| **Teammate** | Persistent identity | `Ada` (teammate word) | “agent” as the noun for the roster row |
| **Chat** | Conversation panel | `Ada · api` — identity · place basename | `claude — api (chat)`; leading with backend/model |
| **Session** | Live execution on a chat or agent-terminal | State word / mark (`needs you`, `working`) on that panel | Calling the session a second “agent” beside the chat |

- Backend / model stay in header summary or inspector (provenance), not the identity lead.
- Pill / rail / attention / Go-to rows share one naming helper so they cannot drift.
- Visual grammar: distinct rest chrome — teammate rows in the Teammates pane; chat panels keep
  conversation frame language; a live session mark is on the running surface (edge / state
  tone), not a duplicate “agent” badge that means all three.
- Declined: renaming IPC channels or `kind: 'chat'` / `agent:*` APIs. This is face and copy.

---

## Sequenced milestones

Implement in this order. Each milestone ends green on `npm run verify` (and visual hand-check
where goldens change). Later beats may land as M263+ (numbers assigned at plan time).

| Order | Beat | Primary surfaces | Depends on |
|---|---|---|---|
| **1** | Create collapse + empty composed next step | `NewObjectRow` → `+` / empty strip; shared create open | M257/M262 sheet |
| **2** | Task stage + pill task sentence + Fit task primary | lens entrance via Fit task; `pillRestState`; HUD zoom cluster | M204, M249, M258 |
| **3** | One attention story | pill / dock / toast gating; attention copy | beat 2 pill priority |
| **4** | Silhouettes | `panelName` / pill / rail / attention labels; chrome tokens | beat 3 copy |

---

## Architecture / data

- **No new IPC.** No new panel kind. No new attention store.
- Stage = existing `relatedItemId` lens + existing fit-task target. Fit task turns the lens on
  when it successfully frames a task.
- Pill rest stays pure (`command-pill.ts`) so `verify:pill` can pin the new priority and copy.
- Create `+` invokes the existing sheet / `createObject` path — one executor.
- Naming: one pure display helper (extend `panelName` / teammate-aware chat label) checked in
  plain-node suites (`verify:rail`, `verify:pill`).

## Error / empty / three-state

- No task context: Fit task stays disabled **with named reason** (existing); not removed.
- Empty canvas strip: Start work / Ask disabled with named reasons when their prerequisites
  fail (merged view, no folder, etc.) — same refusal sentences as today.
- Attention empty: pill does not say “0 …”; glyph / next priority only.
- Missing teammate on a chat: lead with place basename or title — never invent a name; never
  fall back to “agent”.

## Verify (contract-level)

Each milestone plan adds scoped check ids. This contract requires at least:

- Empty canvas markup: one composed strip, not nine `data-create-object` pills.
- Occupied canvas: a single create `+` (or equivalent), no permanent nine-pill band.
- `pillRestState`: attention outranks task sentence; task sentence present when lens on and no
  attention; never “0 …”; no “N agents …” in the new copy.
- Fit task primary in HUD; Fit all still reachable.
- Fit task turns lens on; Stop clears dim without requiring Fit all.
- Duplicate attention `say`/feedback suppressed when pill already in attention rest.
- Chat display lead matches `Teammate · place` shape in rail/pill/attention fixtures.

## Out of scope

- Soft-follow camera; auto-stage on every selection.
- Merging teammate / chat / session into one record.
- Renaming `agent:*` IPC or backend adapters.
- New creatable kinds; changing four-doors closure for existing verbs beyond door strings that
  name the pill/HUD.
- Regenerating goldens without a critic sentence per scene.

---

## Product-rules touchpoints (at implement)

When beats land, update `docs/product-rules.md` only where it still pins the old face:

- Command pill rest list (today: “N agents need you” / “N agents running”).
- Any line that still treats the nine-pill band as the create face.
- The teammate / chat / session sentence stays; silhouettes make it true in UI.

---

## Spec self-review

- No TBD placeholders.
- Sequence B matches locked decisions; Fit task entrance agrees with sticky lens (B), not
  always-on (A).
- Scope is four feel beats on existing seams — one contract, four plans later.
- Ambiguities resolved: empty strip = C; create = single `+`; camera = A + light B; stage =
  sticky opt-in; attention duplicate = in-app only; silhouettes = display not IPC.
