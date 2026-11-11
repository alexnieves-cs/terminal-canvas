# Supported agents

Every panel is a real terminal. Any command-line agent that runs in Terminal runs here, and you
can add your own command as a preset.

## Built in

| Agent | Command | Runs in a terminal panel | Chat panel | Permission requests on the canvas | Tokens and cost | Subagent nodes |
|---|---|---|---|---|---|---|
| Claude Code | `claude` | Yes | Yes | Yes | Yes | Yes |
| Codex | `codex` | Yes | Yes | No | No | No |
| GitHub Copilot CLI | `copilot` | Yes | Yes | In ACP mode | No | No |
| Gemini CLI | `gemini` | Yes | No | No | No | No |
| OpenCode | `opencode` | Yes | No | No | No | No |
| Cursor Agent | `cursor-agent` | Yes | No | No | No | No |
| Amp | `amp` | Yes | No | No | No | No |
| Kimi CLI | `kimi` | Yes | No | No | No | No |
| Any shell | your login shell | Yes | No | No | No | No |

What the columns mean:

- **Terminal panel.** The CLI runs as it does anywhere else. The panel's edge still shows when
  it is working, idle or waiting, read from the terminal's bell and its output.
- **Chat panel.** The agent's turns, tool calls and diffs are shown as a conversation with a
  composer. [Start work](first-task.md), [overnight batches](overnight.md) and the Needs you
  list use chat panels.
- **Permission requests.** The agent's request to run a command or edit a file appears on the
  canvas with Allow and Deny. A chat with Codex follows the approval policy you start it with
  instead. In a terminal panel, every CLI asks in its own way, as it does in Terminal.
- **Tokens and cost.** Read from Claude Code's own session files. Other CLIs do not write files
  the app can read, so the figures are missing for them.
- **Subagent nodes.** A small node beside the panel for each subagent Claude Code starts.

## Before you start

- Install the CLI and sign in to it once in a normal terminal. The app never asks for a password.
- **Environment…** in the palette (`⌘K`) shows which CLIs the app found, and the install
  command for one that is missing.
- "Installed" does not mean "signed in". The first message finds out, and the CLI says so in its
  own words.

## Add your own

Start any command in a shell panel, then choose **Save as preset** in the inspector. It appears
in the spawn list from then on.
