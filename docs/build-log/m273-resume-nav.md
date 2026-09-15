# M273 — Resume & navigation (Wave 4)

## Intent

On reopen, say what is true: purpose, last outcome, open blocker, one next
action. Frame this task / related in one click. Empty canvas stays intent-led.
Search says what it read and what failed.

## What landed

- `resume-summary.ts` — facts only. `pickResumeSubject` prefers working, then
  review, then newest retained, then todo. Absent facts are omitted.
  `ResumeBanner` on the canvas host: Continue frames the item and lights the
  lens; Dismiss is session-scoped and rebuilds on workspace switch.
- Inspector **Show this task** / **Show related** call the existing D08
  verbs. HUD Focus related does the same and returns to the canvas.
- Launcher primary remains folder + intention → Start work; pick-a-kind stays
  under `More ways to start`.
- Search rows: `search.scope` names how many terminals and chats were
  searched; `search.fail.*` names a reader that threw (reason redacted).
