# Privacy

Your work stays on your Mac. Terminal Canvas needs no account and has no server of its own. Your
agent CLI talks to its own provider, as it does in any terminal; that traffic is the CLI's, not the
app's.

This page lists what the app itself can send, and how to turn each one off.

## What can leave your Mac

| What | When | Default | Where it goes |
|---|---|---|---|
| Update check | once at launch, or when you run **Check for updates** | on | GitHub (`api.github.com`) |
| Update download | only in a signed build, and only after you choose **Download and install** | asks every time | GitHub release downloads |
| Crash reports | only after you turn them on | off | the maintainers' crash-report service, or your own Sentry project |

Features you set up yourself, such as phone alerts or a shared canvas, send what their own
settings describe, and nothing until you set them up.

## Crash reports

Crash reports stay off until you turn them on with **Send crash reports to the maintainers** in
Settings → Privacy & export. It takes effect the next time the app starts.

A report holds:

- the error's name and its message
- where in the code it happened: function names, file names and line numbers
- the app version, the macOS version and the Electron version

Before a report leaves, tokens and keys are redacted, and paths under your home folder and the
app's data folder are replaced with placeholders. A report never holds terminal output, file
contents, prompts, log lines or your Mac's name. The app does not put your network address in a
report; the service still sees it as part of the request, as any website does.

A build with no reporting address sends nothing, and the setting says so. If you enter your own
**Sentry DSN**, reports go to your project instead and nowhere else. A native crash dump holds
process memory, so it is never sent to the maintainers. It can go only to a Sentry project you own,
and only with its own setting on.

## Updates

The update check asks GitHub which releases exist. It sends nothing about you or your work. Turn
it off with **Check for updates at launch** in Settings → General → Updates.

A signed build can also install the update. Nothing downloads until you choose **Download and
install**, and **Offer to install updates** turns the offer off.
[Signing and the network](../release-signing.md#updates-and-the-network-m695) lists every request.

Next: [FAQ](faq.md).
