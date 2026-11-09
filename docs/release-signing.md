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
   and "Checksums and a codesign note" must show `accepted` /
   `source=Notarized Developer ID` and `The validate action worked!`. The DMG
   is attached to the run as an artifact. Then delete the local `.p12`.

## What CI does with them

- **Signing mode** decides once: signed iff the certificate pair and one
  complete notarization set exist.
- **Build the DMG (signed and notarized)** sets `TC_MAC_SIGN=1`, the only
  switch `build/builder-config.cjs` honours. electron-builder imports the .p12
  into a throwaway keychain, signs every binary with the hardened runtime and
  `build/entitlements.mac.plist`, notarizes, staples, then makes the DMG.
- **Checksums and a codesign note** becomes a gate: `codesign --verify`,
  `spctl --assess` and `stapler validate` must all pass.
- `verify:packaged` stays unsigned on purpose; it tests what is packed, not
  how it is sealed. `verify:package` `sign.*` pins the signed config.

## Renewal

The Developer ID certificate lasts five years; the membership renews yearly
(a lapsed membership stops new notarizations, but already-notarized releases
keep opening). An app-specific password is revoked if you change your Apple ID
password: make a new one and update `APPLE_APP_SPECIFIC_PASSWORD`.
