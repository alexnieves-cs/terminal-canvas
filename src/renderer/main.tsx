import { createRoot } from 'react-dom/client'
import '@xterm/xterm/css/xterm.css'
import './styles.css'
import { App } from './App'
import { installDropGuard } from './drop-guard'

// Installed before React mounts, and never uninstalled: an unhandled file drop
// navigates the renderer, which kills every PTY in the window. Nothing about
// that is React's concern, so it does not live in a component's effect.
installDropGuard()

const container = document.getElementById('root')
if (!container) throw new Error('#root missing from index.html')

// Deliberately NOT wrapped in StrictMode. StrictMode double-invokes effects in
// development, which for a terminal means spawning a PTY, killing it, and
// spawning it again on every mount. That is exactly the churn we need to be
// able to see clearly while proving out the PTY lifecycle.
createRoot(container).render(<App />)
