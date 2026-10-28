// Lane Q (M591). The hosted page's entry. ORDER IS THE CONTRACT, as in lane
// N's demo: `install` sets the globals the preload reads, the preload puts
// `window.canvas` in place (the app's own src/preload/index.ts, its
// `electron` import aliased to the WebSocket), and only then does the
// renderer run, because main.tsx reads `window.canvas` at module scope.
import './install'
import '../preload/index'
import '../renderer/main'
import { hostLink } from './ipc-renderer'
import { answerAsks, bindKeys, watchConnection } from './host-chrome'

answerAsks(hostLink)
bindKeys(hostLink)
watchConnection(hostLink)
// main.tsx has subscribed by now (module scope): the host may run its `did-finish-load`.
hostLink.ready()
