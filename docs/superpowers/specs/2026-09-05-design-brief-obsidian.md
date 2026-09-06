# Design brief amendment — Obsidian (2026-09-05)

Amends `2026-09-02-design-brief.md`. The critic is handed BOTH; where they disagree, this one
is the decision. Everything not named here stands unchanged: one state vocabulary and one hue
per state (§4.1), the state edge (§4.2), identity before provenance (§4.3), one interface
accent that is never an agent colour (§4.5), every control named (§4.6), three states always
(§4.7), the chrome never louder than the well (§4.8), plain copy (§4.9), the system face.

## What changes, and why

The 1.x brief chose flat surfaces, hairlines and no light because the alternative it had seen
was a whiteboard's floating cards. Two runs later the app reads as a well-made instrument and
not as a premium one, and the cause is the same two rules: nothing at rest has depth, and
nothing is lit. Both are amended; the whiteboard is still refused.

**§4 principle 4, amended.** *A LIT EDGE marks a boundary; a hairline is still drawn; ONE
resting lift belongs to the panel frame.* Every surface keeps its `--line`. A surface is now
also a MATERIAL: a panel is glass over a blur (`--glass-1`), the chrome is glass (`--glass-2`),
each with a 1px inner light along its top edge (`--edge-light`). The panel frame carries
`--lift`, a tight, low shadow, and nothing else at rest does — a rail row, a card in a list, a
chip or a section never lifts. `--e-3`/`--e-4` stay the overlays' (palette, popover, drawer).
*Check:* a resting panel has a soft shadow beneath it and a lit top edge; a rail row has neither.

**§5 Colour, "the ground loses the dot grid", amended.** *The ground is a LIT SPACE the camera
moves through.* Two radial lights (`--aura-1`, `--aura-2`) sit under every region — the chrome
being glass, the same light shows through the rail and the top bar — and a third follows the
camera at a fraction of its speed, so a pan reads as movement. Still no dot grid, no vignette.
*Check:* the ground is not one flat colour; there is no repeating pattern on it.

**§4 principle 2, extended.** *The state edge GLOWS.* The 3px edge carries a soft glow in its
tone's tint, doubled at the far tiers; the block tier and the minimap fill with one tint of the
tone (`color-mix`, 26%) so the far view and the map read as a wall of lights. *Check:* at 8% a
working panel is a blue light and a waiting one an amber light, and the minimap agrees.

**§5 Motion, amended.** *Three moments.* The palette arrives (a rise and a scale from 98%); a
panel entering `needs you` breathes once (two cycles, then still on its ring); the camera
flies on its curve. No hover lifts, no other animation. *Check:* nothing on screen moves while
the user does nothing, after the first two seconds.

**§5 The panel frame, extended.** *A bezel.* The chrome row's inner light and a dark line
(`--bezel`) beneath its hairline, over the well, so the terminal reads as a screen set into a
housing. Corners are one step rounder: `--r-lg` 12px on the frame, 8 on controls, 5 on chips.

**A primary control, new.** One filled control per surface, in the interface accent with
`--on-iris` ink: the top bar's New panel, the composer's Send, the pane's Restart, Run again,
Jira's Connect. Never Commit. *Check:* at most one filled control is visible per surface.

**§5 The launcher, amended.** The one place the app is allowed a moment: the wordmark at
`--t-2xl` over a light drawn from the aura, three doors as cards (New panel, Chat with Claude,
Open a file), the rest as the quiet prompt lines, the environment line as the footer.

**§5 The chat, new.** A user turn is a tinted band; a tool's name is a chip; the composer is a
raised field with an iris ring on focus and the filled Send beside a quiet Interrupt.

## Where blur is not paid

`backdrop-filter` composites a layer per element. The panel pays it at the live and card tiers
(bounded by the viewport) and not at the summary and block tiers (unbounded); the HUD and the
palette stay opaque. `verify:styles blur.1` reads the rule.
