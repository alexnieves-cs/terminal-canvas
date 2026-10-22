# Streams run: cross-lane requests

Append a request when you need a file another lane owns. One entry each; the
owning lane answers by landing it or saying why not, and edits the status.

Format:

```
### Q-001 · <what you need>
- From: <lane> · To: <lane>
- File: <path>
- Smallest change: <one or two sentences>
- Status: done (M481, lane C): the merge and the ahead count take the checked sha; `verify:review` merge.4 lands a commit between the check and the merge and shows it stays unmerged.
```

### Q-001 · Accept merges the commit it checked, not the branch name
- From: D · To: C
- File: src/main/lane-merge.ts
- Smallest change: `createLaneMerger` compares `rev-parse HEAD` with `expectHead`, then runs `git merge <branch>`. A commit an agent lands between the two is merged unread. Merge the checked sha (`laneHead`), keeping the branch name in the message, or check `<merge>^2 == expectHead` after. Found by M488's critic; the MCP `accept_review` and the card's Accept share it.
- Status: open

### Q-002 · `tc tonight` as a short form of `tc plan tonight`
- From: C · To: D
- File: src/cli/** (the `tc` argument parser)
- Smallest change: map `tc tonight [stop]` to the existing `tc plan tonight [stop]` line (M480's verb, already bound by `buildPlan` and refused to a teammate caller in plan.ts). No new channel; the agent door already works through `tc plan`.
- Status: open

### Q-003 · Shot scenes of a hidden surface switch its lab on first
- From: E · To: B
- File: scripts/shot-scenes/** (and scripts/shot.cjs if a seed is simpler)
- Smallest change: M496 hides six surfaces behind `labs.*` settings, off by default; World stays shown (docs/streams/cut-list.md). A scene that shows a hidden one (`relay`, `share-*`, `team-ask`, `memory`, or an account menu with nobody signed in) calls `window.canvas.settings.set('labs.<id>', true)` before it frames, the way scenes already set `shell.inspectorOpen`. The World scenes need nothing.
- Status: open

### Q-004 · `relay.bp.2` sizes its stall in fixed megabytes, which Linux's socket buffers swallow
- From: A · To: D
- File: scripts/verify-relay.cjs
- Smallest change: the backpressure block pumps a fixed 5 MB (`n = 320` chunks of 16 KB) past a paused viewer. The relay only marks a viewer lagging once the kernel stops taking its bytes and its queue passes HIGH, then the viewer must fall a ring (1 MB) further for a resync. A Linux loopback absorbed about 3.7 MB, so the viewer never lagged far enough: bp.2 fails 5 of 5 there and flaked once on the Mac gate (PR #54). Measure what the loopback absorbs first and size the stream at twice that plus HIGH plus twice the ring (never under 5 MB), with the two waits scaled to the stream. The check's condition is unchanged. A ready patch, 5 of 5 green on Linux: /mnt/project-files/notes/stream-a/relay-bp2-fix.patch.
- Status: open

### Q-005 · The lit orchestration connector's reduced-motion stand-down loses on source order
- From: A · To: F (or whichever lane owns orchestration CSS)
- File: src/renderer/styles.css
- Smallest change: the reduced-motion block near `.canvas--behind-orch` sets `.orch__connector--lit { animation: none; }`, but the base rule `.orch__connector--lit { … animation: edge-current … }` comes later at the same specificity, so it wins and the lit connector still animates under reduced motion (only the global block's `.01ms` keeps it invisible). Re-state `@media (prefers-reduced-motion: reduce) { .orch__connector--lit { animation: none; } }` from inside your `st:` block. Found by `verify:panels:orchestrate` orch-parity.app.3, which now counts only animations with a visible duration (M458).
- Status: open
