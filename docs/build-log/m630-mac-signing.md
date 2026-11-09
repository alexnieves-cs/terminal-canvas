# M630: signed and notarized Mac releases, when the secrets exist

Item 4 of the 2026-11-01 plan ("do all of it"). Stream B's files.

- `build/builder-config.cjs` takes `sign`; unsigned stays `identity: null`
  (check 8), signed omits identity (CSC_LINK supplies it) and adds the hardened
  runtime, `build/entitlements.mac.plist`, `notarize: true` and the usage
  strings. `electron-builder.config.cjs` turns it on only for `TC_MAC_SIGN=1`.
- `release.yml`: a "Signing mode" step decides from the secrets; a half set is
  red; signed builds gate on codesign, spctl and stapler; release notes drop
  the Open Anyway steps when signed.
- `verify:package` `sign.1`–`sign.5`.
- The owner's steps (Apple account, certificate, secrets): docs/release-signing.md.

Not yet proved against Apple: the signed path runs for the first time when the
secrets are added. The unsigned path was proved on the PR's release run.
