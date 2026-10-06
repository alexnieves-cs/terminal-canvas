# src/renderer/canvas — the layering rule

The canvas is layered so the math is testable without a browser, and a layer may only import
downward: `viewport.ts` / `canvas-input.ts` / `lod.ts` (pure, plain node) → `useViewport.ts`
(the only place state and math meet; the setter stays private) → `Canvas.tsx` (clipping host,
one transformed world layer, the registry, tier assignment, the one Cmd+C/Cmd+V subscription).
`palette/` and `groups/` follow the same shape. The hooks split out of `Canvas.tsx` each
replace a CONTIGUOUS run of hook calls at exactly their old position — several refs are
created above a block and assigned below it, so re-ordering a call makes a ref read null for
the life of an effect, silently. Each takes one `Deps` object, destructures on entry, and
names the DESTRUCTURED members in dependency arrays — never `deps`, which the caller rebuilds
every render.
