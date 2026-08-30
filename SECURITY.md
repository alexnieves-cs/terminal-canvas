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
- **The review layer runs `git` against your working tree.** Reading is
  non-destructive: it takes a snapshot object with `git stash create` and
  diffs against it, never checking anything out and never popping a stash.
  Committing from a review node is a write, and an intentional one: it
  creates commits, writes the index for the paths you commit, moves `HEAD`,
  and runs your own pre-commit hooks — which are third-party code that can
  modify the working tree themselves.

## Credentials

Terminal Canvas can store service credentials — currently a GitHub personal
access token — entered through its own UI. A stored credential is encrypted
at rest via Electron's `safeStorage` and lives in its own file,
`credentials.json` under the app's `userData` directory, never inside
`layout.json`.

No stored credential is ever placed in a spawned panel's environment, and no
IPC reply ever carries one back to the renderer — there is deliberately no
channel that returns a plaintext token. This is **stricter** than the app's
existing behaviour with the user's own login shell: every panel already
inherits the user's *entire* login environment, dotfile exports and all
(`$SHELL -ilc env`), because that is the user's own pre-existing
configuration and an agent needs it to function. A credential this app itself
collected is different — handing it to an agent would be this app's own
choice, made on the user's behalf, for no functional gain — so it is held
back instead.

`credential:verify` is the one place a stored credential is used: it makes an
outbound HTTPS request to `api.github.com` to confirm the token and read back
the account name it belongs to. This is the app's **first and only outbound
network call** — before this feature, `grep -rn "https\|node:http\|fetch("
src/main/` returned nothing, and every other request this app makes is to a
process running on your own machine.

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

This has a direct consequence for stored credentials: on macOS,
`safeStorage`'s protection is a Keychain ACL bound to the app's **code
identity**. For an unsigned or ad-hoc binary that binding has no stable
designated requirement, so what "encrypted at rest" buys against another
binary running as the same user is materially weaker than it would be for a
signed build, and may amount to little more than obfuscation. This is not a
defect in what this project claims — `safeStorage`'s actual real-world
protection has never been measured against this app's own build (see
CLAUDE.md's "What M13 does NOT prove" for the specifics) — it is the reason
that hand-check has to be done, and re-done, against a **signed** build if
one is ever cut.
