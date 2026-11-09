# Install

Terminal Canvas runs on macOS. The download is built for Apple Silicon (M1 and later).

## Download

1. Get the `.dmg` from the [latest release](https://github.com/alexnieves-cs/terminal-canvas/releases/latest).
2. Open it and drag **Terminal Canvas** to Applications.
3. Open the app.

## If macOS refuses to open it

Releases are not signed with an Apple Developer ID yet, so macOS blocks the first launch. It says
either *"Terminal Canvas is damaged"* or
*"cannot be opened because the developer cannot be verified"*.
Either of these gets past it:

- Open **System Settings → Privacy & Security**, scroll to the notice about the blocked app and
  choose **Open Anyway**. On macOS 14 and earlier you can right-click the app and choose **Open**.
- Or clear the quarantine flag in a terminal, with the command below.

```sh
xattr -dr com.apple.quarantine /Applications/Terminal\ Canvas.app
```

Only do this because you have read the source or trust its author. The app runs whatever commands
you give it, by design.

## Install an agent

The app runs agent CLIs that are already on your Mac. Install at least one, and sign in to it
once in a normal terminal:

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) (`claude`)
- [Codex](https://github.com/openai/codex) (`codex`)

Others work too. See [Supported agents](agents.md).

The app asks your login shell which CLIs it can find. **Environment…** in the palette (`⌘K`)
shows what it found.

## Optional: tmux

```sh
brew install tmux
```

With `tmux` 3.0 or later, agents keep running through a window reload, and through a quit if you
turn on *Keep agents running after quit* in Settings. Without it the app works the same, and
sessions end with the window.

## Build from source

You need macOS, Node 20 or later and the Xcode Command Line Tools.

```sh
git clone https://github.com/alexnieves-cs/terminal-canvas.git
cd terminal-canvas
npm install
npm run dev
```

`npm run package` writes the `.app` and `.dmg` into `release/`.
[Developing Terminal Canvas](../development.md) has the details.

## Updates

The app checks GitHub for a newer release and tells you when there is one. It does not replace
itself. Download the new `.dmg` and drag it over the old app.

Next: [your first task](first-task.md).
