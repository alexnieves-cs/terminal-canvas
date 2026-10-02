# M417 — a critic pass of the World view against the cortxos references, and the fixes

The first look at the World view against its references since M415/M416 built it: a wide shot
against `docs/reference/cortxos-1.png` and a robot close-up against `cortxos-5.png`, captured from
the real dev app (`TC_WORLD=1`, nine demo agents injected through the store), scored, then the
gaps fixed. Reads the same event store; no contract, schema, IPC or behaviour change outside the
view. Local commit, not pushed. Still dev-only, like M412–M416.

## Step 0 — the reference check

The brief said `docs/reference/` was untracked and that was why `critic.reference.1` was red.
Neither was so: the five frames were already committed (`dfae0547`), and `critic.reference.1`
(verify:meta) was red because the TRACKED Orchestrate reference `docs/design-reference.png` had
been deleted from the working tree — an uncommitted deletion nobody claimed (M415/M416 both
logged it and left it). It is restored from HEAD (`git checkout`), so this commit carries no
change to it; `critic.reference.1` is green. The cortxos frames now have their own pin,
`world.critic.reference.1` (tracked in git's index, not just on disk, and this log scores them).

## The score

Scored 0 (absent or wrong) to 5 (reads as the reference). **Scored by a fresh-context critic**
given the two references and the before/after captures, not by the author; one disagreement noted
below the table. The author's pass found the first four rows' gaps; the critic confirmed them and
found the exit's two faults (fixed, see "The leave").

| Gap | Before → after | What still differs (the critic's words, condensed) |
|---|---|---|
| Robot look (glossy capsule, visor, pill eyes) | 3 → 4 | Heads are spheres with a thin dark silhouette line, not a wide helmet with a flat face plate; most robots stand half-hidden behind desks. |
| Robot colour variety | 1 → 4 | Good spread; the reference's chrome/silver robot has no equivalent. |
| Name pills | 3 → 4 | The reference's pill carries an agent icon; a neighbouring card can cover a pill. |
| Frosted-glass cards | 1 → 3 | No longer dominate the wide shot; still near-opaque white without the reference's warm glow edge; the all-caps title wraps. |
| High-key studio lighting | 3 → 3 | Floor reads mid-grey to the critic (see the disagreement below). |
| RoundedBox slab + cyan trim | 3 → 3 | One slab, one ring of trim; the reference has stepped terraces and walkways, trim on every edge. |
| Black glossy center table | 3 → 3 | Reads matte charcoal; no connection lines over it. |
| Background cube clusters | 2 → 2 | Solid cubes; the reference's are thin textured tiles with pinned labels. |
| Stools | 3 → 3 | Fine, but alone in the corners. |
| Whiteboard | 2 → 2 | Small and a placeholder; the reference's is a large frosted document. |
| Zone labels | 2 → 3 | One quiet "DESK 01"; the reference has one faint word per zone. |
| Overlay chrome (ask pill, Fit room, legend) | 3 → 4 | The dev fps readout is on screen; no "?" button; the legend has no source groups. |

**Disagreement, measured:** the critic scored the lighting unchanged at 3 for a "mid-grey floor".
The open slab in our wide shot samples `rgb(206, 207, 209)`, and the reference's open floor at the
same spot samples `rgb(202, 203, 205)` — the floor's VALUE matches. What differs is the reference's
soft reflections and edge highlights, which belong to the slab/terrace gap above, not to exposure,
so the light was left alone.

**The red dots on most pills in the after-shot are not a colour fault**: they are the QUIET badge
(M415), true of injected agents that have said nothing for 45 s.

## What changed

| Fix | File | Notes |
|---|---|---|
| Ten robot shells, by arrival | `world-palette.ts` (`ROBOT_TINTS`, `robotTint`), `world-scene.ts` (`agentTint(id, order)`) | Eight candy hues plus a white and a graphite, ordered so neighbours are ≥ 60° apart. A robot takes the tint at its place in the store's FIRST-SEEN order (`getAgentIds`, append-only), skipping the board's `world:` pseudo-agent; an id the order lacks gets a well-mixed hash (FNV-1a + murmur3's finaliser). |
| The shell takes the tint as is | `WorldRobot.tsx` | No HSL push: it would make the white robot blue-grey and the graphite one mud. The desk screen and the legend dot read the same `agentTint`; `candyHex` is gone. |
| Three cards, at their robot's scale | `world-perf.ts` (`CARD_BUDGET` 6 → 3, `cardScale`), `WorldCard.tsx`, `styles.css` | Full size at ≥ 110 px per world unit, down to 0.72 (a ~9 px title, the reference's wide-shot card) as the camera pulls back. Written as `--world-scale` on a `.world-card-frame` scaled from its top-left, so the card's own bottom hinge (the stand-up) is untouched. |
| The leave | `world-transition.ts` (`leavePose`, `settleLeavers`), `WorldView.tsx` (`useLeavers`, `heldRoster`), `WorldRobot.tsx`, `WorldOffice.tsx` | A robot whose agent stops being live hops, then sinks through the slab as it shrinks (900 ms); its desk sinks on the same curve; its card lies back and fades on an earlier, straighter line. The room keeps its place in the plan until the leave is over, THEN re-flows. A robot that turns live mid-leave stands back up. Reduced motion: gone at once. |
| A quiet zone sign | `WorldProps.tsx`, `world-palette.ts` (`zoneInk`) | 600/92 px letter-spaced in a mid grey on a sprite ~60% the size; it was 700/118 px in the room's ink — the loudest thing in the wide shot. |
| Legend dot ring | `styles.css` (`--world-dot-ring`, both themes) | The white robot's dot is white on a white bar. |
| Checks | `verify-world.cjs` | `world.critic.reference.1`, `.hue.1–3`, `.card.1–2`, `.leave.1–3`, `.label.1`, `.shell.1`. `world.scene.tint.1` RETIRED (it pinned `colorOf`, the cause); `perf.7` pins three, `perf.8–10` run at an explicit six; `legend.1`, `chrome.1`, `perf.11` follow the new shapes. |

## Why the hues collided (the cause, not the symptom)

`colorOf` is FNV-1a with `h % 360`. FNV-1a's last step is one multiply after the last character's
xor, so ids that differ only in a trailing digit move the hash's low bits in a fixed pattern, and
`% 360` reads exactly those: `demo-0…8` alternate between two hues, `agent-1…6` between 60° and
240°, `a1…a8` between 0° and 175°. A better hash would still collide by the birthday bound
(four robots in ten colours: ~50%), so the tint is a position, not a hash. Nothing on the 2D canvas
paints an AGENT with `colorOf` — it paints owners (`PanelFrame`, the shared placeholders) — so the
old "one colour in both views" promise had no second view behind it. Presence colours are untouched.

## The leave — what the critic caught

The first cut sank the robot while the plan re-flowed without it at once. Nine workers wrap the
arc and eight do not, so the slab shrank and every other desk slid under the sinking robot. The
critic read that as "the camera refits" and the whole leave as a glitch. The camera never moved;
the room did. And the card rode the body's cubic: full until ~650 ms, then gone in a few frames.
Both fixed (above): the plan holds the leaver, and the card has its own fade.

Two traps, each of which would have shipped silently:

- **React keys are per array.** Rendering the leavers as a second `.map` beside the live ones
  remounts the robot the frame it leaves — a fresh instance that GROWS IN. One array.
- **Deriving the leavers in an effect** commits the unmount first, with the same result. They are
  derived during render (`setState` during render, the derived-state pattern) and settle by
  identity (`settleLeavers` returns the same map when nothing moved).

## Measured (real Electron dev window, M1 Pro, CDP; nine agents injected through the store)

- 1200×800: 144 fps (the display's cap), 276–302 calls, 114–127k tris.
- Emulated 3200×2000 at 2× (a 5327×3402 canvas, 18 MP): **94–98 fps**; M416 measured 80–89 at the
  same size with six full cards — the backdrop-blurred cards were part of the fill cost.
- **Base M1 is not measured** (this machine is an M1 Pro). A base M1's GPU has half the cores;
  halving the 18 MP figure gives ~47–49 fps at that extreme size, and a typical retina window
  (~5 MP) has far more headroom. Below 40 fps the down-only DPR governor (M414) steps the ratio
  down. "60 fps on M1" is an estimate, stated as one.
- Console after a toggle out and back in: only R3F's pre-existing `THREE.Clock` notice.
- A robot set idle and live again 400 ms later stands back up at full opacity.
- Harness note: a dev window launched in the background opens the room at the dolly's FAR pose
  (the opening shot's frames never ran); "Fit room" or a toggle frames it. Not a regression — M415
  recorded the same rAF-stops-when-hidden trap.

## The gate

`npm run verify`: the plain tier is 50/51. The one red is `verify:first-run` `revamp.create.1`,
the known baseline red, also red on HEAD. Because of it the runner stops after wave 1, so the build
and the Electron tier were run by hand with the runner's own selection. The build passes. Of the
Electron suites, `pty`, `pty-manager`, `window`, `canvas`, `xterm`, `panels:core`, `panels:kinds`,
`panels:product`, `panels:orchestrate` and `panels:flowchart` pass. Three are red: `verify:ipc` 1,
`panels:shell` 95/95b/95c/96 and `panels:agents` `template.1`. All three are **red with the same
checks on HEAD with this change stashed** (rebuilt and re-run), so this change does not cause them.
`verify:world` is 126/126 and `verify:meta` 52/52, `critic.reference.1` included.

## Owed

- The critic's three biggest remaining gaps, in its order: **the room's shape** (terraced,
  near-white, reflective slabs with walkways; trim on every edge), **set dressing that carries
  information** (labelled tiles, a real document board, links over the table), and **the cards**
  (translucent glass with a warm edge, one strong title line). Each is a pass of its own.
- The dev fps readout should not be in a shipped World view (it is dev-only today).
- Base-M1 fps, measured on a base M1.
- The pill still posts to the board only (M416's owed item); the packaged build is still unmeasured.
