# src/main — the composition root

(Moved from the root CLAUDE.md; loads when working under this directory.)


**`main/index.ts` is a COMPOSITION ROOT, and `main/bootstrap/` is the wiring it composes.**
`index.ts` keeps the single-instance lock, the `open-url` door, the `whenReady` sequence, the
one `registerIpcHandlers` call and the quit sequence — the ORDER, which is the load-bearing
part. Everything a collaborator needs to be built is a `create*` in `main/bootstrap/`, taking
`state` and `stores`. Three rules hold that split up, and each fails silently:
**(1)** every value the startup probe resolves — the login env, the CLI paths, the backend, the
agent runtime, the window — travels as the MUTABLE `MainState` record and is read at the point
of USE. A sub-module that destructures `state` on entry captures the pre-probe placeholder for
the life of the app: agents spawn on launchd's bare PATH and every chat refuses by name, with
no error anywhere (`bootstrap/context.ts`'s header). This is the same rule `Canvas.tsx`'s hooks
follow for `Deps`, for the same reason and in the opposite direction.
**(2)** `createStores`'s declaration ORDER is the order those consts had at module scope, and
three pairs in it close over each other FORWARDS; reordering to resolve a forward reference
turns a working closure into a TDZ throw on the first review or the first spawn.
**(3)** `registerIpcHandlers` is POSITIONAL, every parameter documented "appended last so no
existing positional call site shifts" because `scripts/panels-entry.cjs` and the other Electron
entries construct it the same way. Inserting or reordering an argument re-binds every later one
to the wrong collaborator — a wrong answer on a channel, not a type error.
Three checks read main's window code AS TEXT and name its file: `verify:meta browser.1`,
`verify:electron eneg.4`, and `eneg.3`'s ACCEPTED rows (electronegativity reports by path).
