# FAQ

## Is it safe to run?

The app runs agents as you. Each one can reach your home folder, your keychain, your network and
the other agents. A worktree per agent keeps their file changes apart, but it is not a sandbox.

What the app adds:

- An agent's permission request is shown to you before it runs.
- Anything exported as text (a panel's output, a canvas, feedback, a phone alert) passes a secret
  scrubber first and reports how many secrets it replaced.
- A canvas you import starts nothing until you have looked at it.
- The app stores credentials in one process and never sends them to the window.

A picture is different. The canvas PNG export is a screenshot, and no scrubber can read pixels.
Check a picture before you share it.

## Does it send my code anywhere?

No. The app needs no account and has no server of its own. Your agent CLI talks to its own provider, as it does in
any terminal. Crash reports are off unless you add your own Sentry address in Settings.

## What does it cost?

The app is free and open source (MIT). You pay your agent provider as usual. The inspector shows
tokens and cost per panel for Claude Code, and `agents.budgetUsd` in Settings stops work at a
ceiling you set.

## Why does macOS say the app is damaged?

The release is not signed with an Apple Developer ID yet. [Install](install.md) has the two ways
past the warning.

## Does it run on Intel Macs, Linux or Windows?

The download is for Apple Silicon Macs. An Intel Mac can [build from source](install.md#build-from-source).
Linux and Windows are not supported as a desktop app. The [live demo](https://alexnieves-cs.github.io/terminal-canvas/demo/)
runs in any browser.

## My agents stopped when I closed the window

Install `tmux` (`brew install tmux`). With it, agents keep running through a reload. To keep them
running after you quit, turn on *Keep agents running after quit* in Settings.

## The app cannot find `claude` or `codex`

Open **Environment…** in the palette (`⌘K`). It shows the PATH the app read from your login
shell and each CLI it looked for. If your shell took too long to answer, the row says
"unanswered", which is different from "missing". Fix the PATH in your shell profile, then
restart the app.

## A shortcut types into the terminal instead

Every canvas shortcut uses `⌘`, because an agent's terminal uses every plain key. If `⌘K` clears
the terminal, the panel has focus lock on. `⌘⇧L` turns it off. See [Keyboard](keyboard.md).

## Can a screen reader use it?

The app's own controls are labelled and reachable from the keyboard. What an agent CLI draws
inside its terminal belongs to that CLI. A screen-reader mode in Settings keeps a text copy of
each live terminal. It reads output as it arrives, as lines.

## Where is my data?

Your layout is under `~/Library/Application Support/Terminal Canvas/`. Nothing syncs. **Export
this canvas…** writes one file you can back up or share.

## How do I report a problem?

**Prepare feedback…** in the palette opens a draft in your browser with the version and what the
app found, scrubbed. You read it and send it yourself. Or use the
[feedback form](https://github.com/alexnieves-cs/terminal-canvas/issues/new?template=feedback.yml).
