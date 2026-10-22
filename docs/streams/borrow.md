# Lane G — borrowed ideas (M530–M539)

A scan of 25 similar apps (canvas terminals, parallel agent runners, AI
terminals, agent dashboards and phone companions) on 2026-10-22, checked
against this repository. Most of what they offer is already here; the list
below is what is not, and how each one lands. The full comparison, with a
link per app, is the "Similar apps" artifact in the project thread.

| Id | Milestone | From | What | Our twist |
|---|---|---|---|---|
| G1 | M531 | TermCanvas, Superset | Gemini CLI, OpenCode, Cursor Agent, Amp and Kimi as built-in presets | They are probed as OPTIONAL agents: a missing one is listed, never reported as something to install, and onboarding's Gemini row (offered since M180, never probed) gets an answer |
| G2 | M532 | claude-remote-approver, Omnara | Approve or deny a waiting agent from the ntfy alert | Off by default; answers once (never "allow for the session"); each button carries a one-time code that expires; nothing but the code crosses back |
| G3 | M533 | tmuxcc | Batch approve | One press allows every pending READ-ONLY request across agents; a write or a command is still answered one at a time |
| G4 | M534 | wmux, multi-agent observability | Agent state from Claude Code hooks | Passed per panel, so `~/.claude/settings.json` is never written |
| later | — | Sculptor | A container per overnight agent | Needs Docker on the Mac and a real Mac check |
| G5 | M535 | Wave Terminal | Open a file or URL as a panel from a shell (`tc view`) | Lane D is finished, so G takes it as an ownership exception logged in `requests.md` |

Skipped on purpose: Windows and Linux builds (Mac-first), a one-time price (a
business call), a LAN status page (exposes the Mac; MCP and phone alerts cover
it), end-to-end encrypted phone sessions (an alert carries a name and one
sentence, nothing to encrypt).
