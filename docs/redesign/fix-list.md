# Phase 4 fix list

Written on `redesign/main` at `db186caf` (the owner’s `rd-world-fix` point)
after the Linux integration pass. Goldens were not updated. A Mac still has
to look, then run `UPDATE_GOLDENS`.

Checked lanes come from `docs/redesign/ownership.json`. "Lead" means the
integration branch, not a lane's private glob.

## Landed on this VM

| Item | Lane | Files | Acceptance |
|---|---|---|---|
| Shot scenes paint the harness default, which is light, against dark mockups. `rd-workspace`, `rd-arrange`, `rd-settings-keys`, and the World scenes other than `rd-world-transition` never called `theme('dark')`. Before the fix, center luminance was workspace 241, settings 245, flat room 249. | L-B, L-E, W0, W2, W3, W4, W5, W6 | `scripts/shot-scenes/rd-l-b.cjs`, `rd-l-e.cjs`, `rd-w0.cjs`, `rd-w2.cjs`, `rd-w3.cjs`, `rd-w4.cjs`, `rd-w5.cjs`, `rd-w6.cjs` | Landed. Each of those `run` functions calls `theme('dark')` before `shot`. Re-shot: `rd-workspace` and `rd-settings-keys` center luminance 20.9 (center `#10131a`). `rd-world-flat` center `#24272b` (was a white field, luminance 249). |
| `rd-workspace` and `rd-arrange` never called `loadMain`, so a filtered shot captured whatever was already on screen. | L-B | `scripts/shot-scenes/rd-l-b.cjs` | Landed for the load. Both call `loadMain` then `theme('dark')`. The arrange drag, guides, and marquee toolbar are still not driven. That row stays under "Left for a Mac". |

## Left for a Mac, or a product look

| Item | Lane | Files | Acceptance | Why it stays |
|---|---|---|---|---|
| `rd-arrange` does not perform the drag, the smart guides, or the marquee toolbar. The intent string describes that picture. The `run` only captures. | L-B | `scripts/shot-scenes/rd-l-b.cjs` | The capture shows guides and the marquee toolbar, then a person looks before any golden is written. | The gesture script is the lane's shot choreography, not a one-line theme fix. |
| `zoomed-out-dark`, `orchestration-dark`, and `orchestration-working` captured light (mean luminance 232, 209, 199) while their goldens are dark (21, 30, 30). The same run kept `palette-dark` and `kinds-dark` dark (about 19 and 26). | shot harness; F3 owns the clipped Orchestrate segment the dark orchestration scene clicks to leave | `scripts/shot.cjs` | A Mac `verify:visual` of those three scenes is dark, matching the golden's theme, with F1's new dark values on top. | This host's official `verify:visual` died on the 395s watchdog before it could compare. The captures that did finish are real, and these three are not an F1 revaluation. Not changed here. |
| These overlays jumped more than 40 luminance points toward white: `verbs` 144→234, `share-dialog` 146→234, `search` 150→238, `templates` 156→238, `supervisor` 160→238, `chat-copilot` 160→236, `spawn-sheet` 163→240, `palette` 169→238, `shared-offline` 239→196. | L-C for `palette` and `search`. The others are pre-redesign shot scenes. | `scripts/shot.cjs`, L-C palette files if a Mac confirms the palette sheet | A person looks at the diff PNG and either accepts it as F1's light surface or files a lane fix. | A few revalued hexes do not by themselves explain a 70-point jump. Could still be the light sheet. Not "fixed" from this host. |
| Every compared golden differs (77/77 over the pixel or tile budget). `flowchart` and `flowchart-dark` were not painted: the watchdog killed the run first. The 18 `rd-*` scenes that have `run` have no golden (`visual.1`: declared 97, goldens 79). | lead | `verify/visual/goldens/` | After a person has looked, `UPDATE_GOLDENS=1` on a Mac, with one critic sentence per scene already in the ledger. | Mac-only. Not run here. |
| WebGL does not present on this host (R-044, R-053). World shots are the DOM on a field, not the night room. | W1 | none in the repo | Re-shot on a Mac where WebGL presents. Do not debug swiftshader further on Linux. | Already deferred. |
| No `run`: `rd-f1-tones`, `rd-steward-work`, `rd-steward-plan`, `rd-steward-world`, `rd-f3-titlebar`, `rd-f3-pill`. `visual.1` does not demand a golden until `run` exists. | F1, F2, F3 | `scripts/shot-scenes/rd-f1.cjs`, `rd-f2.cjs`, `rd-f3.cjs` | Paint them only if a Mac pass wants those references. | Not a red check. |

## Not on this list

Both plain waves failed the same three checks, all named in the brief as
expected: `verify:meta` `panels-split.2` (tag `pre-v7-run` absent),
`verify:meta` `visual.1` (missing `rd-*` goldens), `verify:first-run`
`revamp.create.1`. `kill.1`, `merge.1`, `verify:canvas-sync`, `verify:relay`,
and `verify:flowchart` did not fail in either run.

Rules review of `pre-redesign` (`7556aeec`) to `db186caf`: no `.panel__*`,
`*-node__*`, or `.shell__*` selector removed. `package.json` version is
`5.0.0`. `verify:world` is 251/251, including `rd-world.parity.1` (no literal
state hex the suite counts). World guard: `WorldView` is a dynamic import
from the entry (`WorldView-*.js`, which pulls `index-*.js` three). The entry
chunk's static import closure does not contain `WebGLRenderer`. No blocker
from that pass.

`rd-world.parity.1` is the suite's rule. Furniture hexes that predate the
redesign and are not in the diff (a whiteboard `TONE` table in
`WorldProps.tsx`, and the same amber on a conflict label in
`WorldStructure.tsx`) are outside this list: the check calls the tree clean.
A later world-guard pass agreed: no blocker, and those two lines are
unchanged since `7556aeec`.

## From the later rules pass

One regression landed with this note. The rest stay, because a check pins
the current words or the change is a look.

| Item | Lane | Files | Acceptance | Why it stays |
|---|---|---|---|---|
| L-B's later `.pf__chrome .pf__verb { opacity: 0 }` beat the rest-rule exemptions, so the skill count and the auto dismiss hid at rest. | L-B | `src/renderer/styles.css`, `scripts/verify-rd-l-b.cjs` | Landed. The exemption is restated after that rule. `rd-l-b.rest.1`. | |
| Splash name and detail are mono. The name is a workspace label. The detail is sometimes a path and sometimes a sentence ("left asleep", "none found", "2 tasks, 3 objects"). `face.1` does not name these classes. | L-A | `src/renderer/styles.css` (`.rd-splash__name`, `.rd-splash__detail`) | A path leaf stays mono. A sentence is `--font-ui`. | Goldens are the check `face.1` names for an unlisted class. Not changed blind. |
| The empty-canvas chip is mono, including "no repository chosen". A real repository name is a path. The helper's comment calls the chip mono. | L-A | `src/renderer/styles.css`, `src/shared/empty-states.ts` | The empty sentence is the UI face. A repository name may stay mono. | The shared comment is the author's choice. A look, not a silent edit. |
| Sessions' empty line is a hardcoded sentence, not `EmptyState` over `empty-states.ts`. | L-D | `src/renderer/sessions/SessionsTable.tsx` | The sentence comes from `empty-states.ts`. | Not a one-line face change. |
| "No shortcut matches that search." is not an `empty-states.ts` sentence. | L-E | `src/renderer/settings/KeyboardPane.tsx` | Same. | Same. |
| "version unknown" sits inside the mono path span. | L-A | `src/renderer/onboarding/Onboarding.tsx` | The path stays mono. The version sentence does not. | Small, left so the path leaf is not split blind. |

Not filed. The reviewer named them; a check or the lane brief already chose the words:

- Sessions says "2 dormant". `rd-sessions.header.1` requires that string. The state word elsewhere is "asleep".
- The world queue says "NEEDS YOU". `rd-w5.queue.1` requires it.
- A duration sits beside the state word. `rd-l-b.header.1` and the L-B brief call that age allowed. D3's text is about Sessions columns and the title-bar dollar, which is why the reviewer disagreed.
- The zoom percent stays at opacity 1 when the readout is `rest`. The seam comment is that decision.
- F1 revalued the canvas grid, the selection border, and a card tone outside the empty `rd:F1` span (`2591c7df`). Moving those rules would change cascade order. Left where they are.
