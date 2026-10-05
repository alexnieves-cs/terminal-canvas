import { Component, lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type JSX, type ReactNode, type RefObject } from 'react'
import { retryAgentWorld, useAgentIds, useWorldConnection } from './agent-world-store'
import { webglAvailable } from '@renderer/webgl-probe'
import { prefersReducedMotion, worldFits } from './world-perf'
import { useRoster } from './world-roster'
import { FIELD_SELECTOR, OVERLAY_SELECTOR } from './world-select'
import { setWorldOn } from './world-toggle'
import { createWorldTransition, hostLook, WORLD_TRANSITION_MS } from './world-transition'

/**
 * Where the 3D world view stands in for the 2D canvas: the "World view" toggle
 * in the top bar (or `#/world`, or `TC_WORLD=1 npm run dev`) turns `on`, and
 * this component mounts the scene in the canvas's own grid cell, plays the
 * ~1s move between the two, and — the part that is easy to get wrong — takes
 * the scene OUT again when it is done.
 *
 * It is a layer over a canvas that stays mounted, never a replacement for it.
 * Canvas owns every terminal's xterm and PTY, so unmounting it would detach
 * them all and throw away the camera, the selection and every scroll position;
 * what a person sees is the same as a replacement (the canvas fades and settles
 * back as the world rises over it), and the 2D state is simply not touched. The
 * host is `inert` and hidden for as long as the world is up (Canvas does that
 * from the same `on`).
 *
 * Load-bearing, and each fails SILENTLY:
 *
 * (1) **The scene is mounted ONLY while it is showing or leaving.** The R3F
 *     `<Canvas>` owns a WebGL context; left mounted but hidden it keeps
 *     drawing at the display's rate for a view nobody can see, and the page
 *     holds a second context beside the terminals' own. `present` drops to
 *     false the frame the move back settles, which unmounts the scene and lets
 *     R3F lose the context. `verify:world` pins that the layer is rendered
 *     only under `on || present`.
 * (2) **One clock.** The transition object is created here and handed to the
 *     scene; this loop and the scene's frame loop both `sample()` it. Do not
 *     give the scene a `progress` of its own — two integrators drift, and the
 *     fade ends a frame before the dolly.
 * (3) **Inline styles on the host, cleared at rest.** The host's opacity and
 *     scale are written straight onto its element for the move (the move is a
 *     per-frame value, and a React state for it would re-render the whole
 *     canvas 60 times a second); at rest the class Canvas sets owns the look
 *     (`.canvas--behind-world`), so the loop removes every property it wrote.
 *     Leave one behind and the canvas stays scaled or transparent with the
 *     class long gone. They are only opacity and transform — a layout change
 *     here would refit every xterm and SIGWINCH each running agent.
 * (4) **The world is reached through ONE pure-annotated `lazy()`.** A static
 *     import of WorldView, or a missing annotation, ships three.js (+2.2MB) in
 *     the FIRST chunk with no error (`verify:orchestration orch-zoom.3` reads
 *     the built entry). Since M427 Canvas mounts the stage in production too:
 *     the packaged renderer was measured loading the room and the bee's `.glb`
 *     under `file://` (status 200), which is what kept it dev-only before.
 * (5) **WebGL is PROBED before the lazy load** (M430, as Orchestrate's island
 *     does since M293): a scratch context is asked for each time the view
 *     opens, and with none the stage renders its note and never the lazy
 *     `<WorldView>` — so no scene code is fetched and no renderer is made only
 *     to throw. A context LOST while the room is up (`ContextWatch` in
 *     WorldView) lands in the SAME note instead of a frozen last frame. The
 *     probe is `renderer/webgl-probe.ts`, shared with Orchestrate: importing
 *     Orchestrate's own copy would tie this first-chunk file to that module's
 *     whole graph.
 * (6) **No WebGL is not no room** (M431): the probe's no, or a context lost
 *     for good, mounts the FLAT room (`WorldFlat.tsx`, its own lazy chunk,
 *     no three) under the note — every agent as a tile with the same words
 *     and the same doors (answer, open, ask), as Orchestrate's flat SVG
 *     bodies do (M293). The note stays: it says why, and the way back.
 */
const loadWorldView = (): Promise<typeof import('./WorldView')> => import('./WorldView')
const WorldView = /* @__PURE__ */ lazy(async () => ({ default: (await loadWorldView()).WorldView }))
/**
 * (6) The FLAT room (M431), for a machine with no WebGL: its own lazy chunk,
 * plain DOM that imports none of three — so a machine that cannot draw the
 * room fetches the room's words and doors, never the scene. Never imported
 * statically either: the stage is in the first chunk, and the flat room
 * carries the chrome and the card body with it.
 */
const WorldFlat = /* @__PURE__ */ lazy(async () => ({ default: (await import('./WorldFlat')).WorldFlat }))

/**
 * The last answer the WebGL probe gave (M430): the stage asks afresh each time
 * the view opens (a GPU process that came back is worth a second look), and the
 * warm-up below reads the cached answer so a hover does not make a scratch
 * context every time.
 */
let probed: boolean | null = null
function probeWebgl(): boolean {
  probed = webglAvailable()
  return probed
}

/** Fetches the scene's code and models ahead of the toggle, so the first move does not wait on the network. Mounts nothing — and fetches nothing on a machine with no WebGL, where the scene will never load. */
export function warmWorldView(): void {
  if (!(probed ?? probeWebgl())) return
  void loadWorldView()
}

/** A context the browser could not give (no GPU, a lost context) must not blank the app under it. */
class WorldBoundary extends Component<{ children: ReactNode }, { failed: string | null }> {
  state = { failed: null as string | null }
  static getDerivedStateFromError(error: unknown): { failed: string } {
    return { failed: error instanceof Error ? error.message : String(error) }
  }
  render(): ReactNode {
    return this.state.failed === null
      ? this.props.children
      : <p className="world-route__note" role="alert">The world view could not start: {this.state.failed}</p>
  }
}

/** The reduced-motion setting, live: a person may flip it while the view is open. */
function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (listener) => {
      const query = window.matchMedia('(prefers-reduced-motion: reduce)')
      query.addEventListener('change', listener)
      return () => query.removeEventListener('change', listener)
    },
    prefersReducedMotion,
    () => false
  )
}

/** Whether the window is wide enough for the world (`worldFits`), live through a resize. */
function useWorldFits(): boolean {
  return useSyncExternalStore(
    (listener) => {
      window.addEventListener('resize', listener)
      return () => window.removeEventListener('resize', listener)
    },
    () => worldFits(window.innerWidth),
    () => true
  )
}

export function WorldStage({ on, hostRef }: { on: boolean; hostRef: RefObject<HTMLElement | null> }): JSX.Element | null {
  // Mounted from the first frame of the move to the last of the move back.
  const [present, setPresent] = useState(on)
  const layer = useRef<HTMLDivElement>(null)
  // prefers-reduced-motion skips the choreography: the move is a snap (0ms), and
  // the scene drops its stagger and its arrival grow (the `reduced` prop).
  const reduced = useReducedMotion()
  const transition = useMemo(() => createWorldTransition(on ? 1 : 0, reduced ? 0 : WORLD_TRANSITION_MS), [reduced])
  const fits = useWorldFits()
  const agents = useAgentIds().length
  const live = useRoster().length
  const connection = useWorldConnection()
  const [retrying, setRetrying] = useState(false)
  // (5) Asked DURING the render that opens the view: an effect would run after
  // this render had already rendered the lazy view and started its fetch.
  // While it closes, the open's answer stands — a `true` here would mount the scene during the move back.
  // A window too narrow for the room is not asked (it mounts no scene); widening it asks.
  const webgl = useMemo(() => (on && fits ? probeWebgl() : (probed ?? true)), [on, fits])
  // A context lost while the room was up. Each open starts clean (derived from
  // `on` during render, so the reopening render already mounts the scene).
  const [lost, setLost] = useState(false)
  const [openedOn, setOpenedOn] = useState(on)
  if (openedOn !== on) {
    setOpenedOn(on)
    if (on) setLost(false)
  }
  const onRef = useRef(on)
  onRef.current = on
  // Only while the world is on: leaving tears the scene down, and fiber loses its context on purpose then.
  const onLost = useCallback(() => { if (onRef.current) setLost(true) }, [])

  useLayoutEffect(() => {
    if (on) setPresent(true)
    transition.setTarget(on ? 1 : 0, performance.now())
    let raf = 0
    const apply = (): void => {
      const s = transition.sample(performance.now())
      const host = hostRef.current
      const el = layer.current
      if (s.settled) {
        // At rest the classes own the look (see (3)).
        if (host) {
          host.style.removeProperty('opacity')
          host.style.removeProperty('transform')
          host.style.removeProperty('will-change')
        }
        if (el) {
          el.style.removeProperty('opacity')
          el.style.removeProperty('will-change')
        }
        if (s.target === 0) setPresent(false)
        return
      }
      if (host) {
        const look = hostLook(s.eased)
        host.style.opacity = String(look.opacity)
        host.style.transform = `scale(${look.scale})`
        host.style.willChange = 'opacity, transform'
      }
      if (el) {
        el.style.opacity = String(s.eased)
        el.style.willChange = 'opacity'
      }
      raf = requestAnimationFrame(apply)
    }
    // Once SYNCHRONOUSLY, still inside the commit that flipped `on`: Canvas
    // changed the host's class in that same commit, and a frame painted before
    // this ran would show the host snap to its resting look and then fade.
    apply()
    return () => cancelAnimationFrame(raf)
  }, [on, transition, hostRef])

  // Whatever the loop left on the host goes with the stage.
  useEffect(() => () => {
    const host = hostRef.current
    host?.style.removeProperty('opacity')
    host?.style.removeProperty('transform')
    host?.style.removeProperty('will-change')
  }, [hostRef])

  useEffect(() => {
    if (!on) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      // Not `defaultPrevented`: the canvas's own Escape handlers (connector deselect and
      // the rest) preventDefault on every Escape whether or not they use it, so honouring
      // it would leave this key dead — measured, not guessed.
      // Escape in a field cancels the field, and Escape in an open menu or dialog closes
      // that; neither should also drop the person out of the view.
      const target = event.target
      // (M429: the same two selectors WorldChrome's Enter asks — world-select.ts.)
      if (target instanceof HTMLElement && target.closest(FIELD_SELECTOR) !== null) return
      if (document.querySelector(OVERLAY_SELECTOR) !== null) return
      setWorldOn(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [on])

  const retry = (): void => {
    setRetrying(true)
    void retryAgentWorld().finally(() => setRetrying(false))
  }

  if (!on && !present) return null
  // The feed's state over the room, flat or not: lost with its reason and a retry, or empty.
  const feedNote = connection.state === 'lost' ? (
    // The feed's own failure, with the way out. The room stays up under it,
    // showing the last thing it was told — a retry rebuilds the feed and says every agent again.
    <div className="world-route__note world-route__note--stage world-route__note--action" role="alert" data-world-lost>
      <p>The live agent feed disconnected: {connection.reason}</p>
      <button type="button" onClick={retry} disabled={retrying}>{retrying ? 'Retrying…' : 'Retry'}</button>
    </div>
  ) : agents === 0 || live === 0 ? (
    <p className="world-route__note world-route__note--stage" role="status" data-world-empty>
      No live agents. Start one from the canvas.
    </p>
  ) : null
  return (
    <div ref={layer} className="shell__world" role="region" aria-label="World view" inert={!on} data-world-layer data-world-on={on ? '' : undefined}>
      {fits ? (webgl && !lost ? (
        <>
          <WorldBoundary>
            <Suspense fallback={<p className="world-route__note">Loading the world…</p>}>
              <WorldView transition={transition} reduced={reduced} onLost={onLost} />
            </Suspense>
          </WorldBoundary>
          {feedNote}
        </>
      ) : (
        // (5) No scene and no lazy load of it: the machine gave no WebGL context, or took the room's away.
        // (6) The flat room instead, under a strip that says why.
        <div className="world-flat-host" data-world-flat-host>
          <div className="world-route__note world-route__note--flat world-route__note--action" role="alert" data-world-no-webgl={lost ? 'lost' : 'none'}>
            <p>The world view needs WebGL, which this machine is not providing right now. The room is shown flat: every agent at work, and everything the room lets you do.</p>
            {/* A lost context that did not come back by itself (WorldView's LOST_GRACE_MS) may still be given again: a retry remounts the scene with a new one. */}
            {lost ? <button type="button" onClick={() => setLost(false)}>Try again</button> : null}
            <button type="button" onClick={() => setWorldOn(false)}>Back to canvas</button>
          </div>
          <WorldBoundary>
            <Suspense fallback={null}>
              <WorldFlat />
            </Suspense>
          </WorldBoundary>
          {feedNote}
        </div>
      )) : (
        // No scene, no lazy load, no WebGL context: below the width the room is a postage stamp.
        <div className="world-route__note world-route__note--stage world-route__note--action" role="status" data-world-narrow>
          <p>The world view needs a wider window. Widen this one, or go back to the canvas.</p>
          <button type="button" onClick={() => setWorldOn(false)}>Back to canvas</button>
        </div>
      )}
    </div>
  )
}
