# Security Policy

## Reporting a vulnerability

Please report privately via
[GitHub Security Advisories](https://github.com/alexnieves-cs/terminal-canvas/security/advisories/new)
rather than in a public issue. This is a beta maintained by one person; expect
an acknowledgement within a week.

## What this application is

Terminal Canvas spawns **arbitrary local commands** — whatever you configure a
panel to run — inside real PTYs, using your own login shell environment
resolved from `$SHELL -ilc env`. That is the product, not a defect. Reports
along the lines of "the app can run any command" or "it reads my PATH and
dotfiles" describe intended behaviour and will be closed as such.

Two consequences are worth stating plainly, because they are properties of the
design rather than bugs:

- **Panel processes can outlive the window.** With `tmux` installed, closing or
  reloading the window deliberately leaves sessions running so agents survive.
  Quitting the app tears them down.
- **The review layer runs `git` against your working tree.** It takes a
  snapshot object with `git stash create` and reads diffs against it. It never
  checks anything out, never pops a stash, and never modifies the working tree.

## What is in scope

Genuinely interesting reports would include: escaping the renderer's context
isolation, an IPC channel that performs an action its caller should not be able
to request, the preload bridge exposing more than the declared contract, path
handling that escapes the intended directory when reading
`.claude/commands/*.md`, or anything that causes the app to run a command the
user did not configure.

## Releases are unsigned

Beta builds are unsigned and un-notarized, by decision — signing needs a paid
Apple Developer account. Verify what you are running, or build from source.
