import { LAST_VERSION_KEY } from '../renderer/canvas/splash'

/**
 * Lane N (M565). A visitor is not a new user. The app opens its four-step
 * setup when it has never stamped a version (useShellTail's showOnboarding),
 * and that setup names a workspace and probes agents on a Mac this page does
 * not have. Stamping the version first skips it, and the startup splash
 * still plays, so the first thing a visitor sees is the canvas.
 */
try {
  if (window.localStorage.getItem(LAST_VERSION_KEY) === null) window.localStorage.setItem(LAST_VERSION_KEY, __TC_VERSION__)
} catch { /* storage refused: the setup shows, and Skip setup still works */ }
