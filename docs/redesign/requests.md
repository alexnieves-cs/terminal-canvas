# Foundation change requests

Lanes append here when a frozen file or a file they do not own has to change.
The lead batches these between waves. Do not edit the foundation files yourself.

A request is open until the lead writes `done:` and the commit.

## Template

```
### R-NNN · <one line>
- Lane:
- File:
- Why the contract or the owner cannot absorb it:
- Smallest change:
- Status: open
```

## Open

### R-001 · Wire useAttentionQueue into the pill, the dock and the Sessions count
- Lane: F2
- File: `src/renderer/canvas/CommandPill.tsx`, `src/renderer/shell/Dock.tsx`, `src/renderer/canvas/Canvas.tsx` (the `attentionCount` prop), `src/renderer/sessions/SessionsHost.tsx` (F3 adds the host; L-D lands the count)
- Why the contract or the owner cannot absorb it: F2 owns the queue and the hook, and not those files. The pill and the dock still take a count computed beside the hook (`reachableQueue(...).length` in Canvas, `attention.filter(...).length` in the dock). A second count is the drift the queue exists to stop.
- Smallest change: import `useAttentionQueue` and use `items.length`. Delete the local waiting count. Canvas stops passing its own `attentionCount` when the hotspot owner next touches it.
- Status: open

### R-002 · Export a canvas-wide live-session subscription
- Lane: F2
- File: `src/renderer/session/live-session-store.ts`
- Why the contract or the owner cannot absorb it: the store notifies per panel id. `useAttentionQueue` cannot call `useLiveSession` in a loop whose length is the census. It already reads `getLiveSession` when an agent transition or an approval re-renders it, and it will call `subscribeLiveSessions` the moment that export exists.
- Smallest change: export `subscribeLiveSessions(listener: () => void): () => void` that fires when any panel's cwd or command changes.
- Status: open
