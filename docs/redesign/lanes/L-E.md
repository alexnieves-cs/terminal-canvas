# Lane L-E · 08 Settings › Keyboard

- Milestone: M446
- Branch: `rd/l-e-keyboard`
- Wave: 2a (parallel)
- Mockup: [08-settings-keyboard.png](../mockups/08-settings-keyboard.png)
- Checks: `npm run verify:rd-l-e`
- Shot: `rd-settings-keys` (recording "Step into / out of panel"), reference 08
- Decisions: D4, D5

`shortcuts.ts` is frozen once `rd-foundations` is tagged. Build `src/shared/shortcut-overrides.ts` (pure merge + validation). Do not edit the registry. `settings-schema.ts` exists; add a keyboard overrides entry there.

## Goal

The ⌘-gated shortcut map (create, sessions, navigate, mouse). It flags the ⌘K conflict with an agent's own ⌘K, proposes focus lock as the answer, and shows a shortcut being re-recorded inline.

Files. New `src/renderer/settings/` (`SettingsView.tsx` with the left nav General · Appearance · Agents · Sessions & persistence · Keyboard · Integrations · Privacy & export, `KeyboardPane.tsx`, `recorder.ts` pure), new `src/shared/shortcut-overrides.ts` (merges user overrides over the frozen registry), `src/shared/settings-schema.ts` (a keyboard overrides entry), `canvas/palette-actions/settings.ts` (the "Open Settings" row). Main's menu rebuild already follows `settings:changed`.

- Header copy: "Canvas shortcuts always use ⌘ — every bare key belongs to the terminal you're typing in." Search shortcuts · Reset to defaults.
- Groups and scopes come from the registry, with no hand-written list (`rd-keys.settings.1` compares the rendered rows to `shortcuts.ts`).
- Conflict banner: "⌘K is also used by claude to clear the screen. The canvas takes it unless a panel is in focus lock (⌘⇧L)." with a Change… action.
- Re-record inline: "Recording — press the new shortcut, or Esc to cancel." Canvas-scope chords without ⌘ are refused by name. A duplicate within a scope shows the clashing row before saving. Overrides persist and survive a restart, and the menu shows the new accelerator.
- The other settings panes may be thin hosts over existing settings rows for now (each says what it is for — no empty boxes).

## Prompt

Lane L-E (M446): Settings › Keyboard, screen 08, per GUIDE.pdf §7 L-E and D4/D5. `shortcuts.ts` is frozen: build `src/shared/shortcut-overrides.ts` (pure merge + validation: ⌘ required in canvas scope, duplicate detection, alias handling) with checks first, then the Settings shell and the Keyboard pane. The other settings panes may be thin hosts over existing settings rows for now (each says what it is for — no empty boxes). Shot scene `rd-settings-keys` (recording "Step into / out of panel"), reference 08.
