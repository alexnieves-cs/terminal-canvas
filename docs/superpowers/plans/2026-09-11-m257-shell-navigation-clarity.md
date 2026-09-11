# M257 — shell and navigator clarity: plan

Spec: `docs/superpowers/specs/2026-09-11-m257-shell-navigation-clarity.md`.

1. RED: update `verify:styles`'s rail and dock contracts and add
   `shell.recommendations.1` for top-bar copy, View ownership, grouped dock destinations,
   filters, collapsible headings and contextual marks.
2. GREEN: implement the top bar, dock, navigator rows and persisted collapsed groups without
   renaming established DOM aliases.
3. Run `npm run affected`, then the full `npm run verify`.
4. Run the visual and packaged gates. Inspect every changed scene before recording a golden
   sentence; never update goldens blindly.
5. Record evidence and any owed manual checks in the build log.
