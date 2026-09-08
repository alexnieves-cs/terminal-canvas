# M180 product-suite annotation diagnosis

2026-09-08. Scope: annotation-readiness observation in
`scripts/verify-panels-product.cjs`, plus the parent-requested real transport check
for the new agent plan door. No annotation production code changed.

## Red evidence and cause

The parent's `npm run verify:panels:product` run in
`out/v9-evidence/m180-onboarding-ui-old.log` ended at 21/24, exit 1
(`m180-onboarding-ui-old.exit` contains `1`), in 48.4 seconds. Despite its filename,
the attempted old-launcher override did not apply, so this was the current
renderer. `onboarding.start.1` passed. `annot.1` threw
`Cannot read properties of null (reading 'getBoundingClientRect')`;
`history.1` printed the same exception; `ink.3` subsequently aborted because
`inkA` was missing.

The annotation poll waited for the panel annotation's `<g>`, then immediately
called `g.querySelector('[data-annotation-label]').getBoundingClientRect()`.
`AnnotationLayer.tsx` renders that group throughout editing, with `NoteEditor`
occupying the place where the label appears only after Enter commits. Native
input is queued; existence of the group does not mean the label exists yet.
The poll could throw instead of waiting through this valid intermediate state.
The history assertion was not independently red: its code never ran because the
annotation/history block reports both ids from one catch.

The retained fixture and snapshot ring establish the later failure's cause:

| Snapshot under `out/t/tc panels snaps 7kyzZD/layout-snapshots/` | Active panels | Annotations |
| --- | --- | --- |
| `1788841121951.json` | `anA` | absent |
| `1788841130671.json` | `inkA` | absent |
| `1788841131175.json` | `anA` | `first note`, `on the panel` |

The ink fixture was written, then the old renderer's pending note save replaced
it. The final `out/t/tc-panels-6JUUvH/layout.json` still holds `anA` and both
correct note texts. This is evidence of a check-abort cascade, not evidence that
the annotation save failed. No blanket delay or production save change is
justified by it.

## Minimal change

The poll now returns false until the actual label exists, then reads the same
text, rectangle, and leader. The original assertion still checks both texts,
both anchor kinds on disk, following the panel's drag, Delete, and the merged
refusal. The first post-Enter read records `group`, `editor`, and `label` in its
diagnostic detail. History and all later checks remain in place.

The separate `onboarding.agent.1` check asks `check-readiness` through the real
`requestFromRendererWith` / preload / renderer path. It requires an installed
engine and the honest sign-in sentence in the response, then asks to close the
conversation and requires the human-confirmation refusal with the chat still
present. It was added after implementation; no red-first evidence is claimed for
this transport check.

## Commands and results

The parent separately proved the old-launcher replacement applied once:
`m180-onboarding-ui-proven-old.log` / `.exit`, 59/60, exit 1, 79.7 seconds, only
`onboarding.start.1` failed. Build/Electron ownership transferred after that exit.

The current renderer was rebuilt, using the repository-local environment:

```sh
TMPDIR="$PWD/out/t" TMUX_TMPDIR="$PWD/out/t" \
  CFFIXED_USER_HOME="$PWD/out/h" npm_config_cache="$PWD/out/cache/npm" \
  GIT_CEILING_DIRECTORIES="$PWD/out/t" TC_VERIFY_SUFFIX=v9 \
  npm run build > out/v9-evidence/m180-annotation-build.log 2>&1

TMPDIR="$PWD/out/t" TMUX_TMPDIR="$PWD/out/t" \
  CFFIXED_USER_HOME="$PWD/out/h" npm_config_cache="$PWD/out/cache/npm" \
  GIT_CEILING_DIRECTORIES="$PWD/out/t" TC_VERIFY_SUFFIX=v9 \
  npm run verify:panels:product > out/v9-evidence/m180-annotation-product-green.log 2>&1
```

Build: exit 0. Product: pending.
The parent owns the full `npm run verify` chain and act-close visual/packaged
checks; this diagnosis makes no claim that those have passed.
