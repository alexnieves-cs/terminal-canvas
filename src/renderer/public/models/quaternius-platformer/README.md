# Quaternius — Ultimate Platformer Pack (characters only)

CC0 1.0 Universal. Source: <https://quaternius.itch.io/ultimate-platformer-pack>
(the "Ultimate Platformer Pack - Dec 2021" free download), author @Quaternius.
`LICENSE.txt` beside this file is the pack's own licence text, kept verbatim.

Only the six animated characters are vendored — the prop, platform and nature meshes
of the pack are not here, because nothing needs them yet; re-download the pack if they
are wanted rather than guessing at names.

The pack ships `.gltf` with base64-embedded buffers. These are the same files repacked
as binary `.glb` (JSON chunk + BIN chunk, no re-encoding of mesh or animation data), so
`useGLTF('/models/quaternius-platformer/Character.glb')` fetches one file instead of a
~1 MB base64 string. There are **no external textures**: every material is flat vertex
colour, which is why no `.png` sits beside them.

| File | Meshes | Verts | Animations |
|---|---|---|---|
| `Character.glb` | 11 | 1,895 | 18 (Idle, Walk, Run, Jump, Punch, Wave, Death, …) |
| `Character_Gun.glb` | 15 | 3,530 | 18 (same clip names, armed variant) |
| `Enemy.glb` | 7 | 1,454 | 10 (Idle, Walk, Jump, Dance, Bite_Front, Death, …) |
| `Bee.glb` | 6 | 2,573 | 4 (Flying, Bite_Front, HitRecieve, Death) |
| `Crab.glb` | 4 | 2,450 | 10 |
| `Skull.glb` | 2 | 1,358 | 10 |

Clip names come from the pack and are used as-is — `HitRecieve` is misspelled upstream
and renaming it here would break the next re-download.

These live under `src/renderer/public/` because that is the renderer's Vite root, so this
directory is the one that is actually served (at `/models/...`) in dev and copied into
`out/renderer/` on build. A `public/` at the repository root would be served by nothing.
