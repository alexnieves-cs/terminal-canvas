/* M695. The self-update feed, as a VALUE, and the one place its file names
 * are spelled.
 *
 * Electron's built-in autoUpdater is Squirrel.Mac. With
 * `setFeedURL({ url, serverType: 'json' })` it GETs one static JSON file and
 * reads `currentRelease`; when that differs from the running app's
 * CFBundleVersion it downloads the zip that release's `updateTo.url` names,
 * checks it against the running app's own code signature, and applies it the
 * next time the app starts. So the feed is a plain file on the GitHub release
 * itself, one per chip, written by release.yml's publish job (a signed
 * release only) and fetched by main/self-update.ts at
 * `releases/download/v<version>/update-<arch>.json`: PINNED to the tag the
 * update check chose, never `latest`, because Squirrel.Mac would install an
 * older `currentRelease` just as readily as a newer one.
 *
 * Import-free plain CJS for the reason builder-config.cjs gives: release.yml
 * runs it with bare node on a runner that has done no install, and
 * verify:package requires it directly. main/self-update.ts spells the feed's
 * asset name a second time (it is TypeScript and cannot require this file);
 * verify:file selfupdate.4 holds the two together.
 *
 * Run: node build/update-feed.cjs <owner/repo> <tag> <outDir>
 * writes update-arm64.json and update-x64.json into outDir.
 */
'use strict'

const ARCHES = ['arm64', 'x64']

/** The feed file a build of `arch` asks for. */
function feedAssetName(arch) {
  return `update-${arch}.json`
}

/** The zip of the signed, stapled .app that release.yml names per chip. */
function zipAssetName(version, arch) {
  return `Terminal-Canvas-${version}-${arch}-mac.zip`
}

/**
 * The JSON Squirrel.Mac reads (Electron's documented static-file format):
 * `currentRelease` and one entry under `releases` whose `updateTo.url` is
 * the zip. `pub_date` is ISO 8601. Nothing about the person who asks is in
 * it, and nothing in it changes per request: it is a file, not a server.
 */
function updateFeed({ repo, tag, arch, pubDate, notes }) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(String(repo))) throw new Error(`update-feed: repo "${repo}" is not owner/repo`)
  const m = /^v(\d+\.\d+\.\d+)$/.exec(String(tag))
  if (m === null) throw new Error(`update-feed: tag "${tag}" is not v<major>.<minor>.<patch>`)
  if (!ARCHES.includes(arch)) throw new Error(`update-feed: unknown arch "${arch}" (want ${ARCHES.join(', ')})`)
  const version = m[1]
  return {
    currentRelease: version,
    releases: [{
      version,
      updateTo: {
        version,
        name: `Terminal Canvas ${version}`,
        notes: typeof notes === 'string' ? notes : '',
        pub_date: pubDate,
        url: `https://github.com/${repo}/releases/download/${tag}/${zipAssetName(version, arch)}`
      }
    }]
  }
}

module.exports = { ARCHES, feedAssetName, zipAssetName, updateFeed }

if (require.main === module) {
  const [repo, tag, outDir] = process.argv.slice(2)
  if (!repo || !tag || !outDir) {
    console.error('usage: node build/update-feed.cjs <owner/repo> <tag> <outDir>')
    process.exit(2)
  }
  const fs = require('fs')
  const path = require('path')
  const pubDate = new Date().toISOString()
  for (const arch of ARCHES) {
    const file = path.join(outDir, feedAssetName(arch))
    fs.writeFileSync(file, JSON.stringify(updateFeed({ repo, tag, arch, pubDate }), null, 2) + '\n')
    console.log(`wrote ${file}`)
  }
}
