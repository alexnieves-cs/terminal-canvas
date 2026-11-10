/* The electron-builder configuration, as a FUNCTION.
 *
 * Normally this is a static blob — a "build" key in package.json, or an
 * electron-builder.yml. This repo cannot test a blob: every quality claim here
 * rests on npm run verify, and the pattern that makes each suite possible is
 * always the same one — put the pure part in a module that computes a value
 * from plain data, and keep the impure part elsewhere. tmux-args.ts builds argv
 * while session-backend.ts spawns; layout-store.ts takes a path rather than
 * calling app.getPath; presets.ts takes `which` rather than importing
 * shell-env.ts. A blob has no function in it, so any check written against one
 * would read JSON and compare it to itself.
 *
 * Plain CJS rather than TypeScript, deliberately, in a TypeScript-first repo:
 * electron-builder loads this itself, at build time, in a process this repo
 * does not control and cannot put esbuild in front of. A .ts config would need
 * a bundling step whose only consumer is the bundling step. The payoff is that
 * verify-package.cjs needs no esbuild entry at all, unlike every other
 * plain-node suite here, because there is nothing to resolve.
 *
 * It is import-free on purpose. Requiring anything from src/ would drag the
 * TypeScript build into the config load, and requiring anything from
 * node_modules would make the cheapest suite in the repo depend on an install.
 */
'use strict'

// M631. electron-builder's own directory name for a `dir` target, per arch:
// x64 is the bare `mac`, every other arch is suffixed. Written down ONCE here
// because verify:packaged launches the bundle from that directory and
// release.yml reads the .app out of it; a second copy of this table is how an
// Intel job would go looking in mac-arm64 and report a missing bundle.
const MAC_DIR = { arm64: 'mac-arm64', x64: 'mac', universal: 'mac-universal' }

function buildConfig(opts) {
  const arch = (opts && opts.arch) || 'arm64'
  // M631. A typo in TC_MAC_ARCH must not become an arm64 build shipped under
  // an Intel name (electron-builder ignores an arch it does not know).
  if (!Object.prototype.hasOwnProperty.call(MAC_DIR, arch)) {
    throw new Error(`builder-config: unknown arch "${arch}" (want ${Object.keys(MAC_DIR).join(', ')})`)
  }
  // M630. Signing is a MODE the caller asks for, never something inferred from
  // the machine. electron-builder.config.cjs turns it on only for
  // TC_MAC_SIGN=1, which release.yml sets only when the Apple secrets exist;
  // every other build (verify:packaged, a dev `npm run package`, a fork's CI)
  // stays on the hermetic unsigned path below, whatever keychain it runs on.
  const sign = Boolean(opts && opts.sign)

  return {
    appId: 'com.alexnieves.terminal-canvas',

    // NOT cosmetic. app.getPath('userData') derives from the app's name, so
    // this string is what gives the packaged app its own layout.json, presets,
    // prompts and tmux-exits directory, separate from the dev build's
    // ~/Library/Application Support/terminal-canvas. The consequence is that
    // the packaged app opens on firstRunPanels() — one centred placeholder —
    // rather than on the dev canvas. That is intended: the two are separate
    // installations of the same program.
    productName: 'Terminal Canvas',

    directories: {
      // Already in .gitignore, unlike the dist/ default on some setups.
      output: 'release',
      buildResources: 'build'
    },

    // What electron-vite produced, and nothing that produced it. Production
    // dependencies (node-pty) are resolved by electron-builder itself from
    // package.json rather than by these globs.
    files: [
      // M181 (the Act I close). The THREE bundles by name, never `out/**`: the
      // v9 run keeps its npm cache, a fixed home, tmux sockets and every
      // evidence log under out/ too, and `out/**` packed all of it — a 206 MB
      // asar with a socket inside that Electron could not start from
      // (verify:packaged 3/12, the app exiting 1 before `--version`).
      'out/main/**',
      'out/preload/**',
      'out/renderer/**',
      'package.json',
      '!**/*.tsbuildinfo',
      '!src/**',
      '!scripts/**',
      '!docs/**',
      // scripts/** alone is not enough: the Electron-runtime verify suites
      // (verify:canvas, verify:panels, verify:window, verify:ipc, verify:xterm)
      // esbuild their bundles into out/verify/, which out/** would otherwise
      // ship inside the .app right alongside the code those bundles kill-server
      // against — the exact accident the scripts/** exclusion above exists to
      // prevent, just reached through a different directory.
      '!out/verify/**'
    ],

    asar: true,

    // M54. The URL scheme, declared into Info.plist. Without this the
    // packaged app never receives `open-url`, and terminal-canvas:// works
    // only in the dev build — on the author's machine and nowhere else.
    protocols: [{ name: 'Terminal Canvas', schemes: ['terminal-canvas'] }],

    // THE LOAD-BEARING LINE. node-pty is a native module and a .node binary
    // cannot be required out of an asar archive. Without this the app launches,
    // renders the canvas, shows its first panel, and dies at the first
    // pty:create.
    //
    // Anchored with '**/' rather than at the root so it keeps matching if npm
    // ever hoists node-pty to a nested depth — a root-anchored pattern would
    // stop matching silently, months later, with no code change to blame.
    asarUnpack: ['**/node_modules/node-pty/**',
      // M54. The tc CLI is run as node OUTSIDE the app process, where asar is
      // not readable; see verify:package cli.1.
      '**/out/main/tc.js'],

    mac: {
      category: 'public.app-category.developer-tools',
      // M60. Authored by build/make-icon.cjs; verify:package icon.1 pins the file.
      icon: 'build/icon.icns',
      target: [
        { target: 'dir', arch: [arch] },
        { target: 'dmg', arch: [arch] }
      ],

      // UNSIGNED: EXPLICIT null, not omitted, and the difference is the whole
      // point. Omitted, electron-builder may discover a Developer ID in
      // whichever keychain the build runs against and produce a
      // differently-signed app on a different machine. Explicit null is what
      // makes this build hermetic and offline. M5c ships unsigned by decision,
      // not by accident: another Mac will show Gatekeeper's
      // unidentified-developer block, which is the accepted cost.
      //
      // SIGNED (M630): no identity key at all. The certificate comes from
      // CSC_LINK, which electron-builder imports into a throwaway keychain of
      // its own, so the signed build is hermetic too: it can only ever sign
      // with the one certificate the release job hands it.
      ...(sign ? signedMac() : { identity: null })
    }
  }
}

// M630. What a signed build adds. Notarization REQUIRES the hardened runtime,
// and the hardened runtime is what makes the entitlements file load-bearing
// (each key in it says why). `notarize: true` makes electron-builder submit
// the signed .app to Apple and staple the ticket before the DMG is built, so
// the DMG carries an app that opens offline on first launch. The credentials
// are env, never config: APPLE_API_KEY/APPLE_API_KEY_ID/APPLE_API_ISSUER, or
// APPLE_ID/APPLE_APP_SPECIFIC_PASSWORD/APPLE_TEAM_ID (release.yml sets one set).
function signedMac() {
  return {
    hardenedRuntime: true,
    // electron-builder's own spctl check runs before notarization and fails
    // an app that is correctly signed but not yet notarized; release.yml
    // assesses the finished, stapled app instead.
    gatekeeperAssess: false,
    entitlements: 'build/entitlements.mac.plist',
    entitlementsInherit: 'build/entitlements.mac.plist',
    notarize: true,
    // The usage strings macOS shows when a command run inside a pane asks for
    // one of these (see the entitlements file): without them the prompt names
    // no reason, and Apple Events are refused outright.
    extendInfo: {
      NSAppleEventsUsageDescription: 'A command running in a Terminal Canvas pane wants to control another app.',
      NSMicrophoneUsageDescription: 'A command running in a Terminal Canvas pane wants to use the microphone.',
      NSCameraUsageDescription: 'A command running in a Terminal Canvas pane wants to use the camera.'
    }
  }
}

module.exports = { buildConfig, MAC_DIR }
