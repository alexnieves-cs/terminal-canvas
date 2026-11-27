# M700 — Strip bay

**Branch:** `strip-bay` (local, off `main` at f68f720). **Proposal:** the Strip bay design
proposal in the project files (`side-projects-build/redesign/strip-bay/`). **Status:** built,
gate owed. Not pushed; nothing here is on `main`.

## What landed

1. **Fonts and tokens** (d0a7d6d). Instrument Sans (UI) and Geist Mono (code) are bundled
   under `src/renderer/fonts/`, because the CSP is `default-src 'self'`. `tokens.css` loads
   after `styles.css` and holds the redesign's names in both theme blocks: ground, bay, card,
   rules, the five state colours and their text tones, the graphite primary, the strip
   radius and heights, two shadows.
2. **Glass, caps and the cyan accent out of the shell** (9384e46). No `backdrop-filter` in
   the shell, sentence case everywhere it was tracked caps, and selection is graphite instead
   of cyan. The World view keeps its glass and caps; no milestone specs it yet.
3. **The bay** (a7b3a04). The Panels list's rows are strips grouped by state:
   - `panel-state.ts` owns the groups and their labels (`BAY_GROUPS`, `bayGroupOf`), because
     `verify:rail state.2` keeps every state word in that file.
   - Rows report their group to `shell/bay-groups.ts`; the list subscribes only to the
     group version, so a state change re-renders one row and a bell changes one dot
     (check 83's rule).
   - The agent is a shape mark (Claude, Codex, shell, other), read from the terminal's
     `spec.agent` or the chat backend's new optional `mark` (`registry.1` forbids comparing
     backend literals outside the registry).
   - A strip that needs you steps out of line and carries a once-only ask band: Deny and
     Allow once, or Open when the request is high risk, so the queue stays the place a risky
     call is read in full.
   - The selected strip unfolds a sheet: what it is doing, its folder and state, and Pause,
     Hand off and Restart where they apply. The inspector still opens beside it.
   - A task lens dims the strips outside the task instead of regrouping the list.
   - The dock is an icon column by default.
4. **Review** (this commit). Review rows are strips: card, strip radius, done edge for
   finished work, failed edge for a failed check. The page already grouped by task (M605).
5. **Parked panels** (this commit). A dormant panel stays a dashed ghost and now paints on the
   card colour with the strong rule.
6. **Docs** (this commit). The material rule in `docs/product-rules.md`, Brand Commitments in
   `PRODUCT.md`, this log and its milestone row.

## Checks re-pinned (same strictness, new value)

- `verify:styles dock-expand.1` reads `pref ?? false` (was `pref ?? bp === 'wide'`): the
  icon column is the default, and the check still pins that one expression decides it.
- `verify:panels:shell shell.recommendations.2` folds and stores the `needs` group (was
  `agents`), the bay's first group.

No check was skipped or loosened. No golden was written: `UPDATE_GOLDENS=1` waits for the
owner to look at the scenes.

## Not done, on purpose

- **Fleet.** Renaming Sessions to Fleet collides with the unmerged fleet-wall branch (M699)
  and with titles that `verify:rd-l-d` and `demo-smoke` pin. It waits for that branch.
- **Far zoom as strips.** The summary tier's tone wash is pinned by `verify:styles far.1` and
  `verify:panels:core far.1`; it reads well at a fifth of the size, so it stays.
- **Settings regroup and alias cleanup.** The DOM aliases are what roughly two hundred checks
  select on, so they stay; the Settings regroup needs its own spec.
- **Cost on strips.** The metrics rule keeps dollars and tokens out of the rail.
- **Terminal type.** xterm stays at 13/1.2: cell metrics are on the may-not-touch list.

## The numbers (Linux container, 2026-11-27)

- `npm run typecheck`: clean.
- `node scripts/affected.cjs`, plain tier: 73/77. The four failures are the ones `main`
  fails here too (`verify:meta panels-split.2`, `verify:toolbox` 38 and skill.1c,
  `verify:tmux test/api.test.ts`, `verify:rd-l-f rd-l-f.kill.1`).
- `verify:styles` 97/97, `verify:agent-session` 188/188.
- Electron tier: `verify:window` 4/4. The suites that start a PTY cannot load `node-pty`
  here (it ships no Linux prebuild and is not built in this container), so they are owed
  on a Mac, with `npm run verify` as the gate.
- Visual: the web demo build, shot in dark and light. Goldens not regenerated.
