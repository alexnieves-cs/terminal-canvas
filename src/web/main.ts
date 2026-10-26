// Lane N (M565). The demo's entry. ORDER IS THE CONTRACT: `install-bridge`
// must evaluate before any renderer module, because main.tsx reads
// `window.canvas` at module scope (the Cmd+N and world subscriptions it
// documents). ES modules evaluate their imports in source order, so the
// bridge exists before the renderer's first line runs.
import './install-bridge'
import './first-visit'
import '../renderer/main'
