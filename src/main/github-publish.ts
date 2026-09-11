import { readFileSync, statSync } from 'node:fs'
import { basename, dirname } from 'node:path'
import { outward } from '../shared/outward'
import { NOT_CONNECTED_CODE } from '../shared/credential-schema'
import type { GithubPublishRequest, GithubPublishResult } from '../shared/ipc-contract'

/**
 * M255. PUBLISHING IS A PERSON'S ACT, WITH THE TEXT IN FRONT OF THEM.
 *
 * Three GitHub writes — a release, a PR comment, a Discussion — each made
 * from a DRAFT FILE an agent or a person wrote. The order is the design:
 *
 *   1. read the draft (capped; a missing file or a directory is refused by
 *      name before anyone is asked),
 *   2. resolve the repository from the draft's OWN `origin` remote, so a
 *      draft cannot publish into a repository it is not in,
 *   3. pass the body through `outward()` — the one gate — keeping the count,
 *   4. ASK, every time, naming the repository, the target, the title, the
 *      opening lines and the redaction count (no memo: the broker's session
 *      grants are exactly what this path must not have),
 *   5. only then call the broker with `personConfirmed`, the one way a write
 *      with no teammate passes (`broker.ts`, M255).
 *
 * A Discussion's GraphQL lookups are POSTs too, so they run AFTER the
 * confirmation: a cancel costs nothing and reads nothing. Pure over injected
 * `broker`, `confirm` and `remoteOf`; `verify:github publish.*` drives it
 * with real temp files for the draft.
 */

export const PUBLISH_MAX_BYTES = 256 * 1024

export type PublishRequest = GithubPublishRequest

/**
 * M255. The request as it crossed the bridge, checked field by field: an
 * absolute path, a tag that is a tag, a positive whole PR number, a
 * category that is text. A malformed request is refused BY NAME — never
 * coerced into a publish nobody typed.
 */
export function parsePublishRequest(raw: unknown): PublishRequest | string {
  if (raw === null || typeof raw !== 'object') return 'the publish request was not an object'
  const r = raw as Record<string, unknown>
  if (typeof r.path !== 'string' || !r.path.startsWith('/')) return 'publish needs the draft file\'s absolute path — select the draft file on the canvas'
  if (r.kind === 'release') {
    if (typeof r.tag !== 'string' || !/^[A-Za-z0-9._+\/-]{1,100}$/.test(r.tag)) return `${JSON.stringify(r.tag)} is not a tag — write one like v1.2.0`
    return { kind: 'release', path: r.path, tag: r.tag }
  }
  if (r.kind === 'comment') {
    const n = typeof r.number === 'string' ? Number(r.number.replace(/^#/, '')) : r.number
    if (typeof n !== 'number' || !Number.isInteger(n) || n <= 0) return `${JSON.stringify(r.number)} is not a pull request number — write one like 42`
    return { kind: 'comment', path: r.path, number: n }
  }
  if (r.kind === 'discussion') {
    if (typeof r.category !== 'string' || r.category.trim() === '' || r.category.length > 100) return 'a Discussion needs a category name, such as Announcements'
    return { kind: 'discussion', path: r.path, category: r.category.trim() }
  }
  return `${JSON.stringify(r.kind)} is not something this app publishes — a release, a comment or a discussion`
}

/** What the person is shown before anything leaves. Never carries the unscrubbed text. */
export interface PublishAsk {
  kind: PublishRequest['kind']
  repo: string
  title: string
  redacted: number
  /** The question: what will happen, and where. */
  message: string
  /** The title, the opening lines as they will be sent, and the redaction note. */
  detail: string
}

export type PublishResult = GithubPublishResult

type Answer = { ok: true; status: number; body: string; truncated: boolean } | { ok: false; reason: string; code?: string }

export interface PublishDeps {
  broker: { call(req: { service: string; method: string; path: string; body?: string; personConfirmed?: true }): Promise<Answer> }
  confirm: (ask: PublishAsk) => Promise<boolean>
  /** The URL of the draft directory's `origin` remote, or null when it has none. */
  remoteOf: (dir: string) => Promise<string | null>
  readText?: (path: string) => { kind: 'text'; text: string } | { kind: 'refused'; reason: string }
}

/** `git@github.com:o/r.git`, `https://github.com/o/r(.git)`, `ssh://git@github.com/o/r.git` → `o/r`; anything else null. */
export function repoFromRemote(url: string): string | null {
  const m = /^(?:git@github\.com:|https:\/\/(?:[^@/]+@)?github\.com\/|ssh:\/\/git@github\.com\/)([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?$/.exec(url.trim())
  return m === null ? null : `${m[1]}/${m[2]}`
}

/** The draft, capped. Each refusal names the file, so the person knows which one. */
export function readDraft(path: string): { kind: 'text'; text: string } | { kind: 'refused'; reason: string } {
  let size: number
  try {
    const st = statSync(path)
    if (!st.isFile()) return { kind: 'refused', reason: `${path} is not a file — publish a draft file, such as RELEASE_NOTES.md` }
    size = st.size
  } catch {
    return { kind: 'refused', reason: `${basename(path)} could not be read — no such file at ${path}` }
  }
  if (size > PUBLISH_MAX_BYTES) return { kind: 'refused', reason: `${basename(path)} is over ${PUBLISH_MAX_BYTES / 1024} KB — a draft that long is not a post` }
  try {
    return { kind: 'text', text: readFileSync(path, 'utf8') }
  } catch (error) {
    return { kind: 'refused', reason: `${basename(path)} could not be read — ${error instanceof Error ? error.message : String(error)}` }
  }
}

/** The first `# heading` is the title and leaves the body; otherwise the file name is the title. */
function split(text: string, path: string): { title: string; body: string } {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const at = lines.findIndex((l) => l.trim() !== '')
  const heading = at === -1 ? null : /^#\s+(.+?)\s*#*\s*$/.exec(lines[at] as string)
  if (heading !== null) return { title: heading[1] as string, body: lines.slice(at + 1).join('\n').trim() }
  return { title: basename(path).replace(/\.[^.]+$/, ''), body: text.trim() }
}

/** The broker's refusal, sorted by CODE (never its sentence) into the three arms. */
function refusalOf(answer: { reason: string; code?: string }): PublishResult {
  if (answer.code === NOT_CONNECTED_CODE) return { kind: 'no-credential', reason: answer.reason }
  if (answer.code === 'not-asked' || answer.code === 'not-answered' || answer.code === 'not-granted') return { kind: 'refused', reason: answer.reason }
  return { kind: 'unavailable', reason: answer.reason }
}

function messageOf(body: string): string | null {
  try { const m = (JSON.parse(body) as { message?: unknown }).message; return typeof m === 'string' ? m : null } catch { return null }
}

const REPO_QUERY = 'query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { id discussionCategories(first: 50) { nodes { id name } } } }'
const CREATE_DISCUSSION = 'mutation($repositoryId: ID!, $categoryId: ID!, $title: String!, $body: String!) { createDiscussion(input: { repositoryId: $repositoryId, categoryId: $categoryId, title: $title, body: $body }) { discussion { url } } }'

export async function publish(deps: PublishDeps, req: PublishRequest): Promise<PublishResult> {
  const draft = (deps.readText ?? readDraft)(req.path)
  if (draft.kind === 'refused') return draft
  const remote = await deps.remoteOf(dirname(req.path))
  if (remote === null) return { kind: 'refused', reason: `${basename(req.path)} is not in a repository with an origin remote — publish a draft from inside the repository it is for` }
  const repo = repoFromRemote(remote)
  if (repo === null) return { kind: 'refused', reason: `the origin remote (${remote}) is not a GitHub repository — only GitHub is a publishing target` }
  const { title, body: raw } = split(draft.text, req.path)
  const gated = outward(raw, basename(req.path))
  const titleGated = outward(title, basename(req.path))
  const redacted = gated.redacted + titleGated.redacted
  // The opening lines, and — the critic's point — an honest count of what is
  // NOT shown: the whole body is what is sent, so a long draft's confirm must
  // not read as the entire post.
  const shownLines = gated.text.split('\n').filter((l) => l.trim() !== '')
  const hidden = Math.max(0, shownLines.length - 8)
  const preview = `${shownLines.slice(0, 8).join('\n')}${hidden === 0 ? '' : `\n\n… and ${hidden} more line${hidden === 1 ? '' : 's'} not shown here — the whole draft is sent; read it in ${basename(req.path)} before confirming`}`
  const scrubNote = redacted === 0 ? 'nothing looked like a secret' : `${redacted} secret${redacted === 1 ? '' : 's'} redacted before sending`
  const message = req.kind === 'release'
    ? `Publish a GitHub release ${req.tag} to ${repo}?`
    : req.kind === 'comment'
      ? `Comment on ${repo}#${req.number}?`
      : `Post a GitHub Discussion in "${req.category}" on ${repo}?`
  const ask: PublishAsk = { kind: req.kind, repo, title: titleGated.text, redacted, message, detail: `${repo} · ${titleGated.text}\n\n${preview}\n\n${scrubNote}` }
  if (!(await deps.confirm(ask))) return { kind: 'cancelled' }

  const post = (path: string, payload: unknown): Promise<Answer> =>
    deps.broker.call({ service: 'github', method: 'POST', path, body: JSON.stringify(payload), personConfirmed: true })

  if (req.kind === 'release' || req.kind === 'comment') {
    const answer = req.kind === 'release'
      ? await post(`/repos/${repo}/releases`, { tag_name: req.tag, name: titleGated.text, body: gated.text })
      : await post(`/repos/${repo}/issues/${req.number}/comments`, { body: gated.text })
    if (!answer.ok) return refusalOf(answer)
    if (answer.status === 401) return { kind: 'refused', reason: 'GitHub rejected the credential — replace it in ⌘K › Credentials' }
    if (answer.status !== 201) return { kind: 'unavailable', reason: `GitHub answered ${answer.status}${messageOf(answer.body) === null ? '' : ` — ${messageOf(answer.body)}`}` }
    let url: unknown
    try { url = (JSON.parse(answer.body) as { html_url?: unknown }).html_url } catch { url = undefined }
    return { kind: 'published', url: typeof url === 'string' ? url : '', redacted }
  }

  // A Discussion: the repository and category ids, then the mutation.
  const [owner, name] = repo.split('/') as [string, string]
  const looked = await post('/graphql', { query: REPO_QUERY, variables: { owner, name } })
  if (!looked.ok) return refusalOf(looked)
  let found: { id?: string; discussionCategories?: { nodes?: { id: string; name: string }[] } } | undefined
  try { found = (JSON.parse(looked.body) as { data?: { repository?: typeof found } }).data?.repository } catch { found = undefined }
  if (found === undefined || found === null || typeof found.id !== 'string') return { kind: 'unavailable', reason: `GitHub did not answer with ${repo}'s repository — ${messageOf(looked.body) ?? 'it may not exist, or the token cannot see it'}` }
  const categories = found.discussionCategories?.nodes ?? []
  const category = categories.find((c) => c.name.toLowerCase() === req.category.trim().toLowerCase())
  if (category === undefined) {
    return { kind: 'refused', reason: categories.length === 0
      ? `${repo} has Discussions turned off, or no categories — nothing was posted`
      : `${repo} has no Discussion category "${req.category}" — it has ${categories.map((c) => `"${c.name}"`).join(', ')}; nothing was posted` }
  }
  const created = await post('/graphql', { query: CREATE_DISCUSSION, variables: { repositoryId: found.id, categoryId: category.id, title: titleGated.text, body: gated.text } })
  if (!created.ok) return refusalOf(created)
  let url: unknown
  try { url = (JSON.parse(created.body) as { data?: { createDiscussion?: { discussion?: { url?: unknown } } } }).data?.createDiscussion?.discussion?.url } catch { url = undefined }
  if (typeof url !== 'string') return { kind: 'unavailable', reason: `GitHub did not create the Discussion — ${messageOf(created.body) ?? 'no URL came back'}` }
  return { kind: 'published', url, redacted }
}
