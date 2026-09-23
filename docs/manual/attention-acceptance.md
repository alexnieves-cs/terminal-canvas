# Attention acceptance: the scripted beta (daily loop 4.2)

The OS half of attention (notification, dock badge, sound) is on the manual-only
list in `docs/load-bearing.md` because no suite can reach a real `Notification`,
`app.dock` or `shell.beep`. This is the script for a person at a real Mac, so the
check is repeatable and not only "confirmed once". Run it against a packaged build
(`npm run dist`) or `npm run dev`. Record the date, build and result for each step
in the ledger of the run that touched attention.

**Setup.** Grant the app notification permission in System Settings → Notifications.
Open one terminal panel. Leave `Detect the terminal bell` on.

| # | Do | Expect |
|---|---|---|
| 1 | Open the dock's bell (⌘J does nothing yet: the queue is empty). | The popover's title is **Needs you**. Its footer reads **Notify · on** and **Sound · off**: the sound setting is found here without searching. |
| 2 | In the terminal, run `sleep 6; printf '\a'`, then switch to another app before 6 s. | An OS notification titled with the panel's name whose body is **`<name> needs you`**. The dock icon badge reads **1**. No sound, because sound is off. |
| 3 | Click the notification. | The window comes forward and the camera frames that panel (the ⌘J path, not a wake). The badge clears once the panel is focused. |
| 4 | Turn on **Sound · off → on** in the popover. Repeat step 2. | The system alert sound plays, at the user's own sound and volume. The palette's settings list now shows `Play a sound when a panel needs me` on. |
| 5 | Ring two panels while the window is in the background. | The badge reads **2**. The second notification's body is **`<name> needs you · 2 panels need you`**. |
| 6 | Bring the window forward while nothing has been answered. | The command pill at rest reads **2 panels need you**. The first time ever, it also shows **⌘J to jump**. |
| 7 | Press ⌘J twice, then clear both. | Each press frames the next waiting panel. Once the queue is empty, the **⌘J to jump** hint never appears again, even after a later ring. |
| 8 | Turn **Notify** off and repeat step 2. | No notification appears. The badge still counts, because the badge is not gated by that setting. |

A step that fails is a defect to file against the named surface, not a flake:
none of these involve timing beyond the `sleep`.
