# M180 baseline repair — paste image observation

2026-09-08. Scope: `scripts/verify-panels-core.cjs`'s existing `paste.image.1` check.
No production code, dependency, golden, assertion id, or watchdog changed.

## Diagnosis before repair

The Act 0 baseline (`evidence/v9-run/act0-verify-local.log`) ended at core with
77/78 passing: only `echoedPath` was false; the image was written, bracketed paste
was visible, and the text paste passed. The original observer asked
`__m4aCellToScreen` for `.png` and `attachments` independently. That hook calls
`session-factory.ts`'s `locate`, which searches each visible terminal row alone.

A diagnostic run left the original assertion unchanged and captured the target
panel's durable PTY output, written filename, terminal width, and screen searches
before closing the panel. It reproduced 77/78, exit 1, in 54.8 seconds:

- `evidence/v9-run/m180-paste-image-red.log`
- `evidence/v9-run/m180-paste-image-diagnosis.json`

The terminal had 78 columns. After mode 2004's enabling sequence, its output was:

```text
^[[200~'/Users/alexnieves/Documents/terminal-canvas/out/t/tc panels attachments W7qFTc/clipboard-1788840423538.png'^[[201~
```

This is the exact path of the file main wrote, with its shell quotes and both
paste delimiters, echoed by the PTY. The word `attachments` starts at zero-based
column 68: the first row ends in `attachment`, and the next starts with `s`.
`.png` had a screen coordinate; `attachments` returned null. No input was lost.
The repository-local `TMPDIR` made a valid path long enough to expose the check's
screen-row assumption.

## Plan and change

Use the existing durable PTY log, as the broadcast and handoff checks already do,
to observe input delivery independent of terminal wrapping. Preserve the image
clipboard gesture and the visible bracket-marker check. Add no renderer hook.

The repaired observer records the attachment directory before the paste, then
requires exactly one new PNG. It derives that file's full path and requires the
same panel's real PTY log to contain the exact shell-quoted path between both
`^[[200~` and `^[[201~` delimiters. File existence alone cannot pass, and a stale
PNG cannot satisfy this paste. The text half similarly requires the exact text
between both delimiters in that PTY log. The previous check only matched two
unrelated substrings and allowed any PNG already in the directory.

Temporary diagnostic logging was removed from the suite after the red run; the
captured evidence remains under `evidence/v9-run/`.

## Commands and results

Both runs used the same repository-local environment, from the repository root:

```sh
TMPDIR="$PWD/out/t" TMUX_TMPDIR="$PWD/out/t" \
  CFFIXED_USER_HOME="$PWD/out/h" npm_config_cache="$PWD/out/cache/npm" \
  GIT_CEILING_DIRECTORIES="$PWD/out/t" TC_VERIFY_SUFFIX=v9 \
  npm run verify:panels:core > evidence/v9-run/m180-paste-image-red.log 2>&1

TMPDIR="$PWD/out/t" TMUX_TMPDIR="$PWD/out/t" \
  CFFIXED_USER_HOME="$PWD/out/h" npm_config_cache="$PWD/out/cache/npm" \
  GIT_CEILING_DIRECTORIES="$PWD/out/t" TC_VERIFY_SUFFIX=v9 \
  npm run verify:panels:core > evidence/v9-run/m180-paste-image-green.log 2>&1
```

Red: exit 1, 77/78, `paste.image.1` alone failed, 54.8 seconds.
Green: exit 0, 78/78, 49.6 seconds. `git diff --check` also exited 0.
The full `npm run verify` chain and act-close visual/packaged suites are owned by
the parent run; this scoped repair does not claim those checks.
