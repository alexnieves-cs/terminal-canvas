# Renderer budget, 6.0 draft

Measured on Linux after `npm run build` of `redesign/main` and of tag
`pre-redesign` (`7556aeec`, a worktree at `/tmp/tc-pre`). No source change
came out of this measurement. Sizes are the built files in
`out/renderer/assets`, in kilobytes.

First load is the script `index.html` loads, plus the stylesheet it links.
That script has no static `import` of another chunk. Monaco, the editor
worker, three, and World are dynamic.

| | pre-redesign | redesign/main | delta |
|---|---:|---:|---:|
| Entry JS | 7209 | 7440 | +231 |
| Entry CSS | 711 | 763 | +52 |
| First load (JS + CSS) | 7919 | 8203 | +284 (+3.6%) |
| `WorldView` chunk | 297 | 318 | +21 |
| three chunk (`WebGLRenderer`) | 2152 | 2152 | 0 |
| `editor.api` | 4369 | 4369 | 0 |

`WebGLRenderer` is not in the entry's static closure on either side.
`WorldView` is still a lazy chunk. The entry reaches it through
`__vitePreload(() => import("./WorldView-….js"))`, and that chunk's preload
map names the three chunk. `verify:world` is 251/251, which includes
`orch-zoom.3`'s "three stays out of the first chunk" neighbour in
`verify:orchestration` only when that suite runs; this pass checked the
built bytes directly.

## WebGL contexts

Worst case while the World is up: 8 live terminals + 1 world = 9.

- `LIVE_BUDGET` is 8 in `src/renderer/canvas/lod.ts`. The comment there is
  the reason: browsers drop contexts near 16, so the canvas sits under that.
  `useTiering.ts` refuses a tier map with more than `LIVE_BUDGET` live panels.
- `attachTerminal` in `src/renderer/terminal/create-terminal.ts` takes one
  WebGL context per live terminal. `detachTerminal` disposes it when the
  panel is demoted. A lost context falls back to the DOM renderer and does
  not ask again.
- `WorldStage.tsx` mounts the R3F canvas only while the world is showing or
  leaving, and unmounts it when the move back settles, which releases that
  one context. A probe failure or a context that stays lost mounts
  `WorldFlat` instead, which imports no three.

## world-perf.ts

There is no 20-agent cap in `world-perf.ts`. The card budget is 3
(`CARD_BUDGET`, `world.perf.7`: only the nearest three agents get a full
card). A room of twenty desks is why the desk bodies are one instanced draw
(`WorldOffice.tsx`, pinned by `world.lod.3` / `world.studio.3`), not a limit
on how many agents the room will hold.

## Verdict

Not a regression of the lazy boundary. First load grew 284 KB (3.6%) for the
redesign's screens and CSS. three did not move into the entry, and the three
chunk is the same size. Nothing from this table was added to the fix list.
