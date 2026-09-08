import { redactSecrets } from './redact'

/**
 * M190. FEEDBACK IS A DRAFT, NEVER A SUBMISSION.
 *
 * This app posts nothing: it builds an issue body from facts it already has,
 * scrubs it, and opens the repository's `issues/new` in the person's own
 * browser through the ONE `link:open` door. They read it, edit it, and send it
 * themselves — or close the tab. No credential is read (the store keeps its
 * three pinned readers), no broker call is made, and nothing here knows how to
 * talk to GitHub at all.
 *
 * What travels is chosen by TYPE: the version, the platform, the engine
 * readiness WORDS, and the panel kinds as COUNTS. There is nowhere in this
 * shape for a path, a command, a transcript or a token — the same structural
 * refusal the diagnostics bundle makes.
 *
 * Pure: no DOM, no node. Plain-node checked in `verify:file feedback.1`.
 */

/** A URL a browser will accept; past this the body is cut WITH a line saying so. */
export const FEEDBACK_URL_MAX = 6000

/**
 * The repository the draft is opened against. A CONSTANT rather than a read of
 * `package.json` at runtime: the packaged app's `package.json` is inside the
 * asar and the update check already learned that lesson (`repoOf`), and a
 * feedback door that silently pointed at nothing would look like it worked.
 */
export const FEEDBACK_REPO = 'alexnieves-cs/terminal-canvas'

export interface FeedbackFacts {
  version: string
  platform: string
  /** One row per engine: its name and one of `installed` / `missing` / `unanswered`. */
  engines: { name: string; state: string }[]
  /** Panel kinds as counts — never a title, never a path. */
  kinds: { kind: string; count: number }[]
  /** What the person typed. */
  says: string
}

export interface FeedbackDraft {
  title: string
  body: string
  url: string
  redacted: number
  truncated: boolean
}

export function buildFeedback(repo: string, facts: FeedbackFacts): FeedbackDraft {
  const said = facts.says.trim()
  const { text: saidClean, count: saidCount } = redactSecrets(said === '' ? '' : said)
  const engines = facts.engines.map((e) => `- ${e.name}: ${e.state}`).join('\n') || '- (none reported)'
  const kinds = facts.kinds.filter((k) => k.count > 0).map((k) => `${k.count} ${k.kind}`).join(', ') || 'nothing open'
  const rawBody = [
    saidClean === '' ? '_Say what happened, and what you expected instead._' : saidClean,
    '',
    '---',
    `**Version** ${facts.version} · **Platform** ${facts.platform}`,
    '',
    '**Engines**',
    engines,
    '',
    `**On the canvas** ${kinds}`,
    '',
    '_This draft was prepared by the app and scrubbed of anything that looked like a secret. Nothing has been sent: read it, change it, and submit it yourself — or close this tab._'
  ].join('\n')
  const { text: body, count } = redactSecrets(rawBody)
  const title = saidClean === '' ? 'Feedback' : `Feedback: ${saidClean.split('\n')[0]?.slice(0, 60) ?? ''}`
  const base = `https://github.com/${repo}/issues/new`
  const full = `${base}?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`
  if (full.length <= FEEDBACK_URL_MAX) return { title, body, url: full, redacted: count + saidCount, truncated: false }
  // A cut that is SAID: a body silently truncated at a byte boundary is a
  // report missing the half the person cared about, with nothing on screen to
  // say so.
  // M190's critic (10). The cut is MEASURED against the built url, not
  // guessed from the unencoded length: one CJK or emoji character encodes to
  // nine or twelve, so an arithmetic estimate can report `truncated` for a
  // draft that still does not fit.
  const tail = '\n\n_(this draft was cut to fit in a link — paste the rest in yourself)_'
  let room = body.length
  let cutBody = body
  let url = full
  while (url.length > FEEDBACK_URL_MAX && room > 100) {
    room = Math.floor(room * 0.8)
    cutBody = `${body.slice(0, room)}${tail}`
    url = `${base}?title=${encodeURIComponent(title)}&body=${encodeURIComponent(cutBody)}`
  }
  return { title, body: cutBody, url, redacted: count + saidCount, truncated: true }
}
