/**
 * M696. THE PROJECT'S CRASH-REPORT ADDRESS COMES FROM THE BUILD, AND IS EMPTY
 * UNTIL THE OWNER SETS ONE.
 *
 * `telemetry.crashReports` sends to an address the maintainers own. M652 kept
 * that address as a literal in main/telemetry.ts, empty, so filling it meant a
 * code change. It is now read ONCE, at `electron-vite build` time, from the
 * environment variable `TC_CRASH_DSN` (release.yml passes the repository
 * variable of that name to the step that builds), and compiled into main as
 * `__TC_CRASH_DSN__`. Unset or empty, the build has no address and the toggle
 * sends nothing, which is every build until the owner sets the variable. Set
 * but malformed, the BUILD FAILS: a typo must never ship as a release whose
 * toggle says it reports and does not.
 *
 * A DSN is not a secret (it can only submit events), so a repository VARIABLE
 * is the right home, not a secret, and the value may appear in a build log.
 * Import-free so electron.vite.config.ts can load it before any bundling.
 */

/** `https://<key>@<host>/<project>`: Sentry's own shape, nothing looser. */
export const DSN_SHAPE = /^https:\/\/[A-Za-z0-9]+@[A-Za-z0-9.-]+(:\d+)?\/\d+$/

/** The build's address, or '' for none. Throws on a value that is set and is not a DSN. */
export function buildTimeDsn(env: Record<string, string | undefined>): string {
  const raw = (env.TC_CRASH_DSN ?? '').trim()
  if (raw === '') return ''
  if (!DSN_SHAPE.test(raw)) {
    throw new Error('TC_CRASH_DSN is set but is not a DSN of the form https://<key>@<host>/<project>; fix the value or unset it to build with no crash-report address')
  }
  return raw
}

/** The host a DSN sends to, for the sentence that says where; null when it is not a DSN. */
export function dsnHost(dsn: string): string | null {
  if (!DSN_SHAPE.test(dsn)) return null
  return dsn.slice(dsn.indexOf('@') + 1).split('/')[0]!.split(':')[0]!
}
