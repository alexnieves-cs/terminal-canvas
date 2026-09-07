import type { UpdateResult } from '../shared/ipc-contract'

/**
 * M123 — THE UPDATE CHECK, pure over an injected fetcher.
 *
 * A NOTICE, not an updater: auto-swap is declined by name (`electron-updater`
 * refuses to install an unsigned build on macOS, and this machine holds no
 * `Developer ID Application` identity), so what this answers is "is a newer
 * release published, and where" — three states and never two. `current`,
 * `newer` (with the release's own url) and `could-not-check` (with the
 * reason in the credential rows' words): a check that folded the last into
 * the first would tell an offline user they are up to date, silently.
 *
 * The fetcher is INJECTED and this module imports no `https`: the real one
 * (`https.get`, a 10 s deadline, `User-Agent: terminal-canvas`) lives in
 * `main/index.ts`, which no suite bundles, so `verify:file update.1` drives
 * every arm under plain node and `verify:meta update.1` greps the scripts for
 * a real fetcher. ONE GET of the releases LIST (not `/latest`, which is
 * GitHub's own pick and cannot say WHY it skipped a prerelease): the newest
 * non-prerelease wins by the compare below, a prerelease is skipped by name.
 */

export interface UpdateCheckDeps {
  /** One GET; resolves with what the server said, rejects when it could not be asked. */
  fetch: (url: string) => Promise<{ status: number; body: string }>
  /** `owner/repo`, from `repoOf(package.json)`. */
  repo: string
}

/**
 * Numeric per segment: `3.10.0` is newer than `3.9.1`, which a string compare
 * (and a JSON sort) gets backwards without a word. A `v` prefix is optional;
 * a prerelease suffix (`-beta.1`) is dropped — the feed's own `prerelease`
 * flag is what skips those, not the tag's spelling. Missing segments read
 * as 0, so `3.1` equals `3.1.0`.
 */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string): number[] =>
    v.trim().replace(/^v/i, '').split('-')[0]!.split('.').map((s) => { const n = Number.parseInt(s, 10); return Number.isFinite(n) ? n : 0 })
  const pa = parse(a)
  const pb = parse(b)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d < 0 ? -1 : 1
  }
  return 0
}

/**
 * `package.json`'s `repository` → `owner/repo`, or null. Both shapes npm
 * documents: the object with a `url` (`git+https://github.com/acme/canvas.git`,
 * `git@github.com:acme/canvas.git`) and the `github:acme/canvas` shorthand.
 * Null (no repository, or one that is not on GitHub) becomes a
 * `could-not-check` at the caller, never a guessed owner.
 */
export function repoOf(pkg: { repository?: unknown }): string | null {
  const raw = pkg.repository
  const url = typeof raw === 'string' ? raw : (typeof raw === 'object' && raw !== null && typeof (raw as { url?: unknown }).url === 'string') ? (raw as { url: string }).url : null
  if (url === null) return null
  const m = /github(?:\.com)?[:/]+([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i.exec(url)
  if (m === null) return null
  return `${m[1]}/${m[2]}`
}

export function releasesUrl(repo: string): string {
  return `https://api.github.com/repos/${repo}/releases`
}

interface Release { tag_name: string; prerelease: boolean; html_url: string; publishedAt?: string }

/** The feed's rows that are releases, by name; a malformed row costs that row, never the feed. */
function parseFeed(body: string): Release[] | null {
  let parsed: unknown
  try { parsed = JSON.parse(body) } catch { return null }
  if (!Array.isArray(parsed)) return null
  const out: Release[] = []
  for (const row of parsed) {
    if (typeof row !== 'object' || row === null) continue
    const r = row as { tag_name?: unknown; prerelease?: unknown; html_url?: unknown; draft?: unknown; published_at?: unknown }
    if (typeof r.tag_name !== 'string' || typeof r.html_url !== 'string') continue
    // A draft is not published; GitHub only lists one to a token that can
    // see it, but the arm costs nothing and a draft's tag is a promise.
    if (r.draft === true) continue
    out.push({ tag_name: r.tag_name, prerelease: r.prerelease === true, html_url: r.html_url, ...(typeof r.published_at === 'string' ? { publishedAt: r.published_at } : {}) })
  }
  return out
}

export async function checkForUpdate(current: string, deps: UpdateCheckDeps): Promise<UpdateResult> {
  let answer: { status: number; body: string }
  try {
    answer = await deps.fetch(releasesUrl(deps.repo))
  } catch (e) {
    // The fetcher's own sentence (ENOTFOUND, a timeout): it is the fix.
    return { kind: 'could-not-check', reason: e instanceof Error && e.message !== '' ? e.message : 'the releases feed could not be reached' }
  }
  if (answer.status !== 200) {
    return { kind: 'could-not-check', reason: `GitHub answered ${answer.status}${answer.status === 403 ? ' — the unauthenticated rate limit may be spent; try again later' : ''}` }
  }
  const feed = parseFeed(answer.body)
  if (feed === null) return { kind: 'could-not-check', reason: 'the releases feed could not be read' }
  // The newest RELEASE, by the compare — never the feed's first row: the
  // list is newest-first by creation, and a backported 2.x cut after 3.0
  // would sit above it.
  let newest: Release | null = null
  for (const r of feed) {
    if (r.prerelease) continue
    if (newest === null || compareVersions(r.tag_name, newest.tag_name) > 0) newest = r
  }
  const shown = current.replace(/^v/i, '')
  // Nothing published is NOT "up to date": a fork, a prerelease-only feed or an
  // empty one would read current forever. The third state, with the fact.
  if (newest === null) return { kind: 'could-not-check', reason: `no releases are published for ${deps.repo}` }
  if (compareVersions(newest.tag_name, current) <= 0) return { kind: 'current', version: shown }
  return { kind: 'newer', version: newest.tag_name.replace(/^v/i, ''), url: newest.html_url, ...(newest.publishedAt === undefined ? {} : { publishedAt: newest.publishedAt }) }
}
