# M203 plan — Show this task

Spec: [2026-09-10-m203-show-this-task.md](../specs/2026-09-10-m203-show-this-task.md).

1. **Red first, pure.** Add `task.members.1–.5` and `task.show.target.1` to `verify-groups.cjs`,
   export `task-members.ts` from `groups-entry.cjs`, and watch the suite fail on the missing module.
2. **The module.** `src/renderer/canvas/task-members.ts`: `taskMembership`, `tasksOfPanel`,
   `showTaskTarget`. Pure — types from `panels.ts`/`work-items.ts`, `insideDirectory` from
   `@shared/work-scope`. Suite green.
3. **The camera.** `useViewport.frameRects(rects)` = `jump(fitTo(rects, size))`.
4. **The verb.** `verb-table.ts` row + `V9_DOORS`; `PaletteActions.showTask`; the executor arm;
   the `task.show` palette row, disabled by name with nothing selected. `verify:verbs` green.
5. **The canvas door.** `Show` on `WorkNode`'s verb row, through the same member.
6. **Real renderer.** `task.show.1` in `verify-panels-product.cjs`; re-measure the watchdog.
7. `npm run verify`; critic; build-log entry.
