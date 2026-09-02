# Terminal Canvas 1.0 — what a complete release contains, and what it does not

> **What this document is.** The decision record for taking the app from beta
> `v0.1.0` to `1.0.0`: which of the backlog's seventy-odd entries a complete 1.0
> actually needs, which are cut and why, and the milestone sequence that
> delivers the kept ones. It sits beside the milestone specifications because
> it is the argument they are all answering to. Nothing here changes the
> repository's method — each milestone below still gets its own design spec,
> its own plan, and check-first tasks.

**Status:** decided 2026-09-01. Milestones M36–M50. The build log in
`docs/build-log/` records progress against this plan; where the plan changes
mid-run, this file is amended and the amendment is dated.

**The number this starts from is M36**, taken from the milestone table after
its repair (see `docs/build-log/00-reconciliation.md`). Nothing below reuses a
number the table already holds.

---

## 1. What "1.0" has to mean here

The author's brief names eight properties, and each one is an obligation this
plan has to discharge rather than a theme to gesture at:

1. **Nothing a user can reach is a dead end.** Every surface finished; every
   affordance that cannot work is present and disabled with a named reason.
2. **A first run teaches the app.** A stranger reaches a working panel running
   their agent CLI and learns the canvas, panels, workspaces and the palette
   without the README.
3. **One considered design.** A real type scale, a real spacing system, light
   and dark themes that follow the system, an icon set, hittable targets,
   purposeful motion that honours reduced-motion.
4. **A coherent feature set.** Decided against the backlog, in writing.
5. **Real accessibility.** Keyboard reach, visible focus, screen-reader
   semantics on the chrome, measured contrast — and an honest statement of
   what the terminal panels themselves cannot offer.
6. **`npm run verify` green, and meaning more.** New behaviour gets checks in
   the existing suites; the manual-only list gets shorter.
7. **Documentation that matches the software.**
8. **It ships.** `1.0.0`, an icon, a launchable `.app` and `.dmg`,
   `verify:packaged` green, honest Gatekeeper instructions.

Two facts about the starting point shape the plan more than any feature:

- **There is no dark theme.** The stylesheet's only theme block is the
  "soft machine" light repaint (`color-scheme: light`), selected by both
  `:root` and `:root[data-theme="dark"]`, and nothing in the renderer sets the
  attribute or reads `prefers-color-scheme`. The terminal's palette is a
  separate object in `create-terminal.ts`. "Both themes honouring the system
  setting" is therefore a build, not a switch.
- **`npm run verify` was red on `main`** when this run started (one check,
  `verify:panels` 143, stale against M26). The first milestone makes it green
  before anything else is claimed.

---

## 2. The author's instinct, and where this plan departs from it

The brief names the entries "nearest the center": search across panels and the
durable scrollback it is gated on, attention that reaches outside the window, a
keyboard-first and accessible canvas, camera bookmarks and camera undo, panel
typography, placement and snapping, semantic-zoom cards, first run, and export.

**Every one of those is in.** The departures are additions and narrowings, not
removals:

- **Added: a hardening milestone first (M36).** Three defects the backlog
  records as defects rather than features — Unicode 11 widths (#43), a runaway
  panel with no byte cap (#58), and the `onContextPasted` inline arrow that
  defeats every terminal panel's memo (#77) — plus the Jira result types
  declared twice (#12) and the red check. A 1.0 that ships known defects to
  make room for features has its priorities inverted.
- **Added: the interface architecture (M41).** The unbuilt design spec that
  calls itself "M23" measured the shell and found the canvas has half the
  window on a laptop, two side regions describe one panel, and the inspector
  interleaves four refresh rhythms in one scroll. "Reads as a product" is
  partly a visual-language problem and partly a where-things-go problem, and
  the second half is that spec. It is adopted with amendments, under a new
  number, rather than re-derived.
- **Narrowed: export.** A panel's output as text and the canvas as a PNG,
  through a save dialog. No region export (it would silently promote panels to
  make itself prettier, or composite cards with live pixels), and no
  canvas-native shareable artifact (most of multiplayer's data model, none of
  its customers).
- **Narrowed: search.** A hit moves the camera to the panel and highlights the
  matching line in the result list. It does not scroll a live terminal to the
  match — a real side effect on a running session, and the backlog's own open
  question, answered conservatively.
- **Narrowed: durable scrollback.** A capped, per-panel, main-side log written
  from the existing flush, on by default with a setting to turn it off and a
  verb to clear it. The consumers are the restored card's tail, search, and
  text export. It is never replayed into a live terminal: a TUI's escape
  sequences replayed into a fresh xterm before the process starts is an
  emulator problem, and the log's value is in reading, not in restoring.
- **Widened: attention.** The OS notification and the dock badge the brief
  implies, plus the system alert sound (#37) — the one channel that works when
  the window is behind something else, and it needs no asset because
  Electron's `shell.beep()` plays the system sound. Off by default.

---

## 3. Every backlog entry, decided

Read alongside `docs/ideas-backlog.md`. "In" names the milestone; "cut" gives
the reason, which is the part that has to survive. Entries the backlog already
lists as gone are not repeated.

| # | Entry | Decision |
|---|---|---|
| 4 | Multiplayer / shared canvas | **Cut.** A sync protocol or SSH-plus-tmux multiplexing. A 1.0 for one person on one machine has no customer for it, and the trust boundary it opens deserves its own design pass. |
| 8 | Chat box and model choice | **Cut, both remaining parts.** M33 already made Codex a second `AgentKind`; the per-agent capability table stays unbuilt until a third vendor wants it. A native chat panel talks to an API through main and is a fifth panel kind with none of the terminal's invariants — a different product's feature. |
| 9 | Integrations / super-app | **Cut.** Jira is the one integration a 1.0 ships. GitHub as a second reference implementation is where the shared surface would be derived, and deriving it from one is guessing. |
| 10 | Light / dark mode | **In — M40.** Both themes, following the system by default, with the xterm palette fanned across the registry. |
| 12 | Jira leftovers | **Partly in.** The three result types declared twice → one declaration, **M36**. Server/DC, OAuth 3LO and a second provider: **cut** — each is a different auth story or an abstraction with one customer. |
| 13 | Drop an image into a session | **In, the handoff half — M49.** A file dropped ON a terminal panel pastes its path to the agent (through `paste()`, never `write()`); a file dropped on the canvas still mints a file panel. The drop target disambiguates. Clipboard-image paste: **cut** (temp-file lifecycle). |
| 14 | Panels that are other apps, tiers 2–4 | **Cut.** Spreadsheets need a rendering library; web panels collide with the world transform; native windows are a "no" the entry already records. |
| 15 | Annotation layer | **Cut.** Notes (M27) cover the text case. Ink and panel-anchored highlights need the input-arbitration decision the entry names as its real cost, and nothing in a 1.0 depends on them. |
| 16 | Search across every panel | **In — M46.** Gated on M45. |
| 17 | Attention outside the window | **In — M37.** OS notification and dock badge. |
| 19 | Accounting leftovers | **Partly in.** Canvas-wide token/dollar totals in the no-selection summary, **M41**. History and retention, a Codex transcript adapter, the un-pinned panel: **cut** — a retention store, an adapter with no request, and a guess that blames the wrong agent. |
| 20 | Two windows, one canvas | **Cut.** The registry is per page and `LIVE_BUDGET` is per renderer against a per-process WebGL cliff; the honest tier (a second window on a different workspace) needs the budget to become an app fact, which is a main-process redesign. |
| 22 | Semantic zoom | **In — M42.** Three render tiers with hysteresis, below tiering, from `Panel` facts only. |
| 23 | Focus mode | **In, zoom-to-fit half — M38.** The maximise half is **cut**: a layout mutation with a restore rect that a user can already perform with the resize handle, and the budget question it opens ("does focus pin only this panel live") has no good default. |
| 24 | Links, leftovers | **Cut.** Link selection, routing around panels, persisted port sides, culling, cross-workspace rendering — each recorded as a decision in the entry; none is a dead end a user meets. |
| 25 | Placement: snapping, guides, tidy | **In — M43.** Screen-space snap threshold divided by scale; tidy as one undoable step that compacts without reordering. |
| 26 | Toolbox leftovers | **Cut.** The cross-panel capability query, the editing half, plugin walking, a path-keyed watcher — the read-only inventory is the 1.0 surface; a one-click editor for hooks and permissions is a different risk posture. |
| 27 | Prompt placeholders | **Cut.** `{{cwd}}` needs main's live cwd and `{{selection}}` needs the renderer's; expanding a project prompt makes the same file behave differently inside the app than outside it, which the read-only decision exists to prevent. |
| 28 | Accounts | **Cut.** Sync's conflict story is unresolved and the local path must stay first-class; no 1.0 customer. |
| 30 | Durable scrollback | **In — M45.** |
| 31 | Secrets in agent output (standing rule) | **In — M45 and M48.** A pattern-based scrubber applied to everything that leaves the machine (text export, the diagnostics bundle); the local log is marked in the settings description, never redacted; the live terminal is never touched. |
| 32 | Keyboard-first canvas and accessibility | **In — M39.** |
| 33 | Minimap | **Cut.** Semantic zoom (M42), bookmarks and camera undo (M38) together make "where am I" a zoom-out and a keystroke; a minimap is the first chrome to compete with the capture-phase wheel listener, and the entry's own question — does #22 make it redundant — is answered yes by building #22. |
| 34 | Presets: env overrides, template sets | **Cut.** Environment overrides capture secrets on save; template sets are a new record with no request behind it. |
| 36 | Panel typography | **In — M44.** Global font size with per-panel override, committed on release. |
| 37 | Sound | **In — M37**, as the system alert sound, off by default. Speech input: **cut**. |
| 38 | First run | **In — M47.** |
| 39 | Export | **In — M48**, narrowed as §2 says. |
| 40 | Remote read-only view | **Cut.** Needs accounts and a transport. |
| 41 | Review's cwd resolution | **Cut.** A recapture-or-refuse policy of its own; the inspector shows both cwds so the mismatch is visible rather than silent. |
| 42 | Camera bookmarks | **In — M38.** |
| 43 | Unicode 11 widths | **In — M36.** A defect. |
| 45 | Camera undo | **In — M38.** |
| 46 | Run ledger | **Cut.** An append store whose first customer (usage history) is also cut. |
| 47 | Environment report | **In — M47.** Which CLIs were found and where, tmux's version or the fallback reason, the resolved PATH's key names, the layout file path. Read-only, timestamped, key names only. |
| 48 | Lock and pin | **Cut.** Pin is a third author of the live budget; lock's mis-click case is already softened by the armed close. |
| 50 | Git worktree per panel | **Cut, and flagged.** The entry calls it the largest correctness gap in the product thesis, and it is: two agents in one checkout is the configuration the canvas invites. It lands on the absent-`command` rule and the dispose call-site count, makes undo destructive to files on disk, and needs a worktree lifecycle policy. It is the first post-1.0 milestone this plan would schedule, and it is named in the README's own "what it does not do" so nobody discovers it by losing work. |
| 51 | Discard | **Cut.** The only operation that would destroy work, with no undo. |
| 53 | Cards that show the last real screen | **Partly in — M45.** A restored dormant panel's card shows the tail of its log. The `serialize`-at-detach and `capture-pane` sources are **cut**; the log makes both redundant for the card. |
| 54 | Cmd-click a path or URL | **Cut.** Gated on hover correction at zoom ≠ 1, which nothing in this plan builds; a link that underlines the wrong cell is worse than no link. |
| 55 | Ad-hoc task panels | **Cut.** Collides with fit-before-spawn; presets and a shell panel cover the case. |
| 56 | Agents that outlive the app | **Cut.** Changes what quitting means and makes the boot orphan-killer a correctness pair with the coalesced write. |
| 57 | `tc` CLI / URL scheme | **Cut.** A trust boundary pointed inward, and the navigation hole `will-navigate` exists to close. |
| 58 | Backpressure on a runaway panel | **In — M36.** A byte cap per flush that keeps the tail and writes an elision marker into the stream. |
| 59 | OSC 133 shell integration | **Cut.** A per-chunk parse on the hot path for a signal the bell already gives. |
| 60 | Zoom-independent chrome | **Cut.** Semantic zoom answers the same complaint from the other side: below the readable threshold the card is the control, and it is drawn large. Counter-scaling any node near `.panel__slot` risks the pointer correction's arithmetic for a benefit M42 delivers without it. |
| 61 | Recover an orphan session | **Cut.** Placement now exists (M43), but the dialog it needs is the one thing this plan declines to add to boot: a question on the first launch after a crash, about sessions the user cannot see. |
| 62 | Camera animation | **In — M38.** Tweened flights on discrete jumps only, clamped per frame, tiering suppressed until the flight settles, cut to a jump under reduced-motion. |
| 63 | Spatial ordering for the palette | **In — M39.** On-screen panels first, then by recency. |
| 64 | Rationing terminal memory | **Cut.** One careless step from `dispose()`; no observed failure. |
| 65 | Panes inside a panel | **Cut.** A panel owning N handles pulls the model the opposite way from every kind added since M9b. |
| 66 | Images in the terminal | **Cut.** Composites outside the WebGL canvas and defeats the card. |
| 67 | Layout time machine | **Cut.** Quietly makes reset reversible, which reset's dialog promises it is not. |
| 69 | A gesture-history HUD line | **In — M38.** The camera milestone is its first real customer ("undo: fit to 12 panels"). |
| 70 | A shared verify harness | **Cut.** `verify:meta` 22 removed the collision that motivated it; the scoped-id convention does the rest. |
| 72 | One versioned test-hook namespace | **Cut.** Renaming fourteen hooks across a 13,000-line suite for hygiene, with production stripping as its only user-facing effect. |
| 73 | A flag registry | **Cut.** Developer flags with no user; the budget re-check has a scenario check today. |
| 74 | Updates | **Cut.** There is no updater; the README says to download from Releases. The tmux-survival question it raises is recorded for whoever adds one. |
| 76 | An app icon | **In — M50.** Vector artwork in the repository, converted with `sips` and `iconutil`. |
| 77 | Link-drawing leftovers | **In, the two code items — M36.** The badge/label overlap stays a hand check; the double-fire correction stands. |

**The UI follow-up list** (`docs/ui-followup-work.md`): items 1–7 (mono inspector
values, shortcut chips, the dot-grid decision, 24px targets, an SVG icon set,
hover-revealed row controls, self-hosted type) are all **in — M40**. Item 8, a
visual regression suite, stays **cut** for the reason its author gave: it is a
pre-release gate with its own image-storage and threshold questions, not a
verify suite, and the screenshot script `scripts/shot.cjs` already exists for a
human to look.

**The interface-architecture spec** (`2026-08-30-m23-interface-architecture-design.md`)
is **in — M41 and M42**, amended where §5 below says.

---

## 4. The milestone plan

Fifteen milestones. Each is one coherent shippable increment on its own branch,
merged when `npm run verify` is green, with a spec and a plan of its own under
`docs/superpowers/`. The order front-loads what everything later consumes (a
green baseline, then the visual language, then the shell) and puts the
highest-risk restructure early enough that every feature after it is built on
the final chrome rather than restyled afterwards.

| # | Milestone | Definition of done |
|---|---|---|
| **M36** | **Hardening for 1.0** | `npm run verify` green (check 143 repaired to test what it says). Unicode 11 widths on, with a check that a wide glyph occupies two cells. A per-flush byte cap in `pty-manager.ts` that keeps the tail and writes `[N KB elided]` into the stream, checked in `verify:pty-manager`. `onContextPasted` and `LinkLayer`'s `onRemove` are identity-stable, pinned as source text. `JiraListResult`/`JiraTransitionsResult`/`JiraWriteResult` declared once, in the contract, pinned as source text. |
| **M37** | **Attention beyond the window** | Main derives the waiting count from its own detectors and sets the dock badge; a `wants-you` transition while the window is not focused posts an OS notification whose click focuses the window and frames the panel without acknowledging it; an optional system alert sound; main re-sends every session's current agent state to a fresh renderer so the rail count is right after `Cmd+R`. Three settings in the schema. The notifier and badge are injected so `verify:pty-manager` drives them. |
| **M38** | **The camera** | Zoom-to-fit the selected panel. Nine named bookmarks per workspace, set and recalled by chord and by palette row, persisted with absent/malformed rules. A camera trail on `Cmd+[`/`Cmd+]` pushed only on discrete jumps, in a second `History` instance that never touches panels. Tweened flights for every discrete jump, clamped per frame, tiering held until settled, a plain jump under `prefers-reduced-motion`. A transient HUD line naming the last camera action. |
| **M39** | **Keyboard-first canvas, accessibility** | `Cmd+Arrow` moves the SELECTION to the nearest panel in that direction (pure, plain-node checked) and never wakes anything; `Cmd+Enter` focuses and wakes the selection deliberately; `Cmd+Escape` hands focus from the terminal back to the chrome, where Tab works. Landmarks, roles and labels on the top bar, rail and inspector; a polite live region for attention; visible focus everywhere. `accessibility.screenReaderMode` fanned across the registry. The palette's panel list orders on-screen first, then by recency. A written statement of what xterm cannot offer. |
| **M40** | **The visual language** | `appearance.theme` (`system`/`light`/`dark`) as the schema's first enum; a light block and a dark block, both measured by `verify:styles` 11 (widened to iterate blocks); the system setting followed live; the terminal's palette — including a light ANSI set — fanned across every session including detached ones, with the card's preview agreeing. An SVG icon set replacing every entity glyph, `aria-hidden`, on a 24px cell. Every pointer target ≥ 24×24. Row controls revealed on hover and `:focus-within`, with the dormant start control always visible. Shortcut chips on New panel and Search. Mono inspector values. The dot grid at a visible alpha with a vignette. A self-hosted UI face for chrome (vendored, `font-src 'self'`), the terminal face left on the system stack so cell metrics never race a font load. A motion audit: every transition on a token, every one cut under reduced-motion. |
| **M41** | **The interface architecture** | The "M23" spec's dock + one navigator pane + context pane, amended: a 48px dock selects one navigator (Workspaces, Panels, Files, Attention); the context pane pins identity and actions and tabs its sections (Detail / Work / Tools); actions in three ranks with a confirm-gated close; container-query breakpoints on `.shell`, never the window; canvas-wide totals in the no-selection summary. Every promotion and inset check in `verify:panels` restated for the new grid and green. |
| **M42** | **One panel frame, semantic zoom** | `PanelFrame` renders all five kinds through one chrome; the ×3 duplicated CSS families become one each. Three render tiers by `viewport.scale` with a hysteresis band, decided below tiering, from `Panel` facts only — a dormant panel renders a non-empty far tier. `assignTiers` unchanged, pinned as source text. |
| **M43** | **Placement: snapping and tidy** | Edge and centre snapping with guide lines while dragging, threshold in screen pixels over `scale`, never fighting the minimum panel size. `Tidy` on the selection or everything: compact without reordering, one undoable step, never producing a rect the validator rejects. |
| **M44** | **Panel typography** | `terminal.fontSize` (global) and a per-panel override, through the M40 fan-out, committed on release with one `refit` per commit; the pointer corrector reads live metrics (checked by `__m4aCellToScreen` after a size change). |
| **M45** | **Durable scrollback** | A per-panel append log under `userData`, written from the flush, byte-capped as a ring, on by default with `scrollback.persist` and a "Clear scrollback logs" verb. A restored dormant panel's card shows its log tail. The secret scrubber module, plain-node checked, applied to nothing yet — M48 is its customer — but written here where #31 says it must exist before a byte leaves the panel. |
| **M46** | **Search across panels** | `Cmd+F`: a main-side search over every panel's log (live and dormant alike), results as a list of panel + matching line, Enter flies the camera to the panel; "no matches" and "nothing indexed" render differently. |
| **M47** | **First run and empty states** | With zero panels: a launcher card offering the real verbs through the real create path, a gesture-hint strip whose hints fade once used and stay faded across a relaunch, a banner when the shell probe failed, and which agent CLIs were found. Never shown on a restored canvas whose panels are merely dormant. An environment report page. Every unconditionally rendered section has an empty state. |
| **M48** | **Export** | A panel's output as text (from the log, scrubbed) and the canvas as a PNG (main-side `capturePage`), each through a save dialog; the diagnostics bundle scrubbed by the same module. |
| **M49** | **The dead-end audit** | Every surface walked; every row and state finished or disabled with a named reason; the drop-on-panel handoff; the stray visual defects found on the way. |
| **M50** | **Ship** | `1.0.0`. The icon. `npm run package` and `npm run verify:packaged` green. README install true for a stranger, Gatekeeper honest, "what it does not do" listing worktree isolation. `CLAUDE.md`, `docs/load-bearing.md`, both IPC diagrams and the suite table accurate; the manual-only list shorter; `graphify update .` run. |

### Sequencing rationale

- **M36 first** because the baseline is red and three of its items are
  defects.
- **M37–M39 before the design milestones** because each is a small, mostly
  pure milestone whose UI is one or two rows and can be restyled by M40 at no
  cost — and because they are the cheapest way to re-learn this repository's
  method (spec, plan, red check, green check) before the largest change.
- **M40 before M41** because a restructure of the shell is easier to judge in
  the final palette and type, and because M40's icon set and hit-target rules
  are what M41's dock is made of.
- **M41 before M42–M49** so every later feature is built into the final chrome
  once, rather than into the old chrome and moved.
- **M45 before M46 and M48** because both consume the log.
- **M47 late** because the launcher shows the presets, the theme, the icons
  and the chrome as they will ship.
- **M49 and M50 last** by definition.

### If the plan is wrong

A milestone that turns out to be mis-scoped changes here, dated, with the
reason — the plan is not followed past the point it stops being believed. The
build log records the change first; this file records it second.

---

## 5. Amendments to the interface-architecture spec

The spec is adopted for M41 and M42 with these changes, each stated so it is
not read as an oversight:

1. **It takes a new number.** It was written after M23 (agent modes) had
   merged and never held the number; its phases land as M41 (dock, navigator,
   context pane) and M42 (panel frame, semantic zoom).
2. **Phase 0's "byte-identical screenshot" success criterion is dropped.**
   M40 lands first and changes every pixel; the foundations (container query
   scaffolding, the enum setting, `verify:styles` iterating blocks) land inside
   M40 instead.
3. **Zoom-independent chrome (§5.2) is not built** — see #60 above. The
   `.pf__body`-is-never-transformed rule is still recorded, because the
   temptation returns.
4. **The zoom cluster moves to the HUD** as the spec says, and the HUD stops
   being `pointer-events: none` for that cluster only; the wheel listener's
   yield rules gain the HUD as a surface, checked.
5. **Attention as a badge plus popover** is adopted; its recorded risk (a
   waiting agent becoming invisible) is answered by M37's dock badge and
   notification, which exist by then.
6. **The theme enum (§9.1) lands in M40**, not in the architecture milestone,
   because the theme is what M40 is.

---

## 6. What this plan will still not prove

Recorded now so the closing report does not discover it:

- **No suite reaches a real Jira**, a real OS notification, a real dock badge,
  a real system sound, or a real Gatekeeper prompt. Each of those is injected
  or simulated in a suite and confirmed once by hand; the manual-only list at
  the end of `docs/load-bearing.md` names them.
- **No visual regression test.** The stylesheet suite measures contrast and
  token discipline; it cannot say the app looks right. `scripts/shot.cjs`
  renders it for a human.
- **The terminal panels are not screen-reader-accessible by default.** xterm's
  accessibility mode is a setting (M39) because its DOM mirror is expensive,
  and a carded panel has no mirror at all. That is the honest limit, stated in
  M39's spec.

---

## 7. Amendment, 2026-09-01 — five required features, appended

Received after M36 began, as an addition to §2's list rather than a
replacement. Five features are required for 1.0 above the earlier list, six
more follow in descending value per unit of work, and four earlier items are
deprioritised. Nothing above is deleted; the milestone table in §4 is
**superseded by the one below**, and M36 continues unchanged.

### The five, and how each lands

1. **A git worktree per panel** (#50). **In — its own milestone, M37.** The
   entry §3 cut and flagged as the largest correctness gap is now the first
   feature after hardening. A preset (and a panel) may declare that it spawns
   in a fresh worktree of its repository on a new branch; the worktree is the
   panel's cwd, so the review engine's `resolveRepo` and `captureBaseline`
   see it as the repository root without change — but both of their
   load-bearing entries are read before designing, because the baseline is
   captured in the worktree and must be dropped with it. Closing a panel
   decides its worktree's fate explicitly; undo never removes one from disk.
2. **Broadcast input to a selection** (#21). **Already shipped as M31**, under
   a commit message that never said so (`feat: add broadcast input`), which
   is why the brief lists it as missing. The milestone (M40) is therefore an
   AUDIT first: what M31 delivers is measured against the sentence "type
   once, send to every selected panel", and if it is a one-shot send from the
   palette rather than a mode the keyboard lives in, the mode is added — with
   the loud indicator, the obvious exit and the dormant-panel skip the
   backlog entry demands. Recorded here so it is not read as a dropped item.
3. **Edges that run things** (#24, the half M25 declined). **In — M41.** A
   link may carry a second automation: when the source panel COMPLETES, the
   target panel is started and handed the source's recent output as context,
   through `paste()`. "Completes" is the agent-state machine's `exited`, and
   its idle-after-busy transition for an agent CLI that does not exit — both
   are events main already emits. The output is read from the durable log
   (M39), never from a renderer buffer that a dormant target has no access
   to. M25's stated reason for declining — the canvas writing arbitrary bytes
   to a PTY needs a payload and audit model — is answered rather than waved
   away: the payload is bounded (a line cap and a byte cap, stated in the
   inspector), it is bracketed-pasted so nothing is submitted mid-fragment,
   the rule is listed in the inspector's automation list beside restart-on-
   exit with its most recent outcome, and it never fires for a link the user
   did not configure by hand.
4. **Search across every panel, over durable scrollback** (#16, #30).
   **Already in — now M39 (scrollback) and M42 (search)**, moved earlier
   because M41 also consumes the log.
5. **Agents that outlive the app** (#56). **In — M38.** `before-quit` detaches
   instead of killing when `session.keepOnQuit` is on; the next launch's boot
   reconciliation already reattaches known sessions. **Overruled in one
   respect, in writing: it ships OFF by default.** A person who quits an app
   expects its processes to stop, and an agent left burning tokens behind a
   quit is the surprise the setting's description has to name; the author,
   who wants the opposite, is one palette row away. The boot orphan-killer
   becomes a correctness pair with the coalesced write, so `before-quit`'s
   `flushSync` is asserted to precede the detach.

### The six below them, in the order given

| Entry | Decision |
|---|---|
| #54 Cmd-click a path or URL | **In — M51.** Gated on the hover half of pointer correction; the milestone fixes that first (a `mousemove` with no prior in-slot mousedown is corrected against the slot under the cursor), then registers a link provider for paths and URLs, opening through main. |
| #59 OSC 133, and #46 the run ledger | **In — M52.** Main injects the prompt marks into the shell it spawns; each command gets a marker, a gutter mark by exit status, and a ledger row. |
| #51 Discard | **In — M53.** Per-file, refusing outright on the `shared` arm, with the baseline's contents disclosed before the write; never undoable and never pretending to be. |
| #57 `tc` CLI and URL scheme | **In — M54.** Panel ids stay renderer-minted; the CLI asks the running app over a local socket main owns, and the URL scheme is a second door onto the same verb. |
| #58 Backpressure | **In — M36**, already. |
| #61 Recover an orphan session | **In — M55.** Placement exists after M50, so a recovered orphan gets a real position; offered as a dialog naming the sessions, never adopted silently, and never offered for a dead pane. |

### Deprioritised

Camera bookmarks, camera undo, semantic-zoom cards and export are not cut —
each is still §3's answer — but they move to the tail (M56–M58), so that if
the run is forced to stop early they are what is missing. The camera
milestone keeps zoom-to-fit and the reduced-motion flight rule, which
criterion 3 needs regardless of bookmarks.

### The milestone table, superseded

| # | Milestone | Status |
|---|---|---|
| M36 | Hardening for 1.0 | in progress |
| M37 | A git worktree per panel | |
| M38 | Agents that outlive the app | |
| M39 | Durable scrollback | |
| M40 | Broadcast input — audit M31, add the mode if it is missing | |
| M41 | Handoff edges — a link that starts its target with the source's output | |
| M42 | Search across every panel | |
| M43 | Attention beyond the window | |
| M44 | Keyboard-first canvas, accessibility | |
| M45 | The visual language | |
| M46 | The interface architecture | |
| M47 | One panel frame | |
| M48 | First run and empty states | |
| M49 | Panel typography | |
| M50 | Placement: snapping and tidy | |
| M51 | Cmd-click a path or URL | |
| M52 | OSC 133 shell integration and the run ledger | |
| M53 | Discard | |
| M54 | `tc` CLI and URL scheme | |
| M55 | Recover an orphan session | |
| M56 | The camera: zoom-to-fit, flights, bookmarks, undo | |
| M57 | Semantic zoom | |
| M58 | Export | |
| M59 | The dead-end audit | |
| M60 | Ship | |

Definitions of done for the milestones §4 already described are unchanged;
the new ones get theirs in their own specs. The sequencing rationale is
amended in one place: the five required features and the log they share come
before the design milestones, because they are the brief's own definition of
what the app is for, and a restyle of their rows by M45 is cheaper than
building the product's differentiating features last.
