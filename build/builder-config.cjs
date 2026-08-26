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

function buildConfig(opts) {
  const arch = (opts && opts.arch) || 'arm64'

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
      'out/**',
      'package.json',
      '!**/*.tsbuildinfo',
      '!src/**',
      '!scripts/**',
      '!docs/**'
    ],

    asar: true,

    // THE LOAD-BEARING LINE. node-pty is a native module and a .node binary
    // cannot be required out of an asar archive. Without this the app launches,
    // renders the canvas, shows its first panel, and dies at the first
    // pty:create.
    //
    // Anchored with '**/' rather than at the root so it keeps matching if npm
    // ever hoists node-pty to a nested depth — a root-anchored pattern would
    // stop matching silently, months later, with no code change to blame.
    asarUnpack: ['**/node_modules/node-pty/**'],

    mac: {
      category: 'public.app-category.developer-tools',
      target: [
        { target: 'dir', arch: [arch] },
        { target: 'dmg', arch: [arch] }
      ],

      // EXPLICIT, not omitted, and the difference is the whole point. Omitted,
      // electron-builder may discover a Developer ID in whichever keychain the
      // build runs against and produce a differently-signed app on a different
      // machine. Explicit null is what makes this build hermetic and offline.
      // M5c ships unsigned by decision, not by accident: another Mac will show
      // Gatekeeper's unidentified-developer block, which is the accepted cost.
      identity: null
    }
  }
}

module.exports = { buildConfig }
