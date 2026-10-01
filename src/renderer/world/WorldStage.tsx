import { Component, lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type JSX, type ReactNode, type RefObject } from 'react'
import { useAgentIds } from './agent-world-store'
import { useRoster } from './world-roster'
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
 * (4) **The world is reached through ONE pure-annotated `lazy()`, and Canvas
 *     mounts this stage only under `import.meta.env.DEV`.** A static import of
 *     WorldView, or a missing annotation, ships three.js (+2.2MB, first chunk)
 *     in production with no error. The same reason the toggle is dev-only: the
 *     `.glb` fetch under `file://` has never been exercised in a packaged build.
 */
const loadWorldView = (): Promise<typeof import('./WorldView')> => import('./WorldView')
const WorldView = /* @__PURE__ */ lazy(async () => ({ default: (await loadWorldView()).WorldView }))

/** Fetches the scene's code and models ahead of the toggle, so the first move does not wait on the network. Mounts nothing. */
export function warmWorldView(): void {
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

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function WorldStage({ on, hostRef }: { on: boolean; hostRef: RefObject<HTMLElement | null> }): JSX.Element | null {
  // Mounted from the first frame of the move to the last of the move back.
  const [present, setPresent] = useState(on)
  const layer = useRef<HTMLDivElement>(null)
  const transition = useMemo(() => createWorldTransition(on ? 1 : 0, prefersReducedMotion() ? 0 : WORLD_TRANSITION_MS), [])
  const agents = useAgentIds().length
  const live = useRoster().length

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
      if (target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable="true"]') !== null) return
      if (document.querySelector('[role="menu"]:not([hidden]), [role="dialog"], [role="listbox"]') !== null) return
      setWorldOn(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [on])

  if (!on && !present) return null
  return (
    <div ref={layer} className="shell__world" role="region" aria-label="World view" inert={!on} data-world-layer data-world-on={on ? '' : undefined}>
      <WorldBoundary>
        <Suspense fallback={<p className="world-route__note">Loading the world…</p>}>
          <WorldView transition={transition} />
        </Suspense>
      </WorldBoundary>
      {agents === 0 ? (
        <p className="world-route__note" data-world-empty>
          No agents yet. Start the app with <code>SIMULATE_AGENTS=true</code> to feed the world a scripted session.
        </p>
      ) : live === 0 ? (
        <p className="world-route__note" data-world-empty>
          No agent is working right now. Idle and finished ones stay on the canvas.
        </p>
      ) : null}
    </div>
  )
}
