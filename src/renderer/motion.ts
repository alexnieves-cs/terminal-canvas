/**
 * Brief #21. THE MOTION SYSTEM, AS ONE SET OF NUMBERS FOR SCRIPT.
 *
 * `styles.css` already runs every transition on a token (`verify:styles
 * motion.2`), but the motion that script drives — Motion's overlays, the
 * zoom-tier ghost, the camera's flights — each wrote its own number, and they
 * had drifted: an overlay settled in 140ms, the stylesheet's surfaces in 160,
 * the tier ghost in 180. Three speeds for one kind of change reads as three
 * kinds of change. The tiers are:
 *
 * - **control** (`--dur-1`) — a press, a hover, a reveal: feedback on the
 *   thing under the pointer. Below the threshold at which it reads as waiting.
 * - **surface** (`--dur-2`) — something ARRIVING or LEAVING: a popover, the
 *   palette, a tier crossfade, a drawer's content. Slightly slower, because a
 *   surface is a bigger change than a control state and the eye has to find it.
 * - **camera** — a discrete jump, `CAMERA_MIN_MS..CAMERA_MAX_MS` by distance
 *   (flight.ts), and ALWAYS interruptible: any wheel, pan-drag or pointer-down
 *   on the canvas cancels it where it is (useViewport.ts).
 *
 * And two rules no number expresses, kept by the code that owns them:
 * dragging and resizing TRACK THE INPUT — no transition, spring or layout
 * animation between the pointer and the thing it moves (`panel-interaction.ts`,
 * `verify:styles motion.track.1`); and a terminal's layout dimensions are
 * never animated to reveal controls — a chromeless frame's chrome is absolutely
 * positioned over the body (CLAUDE.md's frame rule), because a box that
 * collapses refits xterm and SIGWINCHes the agent on every hover.
 *
 * `verify:styles motion.tiers.1` pins these numbers to the stylesheet's
 * tokens, so a change to one without the other is red.
 */
export const MOTION_CONTROL_MS = 90
export const MOTION_SURFACE_MS = 160
export const CAMERA_MIN_MS = 160
export const CAMERA_MAX_MS = 320
/** `--ease`, as Motion's cubic-bezier tuple. */
export const MOTION_EASE: [number, number, number, number] = [0.2, 0.8, 0.2, 1]
