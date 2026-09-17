/**
 * The bloom door: the ONE module that imports `postprocessing`.
 *
 * Nothing else in the renderer may reach the library — the confinement is the
 * same rule every row of CLAUDE.md's library table carries, and here it also
 * buys the bundle: this module is reached only from OrchestrationCubes.tsx,
 * which is itself `lazy()`-loaded, so `postprocessing` rides the same deferred
 * chunk as three.js and costs the FIRST chunk nothing. A static import from
 * anything Canvas.tsx reaches undoes that silently — the same trap measured at
 * +2.2MB when the three.js import was static.
 *
 * Why the raw library and not `@react-three/postprocessing`: that wrapper peers
 * on `@react-three/fiber >= 9.7.0` and this app is on 9.4.0, so the convenience
 * would have cost a fiber bump underneath a diorama that already works. The
 * hand-built composer is ~40 lines and needs no wrapper.
 *
 * Four things here are load-bearing and each fails SILENTLY:
 *
 * (1) **Demand mode survives.** `useFrame(…, 1)` — a priority >= 1 — takes the
 *     render away from fiber's automatic `gl.render()`, and in `frameloop=
 *     "demand"` the callback still runs only on invalidated frames. So the
 *     idle ring keeps rendering NOTHING between React updates, which is the
 *     whole point of OrchestrationCubes' per-cube re-arm logic. A composer
 *     driven from a `requestAnimationFrame` of its own would quietly restore
 *     the 60fps repaint that demand mode was introduced to kill.
 *
 * (2) **Tone mapping moves to the END of the chain.** The renderer's own
 *     toneMapping is applied when the RenderPass draws, which CLAMPS every
 *     value to 1.0 before the bloom pass ever reads it — emissive intensity
 *     above the threshold would be tone-mapped away and bloom would appear to
 *     "do nothing", with no error anywhere. So the renderer is set to
 *     NoToneMapping while this component is mounted and ACES is re-applied as
 *     the last effect, over the HDR buffer. The previous value is restored on
 *     unmount, because the renderer outlives this component.
 *
 * (3) **The half-float frame buffer is what makes it HDR at all.** The default
 *     8-bit buffer cannot hold a value above 1.0, so a threshold-driven bloom
 *     over it selects nothing.
 *
 * (4) **Clear alpha stays 0.** This canvas is transparent glass sandwiched
 *     between the SVG ground layer and the SVG overlay (see OrchestrationCubes'
 *     header). A composer that clears to opaque black would hide the ground
 *     rings and edges underneath it — the stage would look "fixed" in a dark
 *     theme and obviously broken in a light one.
 *
 * Bloom is threshold-driven rather than a `SelectiveBloomEffect` selection set:
 * the scene already expresses state as emissive intensity (working/needs-you
 * push past 1.0, idle sits under it), so luminance IS the selection, and there
 * is no per-frame selection list to keep in sync with React's node list.
 */
import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import {
  BloomEffect,
  EffectComposer,
  EffectPass,
  RenderPass,
  ToneMappingEffect,
  ToneMappingMode,
} from 'postprocessing'

export interface OrchestrationBloomProps {
  /** Luminance above which a pixel blooms. The emissive tiers straddle this. */
  threshold?: number
  /** How hard the bloom reads. */
  intensity?: number
}

export function OrchestrationBloom({ threshold = 0.62, intensity = 1.5 }: OrchestrationBloomProps): null {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const invalidate = useThree((s) => s.invalidate)

  const composer = useMemo(() => {
    // HalfFloat: an 8-bit buffer clamps at 1.0 and a threshold-driven bloom
    // over it selects nothing. See (3).
    const next = new EffectComposer(gl, { frameBufferType: THREE.HalfFloatType })
    next.addPass(new RenderPass(scene, camera))
    next.addPass(new EffectPass(
      camera,
      new BloomEffect({
        luminanceThreshold: threshold,
        luminanceSmoothing: 0.22,
        intensity,
        mipmapBlur: true,
        radius: 0.72,
      }),
      // At the end, over the HDR buffer — NOT on the renderer, which would clamp
      // before bloom ever ran. See (2).
      //
      // NEUTRAL (Khronos PBR Neutral), not ACES_FILMIC: ACES desaturates
      // highlights BY DESIGN, and with tone mapping moved to the end of the
      // chain the brightly-lit cube faces land squarely in that range — the
      // working ring went white while only the most saturated roles (the
      // watcher's violet, needs-you amber) kept any hue, which reads as "tone
      // overrode role". Neutral is built to hold saturation into the highlights,
      // which is the whole point of colouring a cube by its role.
      new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL }),
    ))
    return next
  }, [gl, scene, camera, threshold, intensity])

  useEffect(() => () => composer.dispose(), [composer])

  // (2) and (4): the renderer outlives this component, so both settings are
  // captured and restored rather than assigned once.
  useEffect(() => {
    const priorToneMapping = gl.toneMapping
    const priorClearAlpha = gl.getClearAlpha()
    gl.toneMapping = THREE.NoToneMapping
    gl.setClearAlpha(0)
    invalidate()
    return () => {
      gl.toneMapping = priorToneMapping
      gl.setClearAlpha(priorClearAlpha)
    }
  }, [gl, invalidate])

  useEffect(() => {
    composer.setSize(size.width, size.height)
    // A resize has to repaint, or demand mode leaves a stale buffer on the
    // glass until something else happens to invalidate.
    invalidate()
  }, [composer, size.width, size.height, invalidate])

  // Priority 1 takes the render from fiber. See (1).
  useFrame(() => composer.render(), 1)

  return null
}
