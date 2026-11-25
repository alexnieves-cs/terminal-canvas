# Signing and notarizing the Mac release (M630)

`release.yml` builds a **signed and notarized** DMG when the Apple secrets
below exist in the repository, and the same unsigned DMG as 6.0 when they do
not. Nothing else changes: no secrets, no signing, no failure. A partial set is
red on purpose, so a release meant to be signed can never ship without it.

Signed means macOS opens the app on first launch with no "unidentified
developer" or "damaged" warning, and the release notes drop the Open Anyway steps.

## What only the owner can do

These steps need your Apple account and a Mac with Keychain Access; nothing in
CI can do them for you.

1. **Join the Apple Developer Program** (individual, US$99 a year) at
   <https://developer.apple.com/programs/enroll/>. Approval can take a day or two.
   Your **Team ID** is the 10-character code on
   <https://developer.apple.com/account> under Membership details.
2. **Make a Developer ID Application certificate.** On your Mac, open Xcode →
   Settings → Accounts, select your Apple ID, then Manage Certificates → **+** →
   **Developer ID Application**. (Without Xcode: make a certificate signing
   request in Keychain Access → Certificate Assistant, then upload it at
   <https://developer.apple.com/account/resources/certificates/add> choosing
   *Developer ID Application*, and double-click the downloaded file.)
   It must be *Developer ID Application*, not *Apple Development* or
   *Mac App Distribution*: only Developer ID apps can be notarized for download.
3. **Export it as a .p12.** In Keychain Access → login → My Certificates, find
   "Developer ID Application: <your name> (<TEAM ID>)", expand it so the private
   key shows, right-click the certificate → Export → `.p12`, and set a password.
   Then turn it into one line of text:
   `base64 -i DeveloperID.p12 | pbcopy`
4. **Make a notarization credential.** The simpler choice is an
   **app-specific password**: <https://account.apple.com> → Sign-In and
   Security → App-Specific Passwords → **+**, name it "terminal-canvas notary".
   (The alternative is an App Store Connect API key, below; use it if you would
   rather not tie releases to your Apple ID.)
5. **Add the secrets** at
   <https://github.com/alexnieves-cs/terminal-canvas/settings/secrets/actions>
   → New repository secret:

   | Secret | Value |
   |---|---|
   | `MAC_CERT_P12_BASE64` | the base64 line from step 3 |
   | `MAC_CERT_PASSWORD` | the .p12 password from step 3 |
   | `APPLE_ID` | your Apple ID email |
   | `APPLE_APP_SPECIFIC_PASSWORD` | the password from step 4 |
   | `APPLE_TEAM_ID` | the Team ID from step 1 |

   Or, for the API key route, instead of the last three: create a key at
   <https://appstoreconnect.apple.com/access/integrations/api> with the
   *Developer* role and add `APPLE_API_KEY_P8` (the whole `.p8` file's text),
   `APPLE_API_KEY_ID` (the Key ID) and `APPLE_API_ISSUER` (the Issuer ID on
   that page). If both sets exist, the API key is used.
6. **Prove it** without releasing: Actions → release → Run workflow (leave
   *release* unticked). The run log's "Signing mode" step says it is signing,
   and "Name the DMG and a codesign note" must show `accepted` /
   `source=Notarized Developer ID` and `The validate action worked!`. The DMG
   is attached to the run as an artifact. Then delete the local `.p12`.

## What CI does with them

- **Signing mode** decides once: signed iff the certificate pair and one
  complete notarization set exist.
- **Build the DMG (signed and notarized)** sets `TC_MAC_SIGN=1`, the only
  switch `build/builder-config.cjs` honours. electron-builder imports the .p12
  into a throwaway keychain, signs every binary with the hardened runtime and
  `build/entitlements.mac.plist`, notarizes, staples, then makes the DMG.
- **Name the DMG and a codesign note** becomes a gate: `codesign --verify`,
  `spctl --assess` and `stapler validate` must all pass, and (M695) the
  bundle's `CFBundleVersion` must equal `package.json`'s version. It also
  copies the zip of the stapled app as `Terminal-Canvas-<version>-<arch>-mac.zip`.
- **Publish the release** (M695), signed releases only: writes
  `update-arm64.json` and `update-x64.json` with `build/update-feed.cjs` and
  uploads them with the zips. These are what a signed copy of the app reads
  to install the next version (see "Updates and the network" below).
- `verify:packaged` stays unsigned on purpose; it tests what is packed, not
  how it is sealed. `verify:package` `sign.*` pins the signed config.

## Checklist: once the secrets exist (M698)

Run these in order. Each step says what to look for; stop at the first one
that does not match.

1. **Secrets.** Steps 1 to 5 above. Both build legs read the same secrets.
2. **Dry run.** Actions → release → Run workflow, branch `main`, *release*
   unticked. In each leg (`build (arm64, …)` and `build (x64, …)`):
   - "Signing mode" prints `Signing with the Developer ID certificate; notarizing with: appleid` (or `api`).
   - "Name the DMG and a codesign note" prints `CFBundleVersion <version>`,
     `valid on disk`, `satisfies its Designated Requirement`,
     `Authority=Developer ID Application: <your name> (<TEAM ID>)`,
     `TeamIdentifier=<TEAM ID>`, `accepted`, `source=Notarized Developer ID`
     and `The validate action worked!`.
   - The run's artifacts `dmg-arm64` and `dmg-x64` each hold the DMG,
     `Terminal-Canvas-<version>-<arch>-mac.zip`, `codesign-<arch>.txt` and
     `signed-<arch>.txt` reading `true`.
3. **On a Mac.** Download the `dmg-arm64` (or `dmg-x64`) artifact, open the
   DMG, drag the app to Applications and open it. There must be no warning.
   `spctl -a -vv "/Applications/Terminal Canvas.app"` prints `accepted` and
   `source=Notarized Developer ID`.
4. **The crash-report address (optional).** See "Crash reports: the project
   address" below. Skip it and crash reports stay off for everyone who has
   not entered their own address.
5. **First signed release.** Bump `package.json`'s version, merge, and tag
   `v<version>` (or Run workflow with *release* ticked). The release must
   list both DMGs, both versionless DMGs, both `-mac.zip` files,
   `update-arm64.json`, `update-x64.json` and `SHA256SUMS.txt`, and its notes
   must not have the Open Anyway steps. Open `update-arm64.json`:
   `currentRelease` is the version and `updateTo.url` is this tag's
   `Terminal-Canvas-<version>-arm64-mac.zip`.
6. **First update, by hand.** Only a signed copy can install an update, so
   this needs two signed releases. With the first signed release installed in
   Applications, publish the next one, then in the app: palette → Check for
   updates… → Install update <version>… → Download and install. Quit and
   reopen (or Restart now) and check the About box shows the new version.
   An unsigned copy must still only show Open release.
7. **Remove the Open Anyway steps, after step 5 has shipped.** These still
   tell people how to open an unsigned app, and must stay until a signed
   release is the one people download:
   - `README.md`: the "not signed yet" line in the intro, and install step 2
     ("The release is not signed, so macOS blocks the first launch", with the
     `xattr` command).
   - `Casks/terminal-canvas.rb`: the `caveats` lines about Open Anyway and `xattr`.
   - `docs/guide/install.md`: the "Releases are not signed with an Apple
     Developer ID yet" section and its `xattr` command.
   - `docs/guide/faq.md`: the answer that starts "The release is not signed
     with an Apple Developer ID yet".
   The release notes need no edit: `release.yml` already drops the steps for
   a signed release.

## Crash reports: the project address (M696)

*Send crash reports to the maintainers* is off for everyone until they turn
it on, and even then it sends nothing until a build carries an address. The
address is read at build time from `TC_CRASH_DSN`; release.yml passes the
repository **variable** of that name to the step that builds. A DSN can only
submit events, so it is a variable, not a secret. Unset, every build has no
address. Set but malformed, the build fails rather than ship a toggle that
cannot report.

1. Create a project for an Electron app in Sentry (or GlitchTip, which takes
   the same DSN). Copy its DSN from the project's Client Keys page. It has
   the form `https://<key>@<host>/<project id>`.
2. In that project's Security & Privacy settings, turn on *Prevent Storing of
   IP Addresses* and keep the data scrubber on. The app already removes paths
   and tokens and never sends a user or a host name; this covers what the
   service itself records.
3. Add the variable at
   <https://github.com/alexnieves-cs/terminal-canvas/settings/variables/actions>
   → New repository variable: name `TC_CRASH_DSN`, value the DSN.
4. The next release build compiles it in. In that release, Settings → Privacy
   & export shows the toggle's last clause as "this build sends them to the
   maintainers' crash-report service at <host>" instead of "nothing is sent".
   Turn it on, restart, and the app's log has
   `[startup] telemetry=on to=project nativeCrashes=false`.
5. To stop, delete the variable. The next build has no address again.

A local build reads the same variable: `TC_CRASH_DSN=<dsn> npm run package`.

## Updates and the network (M695)

What the app asks for, and when. Nothing here carries an account, a token
or anything about your work.

- **The check** (`update.checkOnLaunch`, or palette → Check for updates…):
  one `GET https://api.github.com/repos/<owner>/<repo>/releases`. Every build
  makes it the same way; it downloads nothing.
- **The install** happens only in a signed copy, only with *Offer to install
  updates* (`update.offerInstall`) on, and only after you choose *Download and
  install* in the app's own dialog. Then Electron's built-in updater
  (Squirrel.Mac) makes two requests to GitHub release downloads, both pinned
  to the tag the check found:
  1. `GET https://github.com/<owner>/<repo>/releases/download/v<version>/update-<arch>.json`
  2. `GET` the zip that file names, `Terminal-Canvas-<version>-<arch>-mac.zip`.
  GitHub redirects both to its own download host. Before the new app is
  used, Squirrel.Mac checks that it is signed to the same designated
  requirement as the running app. It is installed the next time the app
  starts.
- **Before any of that**, the app reads its own signature with
  `/usr/bin/codesign` (local, no network) to decide whether to offer
  *Install*. An unsigned, ad hoc or broken signature means no offer.

Turn *Offer to install updates* off in Settings → General → Updates and every build
behaves like an unsigned one: the notice links to the release and nothing
downloads.

## Renewal

The Developer ID certificate lasts five years; the membership renews yearly
(a lapsed membership stops new notarizations, but already-notarized releases
keep opening). An app-specific password is revoked if you change your Apple ID
password: make a new one and update `APPLE_APP_SPECIFIC_PASSWORD`.
