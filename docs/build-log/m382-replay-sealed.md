# M382 — the replay record, encrypted at rest under the keychain's key

**Verdict: shipped.** A node's replay (M381) is read from its durable transcript, and that
transcript holds what an agent wrote and ran: every Write's whole content, every Edit's
two strings, every command. It sat in `userData/agent-transcripts/` as plain JSON lines.

Now each line is sealed on its way to disk under the key the macOS keychain holds for
this app (Electron `safeStorage`, the credential store's adapter). An older plaintext
transcript is sealed whole the first time this session writes to it. A line this Mac
cannot open is counted, never silently dropped.

## What landed

- **`createAgentTranscriptLog({ dir, crypto })`** (`main/agent-transcript-log.ts`):
  - with a cipher, every appended line is `enc1:` + base64 of the sealed JSON;
  - `read` opens sealed lines and takes plaintext ones as they are;
  - `AgentTranscriptRead.unreadable` counts the sealed lines this keychain cannot open;
  - `TranscriptCrypto` is the credential store's shape, and `SEALED_PREFIX` carries a
    version.
- **`bootstrap/stores.ts`** passes `createSafeStorageCrypto()`, the same lazy keychain
  adapter the credential store uses.

## Decisions, and why

- **Per LINE, so the file stays an append stream.** M73 chose an append stream because
  rewriting a growing transcript per turn is quadratic on the main thread. Sealing each
  line keeps that. The reader's rule, that a torn or garbage line costs only itself,
  holds for a sealed line too.
- **"At rest" means the older lines too.** A transcript from before this milestone is
  rewritten sealed, through a temp file and a rename, on this session's FIRST write to
  it. Only one rewrite happens per file.
- **A line this Mac cannot open is counted, never dropped.** A transcript copied from
  another Mac, or one whose keychain item was reset, reads with `unreadable: N`, so it
  never reads as a shorter conversation. Saying it on screen is owed.
- **No cipher, or none available, writes plain exactly as before.** The Electron
  harnesses build their own log with no cipher, so no suite touches the real keychain,
  the credential store's discipline. The adapter is asked lazily, because
  `safeStorage` is not usable before the app is ready.
- **The key is the app's keychain item, never a file.** Nothing stored here can open a
  transcript on its own. This is the same boundary the credentials already sit behind.

## Checks

- `verify:agent-session transcript.seal.1`, with a reversible test cipher and a second
  key:
  - an older plaintext line and a new turn are both on disk sealed, and neither's
    words are in the file;
  - both read back in order;
  - a line sealed under another key is counted `unreadable: 1` while the rest read;
  - an unavailable cipher writes plain.

  183/183. `verify:file` 114/114 and `verify:credentials` 20/20 stay green.

No display changed, so `verify:visual` was not run.

## Gate

At this commit: `npm run typecheck` is clean and the plain suites this milestone reaches
are green (see Checks). The full `npm run verify` ran once for the chain M381–M384 and
M380 on the tree holding all five; its result is in M384's ledger.

## Owed

- **Measured by hand only:** whether a packaged, signed build ever shows a keychain
  prompt on the first sealed write. The credential store has used the same item since
  M14. It is the twelfth step of `npm run handcheck` (`scripts/handcheck-steps.cjs`) and
  the manual-only list's eighth person's check (`verify:meta handcheck.1` pins both).
- **`unreadable` on screen**: a restored chat with sealed lines it cannot open should
  say "N earlier messages could not be read on this Mac". That lands with the Replay
  view (M383).
- **The other records that hold terminal bytes on disk** (the scrollback log, check
  outputs) are not sealed yet. The same line cipher fits them, each its own milestone.

Next: M383 (the Replay view: scrub a node, compare two).
