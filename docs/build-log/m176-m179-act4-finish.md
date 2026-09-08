# v8 Act IV — the finish (M176–M179): build log

Branch `m176-finish`, 2026-09-07, from `main` at Act III's merge. Spec:
`docs/superpowers/specs/2026-09-07-v8-act4-finish-design.md`. Plan:
`docs/superpowers/plans/2026-09-07-v8-act4-finish.md`. Ledger:
`docs/build-log/m161-m179-ledger.md`.

## M176 — motion with intent

Every duration a token: `--dur-1` for a reveal, `--dur-2` for an arrival, the new
`--dur-breath` for the pulse and the caret; the auto chip's spinner gone (a state is a
colour); `motion.2` pins the durations and the moments' keyframes (a sixth, the ⌘G grid's
rise, allowed by name as an overlay's arrival). The brief's scale-from-0.98 arrival was
tried and DECLINED: the keyframe runs on `.pf__motion`, an ancestor of `.pf__body`, and a
scale there broke the annotation stage (product `annot.1`, bisected on the keyframe alone) —
the arrival is a rise, the M3/M144 rule reaching one more place.

## M177 — empty states as places

`shared/empty-states.ts` (the sentences as data, an unknown id refused) and
`shell/EmptyState.tsx` (glyph · sentence · one verb, centred, the UI face), wired into the
Panels, Workspaces, Runs and Snapshots empties, the vault's two arms, the palette's no-match
row, the chat's first state and the attention popover; the sentences the checks read kept
verbatim. Four inline sentences kept as they were, by name.

## M178 — the second full audit

`docs/ux-audit-4.1.md`: 26 findings from a fresh-context walk of every golden with the five
rules as the lens — 12 fixed (the audit's headline a latent 4.0 defect: the enabled Restart
in the context pane painted white on white since M46; `restart.paint.1`), 3 declined with
their rule, 11 owed to backlog #88 (and #86) by name, twelve stale scene intents rewritten.
The wave moved 26 goldens; a fresh-context critic walked all 26 and questioned three: F.4
had NOT landed (a `min-width: 3ch` floor under a pre-M178 `min-width: 0` that overrode it —
and 3ch is exactly the `R…` it meant to fix; the root is now `flex: 0 0 auto` to a ceiling
and the attribution gives, pinned by `tree.1`), F.15 had landed on one of two lines (the
resources sentence kept M127's mono; now in `face.1`'s list), and the HISTORY empty line's
shift was the wave's own `.rail-empty` padding, named in the ledger rather than absorbed.
Both fixes were made and re-rendered BEFORE the goldens were written; `verify:visual`
57/57 after. The audit's run also caught M176's scale (above), and `browser.1`'s load flake
(58/59 in the chain, 59/59 alone, twice this act).

## M179 — reconcile

4.1.0 (no seam changed — `verify:ipc` still pins 124 channels); README's status line, the
M161–M179 rows and the preamble; `CLAUDE.md`'s preamble and "What it is" with the five
rules as pinned entries; the brief's finished pass; `docs/release-notes/4.1.0.md`; the
ledger's final evidence; the tag `v4.1.0`, nothing pushed.

## Reviews

Both fresh-context, over `m176-finish` at 8a23b19, neither running an Electron suite.

**The verifier** reproduced every red-first claim (styles at `918ba31^` 53/56 with `face.1`,
`motion.2`, `tree.1` red; at `148e39b^` 52/56 with `empty.1`; `rail-rows.ts` at `918ba31^`
turns `lastline.2` red; the `empty-states.ts` stub turns `empty.2` red), read every named
check's body and found none vacuous, matched all 27 changed goldens to a sentence, and every
audit row to a check, a golden or a backlog number; the version pins agree and the seam is
untouched (124 channels). Its findings: M179 half done with README's row ahead of the work
(no tag, no final evidence, no `graphify update`, the Reviews placeholder) — the rest of this
milestone; M178's tally disagreeing across four documents (README said 13/10; the audit table
counts 12 fixed, 3 declined, 11 owed — README corrected); `motion.2` blind to the longhands
(`animation-delay: 30ms…240ms` on the ⌘G grid — the eight literals moved onto
`--dur-stagger`, the regex reads the longhands, the reduced-motion block's own `0ms`/`.01ms`
exempted by name; red on HEAD's stylesheet 55/56); the check's header and the brief still
saying "scale from .98" (both now say the rise and why; the design spec carries a DECLINED
note); `notice.1` owed into this act and never written (named in backlog #88 now — it fell
through silently and the ledger's own "owed into this act" line is what caught it); a stale
comment in `verify-meta.cjs` (fixed); the launcher golden moved in M177 and committed in
M178's wave (accounted for; recorded).

**The critic** confirmed every M178 fix visible on its golden and the register holding on the
rail, the chat, the zoom pill and the far view, and found two must-fixes: fifteen goldens
that sat UNDER the pixel budget while contradicting FIXED rows — the rail's chat row with its
backticks in seven scenes, `diff --git` above a hunk in `tool-objects`, a group's `card`/
`remove` at rest in `reduced-motion` — the exact case the golden rule says must be forced;
and `$0.21` in the Workspaces pane's run rows, a dollar figure in the rail that no finding
named (the metrics rule; the row now reads `N panels · duration` and the Work tab keeps the
price; `verify:rail` 47's expectation moved with it). Its should-fixes: `EMPTY_STATES` half
data nobody rendered (six of sixteen ids; the list now holds only ids the renderer renders by
name, `empty.2` reads the renderer as text for it, the vault's missing arm and a skills
column's slot were wired, and the six surfaces that keep their own three-state or dynamic
sentence are named in the file and in #88); a dead reduced-motion rule painting a DASHED auto
ring (removed); F.22 declined under the wrong rule (re-declined under the rest rule) and F.23
by a scene's intent (re-declined under the rest and path rules with the three readouts named
as identity, provenance and control); the launcher's hints left-aligned under a centred empty
state (centred). Notes owed to #88: the workflow panel's resting explanation lines, the
teammate pane as a form, the Skills columns at 300px. Declined with the rule: a `<1%` floor
on the CPU figure (a sampled 0 is the measurement; `undefined` is the refusal).

Every golden the wave moved — 49, most under budget — was forced and sentenced in the ledger
(the M179 golden block), never absorbed.
