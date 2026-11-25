import type { SettingValue } from '../shared/settings-schema'
import type { UpdateInstallResult } from '../shared/ipc-contract'
import { compareVersions } from './update-check'

/**
 * M695 — SELF-UPDATE, pure over injected facts and an injected updater.
 *
 * M123's notice declined auto-swap because the build was unsigned, and on
 * macOS that is not a preference: Electron's built-in `autoUpdater` is
 * Squirrel.Mac, which refuses to run in an app with no code signature and
 * checks every download against the running app's own designated
 * requirement. A signed build removes that reason, so a signed build may now
 * install a newer release. Three things stay true from M123, and this module
 * is where each is decided:
 *
 * 1. ONLY A SIGNED BUILD. `selfUpdatePlan` reads the signature macOS itself
 *    reports (`codesign --verify --strict`, then `codesign --display`): the
 *    seal must verify, the leaf authority must be a Developer ID Application
 *    certificate with a team, and the hardened runtime must be on, which is
 *    what release.yml's signed job produces and nothing else here does. An
 *    unsigned, ad-hoc or broken build gets an `off` arm by name and keeps
 *    today's notice, unchanged. A build-time flag would say what was ASKED
 *    for; the signature says what HAPPENED, and it is the same fact
 *    Squirrel.Mac will check.
 * 2. NOTHING WITHOUT A YES. Squirrel.Mac applies a downloaded update the next
 *    time the app starts whether or not anyone calls `quitAndInstall`, so the
 *    download IS the install. The consent question is therefore asked BEFORE
 *    `setFeedURL` and `checkForUpdates`, never after; a decline touches the
 *    updater not at all (`verify:file selfupdate.2`).
 * 3. OFF IS A SETTING. `update.offerInstall` off is the first arm, before any
 *    process is spawned to read a signature.
 *
 * The feed is a static file on GitHub Releases (`serverType: 'json'`), PINNED
 * to the tag the M123 check already chose (`v<version>/update-<arch>.json`),
 * never `releases/latest`: GitHub's own pick of "latest" could be an older
 * backport, and Squirrel.Mac installs whatever `currentRelease` names when it
 * differs from the running version, downgrades included. build/update-feed.cjs
 * writes the file in release.yml's publish job; `verify:file selfupdate.4`
 * holds the two spellings of the asset name together.
 */

export const SELF_UPDATE_SETTING = 'update.offerInstall'

/** The two chips release.yml builds; anything else has no feed. */
export type FeedArch = 'arm64' | 'x64'

export type SelfUpdateOff =
  | 'turned-off'
  | 'not-macos'
  | 'not-packaged'
  | 'unknown-arch'
  | 'not-an-app-bundle'
  | 'not-installed'
  | 'no-feed'
  | 'could-not-read-signature'
  | 'unsigned'
  | 'signature-invalid'
  | 'ad-hoc'
  | 'not-developer-id'
  | 'no-hardened-runtime'

export type SelfUpdatePlan =
  | { on: false; reason: SelfUpdateOff }
  | { on: true; repo: string; arch: FeedArch; teamId: string }

/** What `codesign` printed. Both commands write their report to stderr. */
export interface SignatureRead {
  /** `codesign --verify --strict --verbose=2 <app>`: exit code and text. */
  verifyCode: number
  verifyText: string
  /** `codesign --display --verbose=2 <app>`. */
  display: string
}

export interface PlanFacts {
  setting: SettingValue | undefined
  platform: string
  packaged: boolean
  arch: string
  /** `process.execPath`; the bundle is the `.app` it runs from. */
  execPath: string
  /** `owner/repo`, or null when package.json names none. */
  repo: string | null
}

/** `/Applications/X.app/Contents/MacOS/X` → `/Applications/X.app`; anything else → null. */
export function appBundleOf(execPath: string): string | null {
  const m = /^(\/.+?\.app)\/Contents\/MacOS\/[^/]+$/.exec(execPath)
  return m === null ? null : m[1]!
}

export interface CodesignFacts {
  /** `Authority=` lines in order, leaf certificate first. */
  authorities: string[]
  /** `TeamIdentifier=`, or null for `not set` or none. */
  teamId: string | null
  adhoc: boolean
  /** The CodeDirectory flags name `runtime` (the hardened runtime notarization requires). */
  runtime: boolean
}

export function readCodesignDisplay(text: string): CodesignFacts {
  const authorities: string[] = []
  let teamId: string | null = null
  let adhoc = false
  let runtime = false
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (line.startsWith('Authority=')) authorities.push(line.slice('Authority='.length).trim())
    else if (line.startsWith('TeamIdentifier=')) {
      const v = line.slice('TeamIdentifier='.length).trim()
      teamId = v === '' || v === 'not set' ? null : v
    } else if (line === 'Signature=adhoc') adhoc = true
    const flags = /flags=0x[0-9a-f]+\(([^)]*)\)/i.exec(line)
    if (flags !== null) {
      const names = flags[1]!.split(',').map((s) => s.trim())
      if (names.includes('runtime')) runtime = true
      if (names.includes('adhoc')) adhoc = true
    }
  }
  return { authorities, teamId, adhoc, runtime }
}

/**
 * The order of the arms is the rule. The cheap facts first, so a turned-off
 * setting, a dev build or a non-Mac never spawns `codesign` at all (the probe
 * is called only after every cheap arm passes, and `selfupdate.1` counts the
 * calls). Then the signature, strictest last: unsigned is its own word
 * because it is the expected answer for every build before M630's secrets
 * exist, and the person can act on it (download by hand).
 */
export async function selfUpdatePlan(facts: PlanFacts, probe: (bundle: string) => Promise<SignatureRead | null>): Promise<SelfUpdatePlan> {
  // `=== true`, never truthy: a string or an absent key is off.
  if (facts.setting !== true) return { on: false, reason: 'turned-off' }
  if (facts.platform !== 'darwin') return { on: false, reason: 'not-macos' }
  if (!facts.packaged) return { on: false, reason: 'not-packaged' }
  if (facts.arch !== 'arm64' && facts.arch !== 'x64') return { on: false, reason: 'unknown-arch' }
  const bundle = appBundleOf(facts.execPath)
  if (bundle === null) return { on: false, reason: 'not-an-app-bundle' }
  // Squirrel.Mac replaces the bundle in place, so it cannot update a copy
  // run straight from the disk image (read-only) or one macOS moved to a
  // randomized quarantine path because it was never dragged to a folder.
  if (bundle.startsWith('/Volumes/') || bundle.includes('/AppTranslocation/')) return { on: false, reason: 'not-installed' }
  if (facts.repo === null) return { on: false, reason: 'no-feed' }
  let read: SignatureRead | null
  try { read = await probe(bundle) } catch { read = null }
  if (read === null) return { on: false, reason: 'could-not-read-signature' }
  if (read.verifyCode !== 0) {
    return { on: false, reason: /not signed at all/i.test(read.verifyText) ? 'unsigned' : 'signature-invalid' }
  }
  const sig = readCodesignDisplay(read.display)
  if (sig.adhoc) return { on: false, reason: 'ad-hoc' }
  if (sig.teamId === null || sig.authorities.length === 0 || !sig.authorities[0]!.startsWith('Developer ID Application:')) {
    return { on: false, reason: 'not-developer-id' }
  }
  if (!sig.runtime) return { on: false, reason: 'no-hardened-runtime' }
  return { on: true, repo: facts.repo, arch: facts.arch, teamId: sig.teamId }
}

/** Each off arm as the sentence a refusal says. */
export function offWords(reason: SelfUpdateOff): string {
  switch (reason) {
    case 'turned-off': return 'installing updates is turned off in Settings (Offer to install updates)'
    case 'not-macos': return 'updates install themselves only on macOS'
    case 'not-packaged': return 'a development build does not install updates'
    case 'unknown-arch': return 'there is no update feed for this kind of Mac'
    case 'not-an-app-bundle': return 'this copy is not running from an app bundle'
    case 'not-installed': return 'this copy is running from the disk image or a quarantine folder; drag it into Applications, open it from there, and try again'
    case 'no-feed': return 'this build names no GitHub repository to update from'
    case 'could-not-read-signature': return 'this app’s signature could not be read, so it does not install updates'
    case 'unsigned': return 'this build is not signed, so it cannot install updates — download the release by hand'
    case 'signature-invalid': return 'this app’s signature does not verify, so it cannot install updates — download the release by hand'
    case 'ad-hoc': return 'this build is signed ad hoc, not with a Developer ID, so it cannot install updates'
    case 'not-developer-id': return 'this build is not signed with a Developer ID, so it cannot install updates'
    case 'no-hardened-runtime': return 'this build was not signed for notarization, so it cannot install updates'
  }
}

/** The release asset Squirrel.Mac reads. build/update-feed.cjs writes the same name. */
export function feedAssetName(arch: FeedArch): string {
  return `update-${arch}.json`
}

/** A release tag's version: plain `x.y.z`. The M123 check never offers a prerelease. */
const VERSION = /^\d+\.\d+\.\d+$/

export function feedUrl(repo: string, version: string, arch: FeedArch): string {
  return `https://github.com/${repo}/releases/download/v${version}/${feedAssetName(arch)}`
}

/** The consent question. Pinned by `selfupdate.3`: it says where from, what checks it, and when it applies. */
export function consentAsk(version: string): { message: string; detail: string; verb: string } {
  return {
    message: `Install Terminal Canvas ${version}?`,
    detail: [
      'It downloads now from this project’s GitHub releases. Before it is used, the download is checked against this copy’s code signature, so only an app signed by the same developer can replace it.',
      'It is installed the next time Terminal Canvas starts; you can keep working until then. The requests ask only for the release files: nothing about you or your work is in them.'
    ].join('\n\n'),
    verb: 'Download and install'
  }
}

export function restartAsk(version: string): { message: string; detail: string; verb: string } {
  return {
    message: `Terminal Canvas ${version} is ready`,
    detail: 'Restart now to finish, or keep working: it is installed the next time the app starts. Restarting quits the way ⌘Q does, so running agents end unless Keep agents running after quit is on.',
    verb: 'Restart now'
  }
}

/** The updater, as the four things this module asks of it; the wiring adapts Electron's `autoUpdater`. */
export interface Updater {
  setFeedURL(options: { url: string; serverType: 'json' }): void
  checkForUpdates(): void
  quitAndInstall(): void
  /** Each returns the function that removes the listener. */
  onError(listener: (message: string) => void): () => void
  onDownloaded(listener: () => void): () => void
  onNotAvailable(listener: () => void): () => void
}

export interface InstallDeps {
  plan: () => Promise<SelfUpdatePlan>
  /** `app.getVersion()`. */
  current: string
  confirm: (ask: { message: string; detail: string; verb: string }) => Promise<boolean>
  updater: Updater
  /** How long a download may take before the answer is `failed`; 15 minutes when absent. */
  timeoutMs?: number
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (handle: unknown) => void
  /** Called instead of `quitAndInstall` directly, so the reply can leave first; defaults to calling it now. */
  defer?: (fn: () => void) => void
}

export interface SelfUpdater {
  install(req: unknown): Promise<UpdateInstallResult>
}

/**
 * One updater per process. Squirrel.Mac holds one staged update; a second
 * download while one runs would fetch the zip twice (Electron's own note on
 * `checkForUpdates`), so the state is here and a second ask is refused by name.
 */
export function createSelfUpdater(deps: InstallDeps): SelfUpdater {
  let downloading: string | null = null
  let ready: string | null = null
  // A download whose ANSWER timed out may still be running inside Squirrel.Mac,
  // which cannot be cancelled; asking it again would fetch the zip twice.
  let lingering: string | null = null
  const setTimer = deps.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms))
  const clearTimer = deps.clearTimer ?? ((h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>))
  const defer = deps.defer ?? ((fn: () => void) => fn())

  const askRestart = async (version: string): Promise<UpdateInstallResult> => {
    if (await deps.confirm(restartAsk(version))) {
      defer(() => deps.updater.quitAndInstall())
      return { kind: 'restarting', version }
    }
    return { kind: 'ready', version }
  }

  return {
    install: async (req) => {
      const version = typeof req === 'object' && req !== null && typeof (req as { version?: unknown }).version === 'string'
        ? (req as { version: string }).version.trim().replace(/^v/i, '')
        : ''
      if (!VERSION.test(version)) return { kind: 'refused', reason: 'name the version to install, as x.y.z' }
      if (compareVersions(version, deps.current) <= 0) return { kind: 'refused', reason: `${version} is not newer than this copy (${deps.current})` }
      // Already downloaded this session: the only question left is when.
      if (ready === version) return askRestart(version)
      if (ready !== null) return { kind: 'refused', reason: `${ready} is already downloaded and installs when the app restarts` }
      if (downloading !== null) return { kind: 'refused', reason: `${downloading} is already downloading` }
      if (lingering !== null) return { kind: 'refused', reason: `an earlier download of ${lingering} may still be running; restart Terminal Canvas to try again` }
      const plan = await deps.plan()
      if (!plan.on) return { kind: 'refused', reason: offWords(plan.reason) }
      // THE QUESTION COMES FIRST. Nothing below runs on a no.
      if (!(await deps.confirm(consentAsk(version)))) return { kind: 'declined' }
      downloading = version
      const outcome = await new Promise<{ ok: true } | { ok: false; reason: string }>((resolve) => {
        let done = false
        const offs: Array<() => void> = []
        let timer: unknown = null
        const settle = (answer: { ok: true } | { ok: false; reason: string }): void => {
          if (done) return
          done = true
          if (timer !== null) clearTimer(timer)
          for (const off of offs) off()
          resolve(answer)
        }
        offs.push(deps.updater.onDownloaded(() => settle({ ok: true })))
        offs.push(deps.updater.onError((message) => settle({ ok: false, reason: message === '' ? 'the update could not be downloaded' : message })))
        offs.push(deps.updater.onNotAvailable(() => settle({ ok: false, reason: `the ${version} release has no update for this Mac` })))
        // A deadline for the ANSWER, not for Squirrel.Mac: it cannot be
        // cancelled, so a download that finishes after this still applies at
        // the next start, which the person has already agreed to.
        const ms = deps.timeoutMs ?? 15 * 60_000
        timer = setTimer(() => { lingering = version; settle({ ok: false, reason: `the download did not finish within ${Math.round(ms / 60_000)} minutes` }) }, ms)
        try {
          deps.updater.setFeedURL({ url: feedUrl(plan.repo, version, plan.arch), serverType: 'json' })
          deps.updater.checkForUpdates()
        } catch (e) {
          settle({ ok: false, reason: e instanceof Error && e.message !== '' ? e.message : 'the updater refused the feed' })
        }
      })
      downloading = null
      if (!outcome.ok) return { kind: 'failed', reason: outcome.reason }
      ready = version
      return askRestart(version)
    }
  }
}
