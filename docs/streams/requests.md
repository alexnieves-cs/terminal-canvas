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
- Status: done in #53 (B): the six account, share and relay scenes switch the two labs on, and off again after `shared-offline`

### Q-005 · Exact Claude states from claude's own hooks (ownership exception)
- From: G · To: D, E (both finished and resolved)
- File: src/main/pty-manager.ts, src/main/control-protocol.ts, src/main/control-handler.ts, src/cli/** (and the unowned agent-args.ts, agent-state.ts, control-wiring.ts, session-backend.ts, tmux-args.ts)
- Smallest change: a claude panel spawned with the control socket gets a per-spawn secret in `TC_HOOK_SECRET` and `--settings` carrying Notification (questions only), Stop and UserPromptSubmit hooks that run `tc hook waiting|done|busy`. A socket-only `hook` verb applies the matching detector event when panel and secret match (constant-time); `done` is a new event that ends a busy turn at once and leaves wants-you sticky. Under tmux the two values ride `new-session -e` (tmux 3.2+; older tmux gets no hooks), because a tmux pane inherits the server's env, not its client's; the secret is kept per panel so a Cmd+R reattach still matches. Taken by G because D and E are finished, the way lane A took Q-004.
- Status: done (M534, lane G): `verify:borrow hooks.*`.

### Q-006 · `tc view <file|url>` (ownership exception)
- From: G · To: D (finished and resolved)
- File: src/cli/** (and the unowned verb-table.ts, plan.ts, palette-actions/objects.ts and executor.ts, palette/commands.ts)
- Smallest change: `tc view` writes a plan line from verbs that already have four doors: a page is `create-browser`, a picture `image-add`, anything else a new `file-open <absolute path>` verb whose doors are the drop on the canvas, the Open file… row, the agent line and a workflow node. `file-open` joins the teammate's refused verbs (it reads a path the caller names, like `import-docx`).
- Status: done (M535, lane G): `verify:borrow view.*`.
