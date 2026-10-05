import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { BloomEffect, EffectComposer, EffectPass, FXAAEffect, RenderPass, ToneMappingEffect, ToneMappingMode } from 'postprocessing'
import { BLOOM, bloomThreshold } from './world-bloom'

/**
 * The World view's bloom (M420): the SECOND importer of `postprocessing`, behind
 * the door CLAUDE.md's library table names. Reached only from the lazily-loaded
 * WorldView, so the library rides the same deferred chunk as three.js and the
 * first chunk pays nothing; `verify:world world.bloom.door.1/.2` pin the
 * importer set and `orch.bloom-door.1` pins it from the other side.
 *
 * The raw library, not `@react-three/postprocessing`, for the reason
 * `orchestration-bloom.tsx` gives (a wrapper whose peer range moved fiber under
 * a working scene) and one more: the wrapper's `<EffectComposer>` takes the
 * render over with its own priority and DPR handling, and this view's governor
 * (`QualityGovernor`) and stats probe are written against fiber's frame loop.
 *
 * Load-bearing, and each fails SILENTLY:
 *
 * (1) **The frame loop keeps its owner.** `useFrame(…, 1)` — a priority above
 *     zero — takes the render away from fiber's automatic `gl.render()` for as
 *     long as this component is mounted, and gives it back the frame it
 *     unmounts. That handover IS the fallback: `WorldView` mounts this only
 *     while bloom RENDERS — the person has it on and the quality tier allows it
 *     (M430, `bloomRenders`) — and without it the scene renders straight to the
 *     screen as it did in M417. A composer driven from a `requestAnimationFrame`
 *     of its own would fight fiber's loop and render twice.
 * (2) **The studio's tone map is ACES, applied once, in this pass.** three
 *     tone-maps only when a material draws to the SCREEN; into the composer's
 *     render target nothing is tone-mapped, so the scene lands in the buffer as
 *     linear HDR and `ToneMappingEffect` applies ACES over it — the same map the
 *     renderer applies with bloom off, which is why the pale slab, desks and
 *     robots measure the SAME pixels either way. (The orchestration ends on
 *     NEUTRAL, and here it was measured: it flattened the cube clusters.) The
 *     renderer's own `toneMapping` is not touched.
 * (3) **ACES comes BEFORE the bloom in the effect list.** The bloom's luminance
 *     pass reads the pass's untouched HDR input whatever the order the shader
 *     chain runs in, so the glow is selected from the HDR scene and ADDED over a
 *     picture that already has its look. Bloom first and tone map last (the
 *     orchestration's order) re-maps the glow: the trim measured as a white line
 *     with no cyan.
 * (4) **`toneMapped={false}` is moot under the composer.** The unlit things —
 *     the ground, the trim, the eyes, the board — are mapped by that ACES too.
 *     The ground is painted as its `acesPreimage` (WorldView), the glowing
 *     materials are scaled past the threshold (`glowScale`), the halo band is
 *     drawn more opaque (`haloShare`) and the board's texture lifted
 *     (`textureLift`) — all from `world-bloom.ts`, all the identity with bloom
 *     off. And the threshold is DERIVED from the ground's pre-image
 *     (`bloomThreshold`): the ground is brighter in the HDR buffer than any
 *     sane glow, and a threshold under it blooms the whole frame to white.
 * (5) **HalfFloat, or there is no HDR.** An 8-bit buffer clamps at 1.0 and a
 *     threshold bloom over it selects nothing.
 * (6) **FXAA, not MSAA.** The canvas's own `antialias: true` does not reach a
 *     render target, so a composer needs its own edge filter. `multisampling: 4`
 *     was measured at +4.7 ms over the plain scene at 5.3 MP (FXAA: +2.2 ms,
 *     the edges read the same); it is its own later pass because it samples its
 *     neighbours and must see the tone-mapped picture.
 * (7) **A pixel-ratio change must resize the composer.** The governor steps the
 *     ratio (through the Canvas's `dpr` prop since M430, which fiber applies
 *     with `setDpr`), which changes the drawing buffer but NOT fiber's
 *     `size` (CSS pixels), so an effect keyed on `size` alone leaves the
 *     composer at the old buffer size — a blurry or offset picture after the
 *     first governor step, with nothing logged. `viewport.dpr` is in the deps.
 * (8) **The pixel budget lowers the ratio, not the bloom** (`bloomDprCap`): the
 *     composer's cost is fill, so a canvas over `BLOOM.maxPixels` is brought
 *     under it. Since M430 the budget is one term of the ratio the view's
 *     `QualityGovernor` reports (WorldView's header, (4c)), applied only while
 *     the bloom renders — this component sets no ratio of its own.
 * (9) **The composer is disposed; the renderer is not.** `composer.dispose()`
 *     frees its buffers and passes and leaves the renderer alone, which is
 *     what `world.door.11` requires (R3F owns the context's life).
 */
export function WorldBloom(): null {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const dpr = useThree((s) => s.viewport.dpr)

  // The pixel budget (BLOOM.maxPixels) is NOT applied here since M430: the
  // view's `QualityGovernor` folds `bloomDprCap` into the one ratio it reports,
  // while the bloom renders. A second writer here fought it — this component's
  // unmount put the display's ratio back over the governor's step, so the tier
  // that dropped the bloom raised the fill.

  const composer = useMemo(() => {
    const next = new EffectComposer(gl, { frameBufferType: THREE.HalfFloatType })
    next.addPass(new RenderPass(scene, camera))
    next.addPass(new EffectPass(
      camera,
      // Tone mapping FIRST, bloom after: the bloom's luminance pass reads the
      // pass's untouched HDR input, whatever order the shader chain runs in, so
      // the glow is selected from the HDR scene and ADDED over a picture that
      // already has the studio's ACES look. (Bloom first, tone map last — the
      // orchestration's order — re-maps the glow, and measured it down to a
      // white line with no cyan.)
      new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC }),
      new BloomEffect({
        luminanceThreshold: bloomThreshold(),
        luminanceSmoothing: BLOOM.smoothing,
        intensity: BLOOM.intensity,
        mipmapBlur: true,
        radius: BLOOM.radius,
        levels: BLOOM.levels
      })
    ))
    // Its own pass: FXAA samples its neighbours (a convolution), and must see the
    // tone-mapped picture, not the HDR one.
    next.addPass(new EffectPass(camera, new FXAAEffect()))
    return next
  }, [gl, scene, camera])

  useEffect(() => () => composer.dispose(), [composer])

  useEffect(() => {
    // `false`: fiber owns the canvas's CSS size.
    composer.setSize(size.width, size.height, false)
  }, [composer, size.width, size.height, dpr])

  useFrame((_, delta) => composer.render(delta), 1)

  return null
}
