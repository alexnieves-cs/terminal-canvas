import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

/**
 * The reflections the room's glossy things need: the robots' clearcoat shells
 * and visors (WorldRobot) and the black meeting table (WorldOffice). A clearcoat
 * with nothing to reflect is a flat plastic, and drei's `<Environment>` would
 * fetch an HDR from a CDN the renderer's CSP refuses — so `RoomEnvironment` is
 * built in code and prefiltered once per renderer.
 *
 * Its own file because it is shared by two scene files and a component file
 * that exports a non-component breaks React Fast Refresh for it (Vite logs
 * "export is incompatible" and re-evaluates the whole module on every edit).
 * Reached only through the lazily-loaded WorldView (CLAUDE.md's library table):
 * it is one of the three.js importers `verify:world world.door.1` pins.
 *
 * Load-bearing, and fails SILENTLY: set the result on the glossy MATERIALS only,
 * never as `scene.environment` — that would relight the whole office.
 * M448: the night shells turn `envMapIntensity` down on the robot material
 * (WorldRobot) so this bright room does not read as a second light. The
 * environment itself stays the one `RoomEnvironment` built here.
 */
const envs = new WeakMap<THREE.WebGLRenderer, THREE.Texture>()

/** The reflections the clearcoat needs. Built once per renderer. */
export function studioEnv(gl: THREE.WebGLRenderer): THREE.Texture {
  let texture = envs.get(gl)
  if (!texture) {
    const pmrem = new THREE.PMREMGenerator(gl)
    const room = new RoomEnvironment()
    texture = pmrem.fromScene(room, 0.04).texture
    room.dispose()
    pmrem.dispose()
    envs.set(gl, texture)
  }
  return texture
}
