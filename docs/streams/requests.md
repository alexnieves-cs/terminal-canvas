# Streams run: cross-lane requests

Append a request when you need a file another lane owns. One entry each; the
owning lane answers by landing it or saying why not, and edits the status.

Format:

```
### Q-001 · <what you need>
- From: <lane> · To: <lane>
- File: <path>
- Smallest change: <one or two sentences>
- Status: open
```

### Q-001 · Accept merges the commit it checked, not the branch name
- From: D · To: C
- File: src/main/lane-merge.ts
- Smallest change: `createLaneMerger` compares `rev-parse HEAD` with `expectHead`, then runs `git merge <branch>`. A commit an agent lands between the two is merged unread. Merge the checked sha (`laneHead`), keeping the branch name in the message, or check `<merge>^2 == expectHead` after. Found by M488's critic; the MCP `accept_review` and the card's Accept share it.
- Status: open
