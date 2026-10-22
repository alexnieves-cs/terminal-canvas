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
