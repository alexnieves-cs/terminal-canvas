import { outward } from '../shared/outward'

/**
 * M188. THE HTTP NODE'S ONE REQUEST, in main.
 *
 * A GET, and only a GET. Any other method is refused BY NAME and the reason
 * is structural rather than squeamish: a write belongs on the broker's
 * approval path (M102 asks the teammate's own chat before a token is read),
 * and a workflow node that could POST without passing that door would be a
 * way around the one this app already built. The refusal names the method the
 * author wrote, because a node silently rewritten to GET would run something
 * other than what it says.
 *
 * The body is capped INSIDE this module and passes `outward`, the gate every
 * other content leaving a remote server takes (M96): a token a page happens
 * to show is scrubbed and the note names the host and the count.
 *
 * The fetcher is injected, so the whole module runs under plain node in
 * `verify:file node.http.1` and no suite reaches the network.
 */

export const NODE_FETCH_MAX_BYTES = 64 * 1024
export const NODE_FETCH_TIMEOUT_MS = 10_000

export type NodeFetchResult =
  | { kind: 'ok'; status: number; text: string; note: string; truncated: boolean; ms: number }
  | { kind: 'refused'; reason: string }

export interface NodeFetchDeps {
  fetch: (url: string) => Promise<{ status: number; body: string }>
  now: () => number
}

export function httpNodeRefusal(url: string, method: string | undefined): string | null {
  const wanted = (method ?? 'GET').toUpperCase()
  if (wanted !== 'GET') {
    return `${wanted} is a write, and a workflow node has no approval door yet — a write goes through tc api, where the teammate's own chat is asked first`
  }
  let parsed: URL
  try { parsed = new URL(url.trim()) } catch { return `${url.trim() === '' ? 'that node' : url.trim()} is not a URL` }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return `a ${parsed.protocol} url is not one this node fetches — http(s) only`
  // M190's critic (5). A url carrying a username or a password sends Basic
  // auth on the wire and shows only the HOST in the outward note, so the
  // credential is neither scrubbed nor visible. Refused by name; a header is
  // not a thing this node has, deliberately.
  if (parsed.username !== '' || parsed.password !== '') return 'a url with a name and password in it would send them on the wire and show them nowhere — remove them'
  return null
}

export async function runHttpNode(node: { url: string; method?: string }, deps: NodeFetchDeps): Promise<NodeFetchResult> {
  const refusal = httpNodeRefusal(node.url, node.method)
  if (refusal !== null) return { kind: 'refused', reason: refusal }
  const started = deps.now()
  let answer: { status: number; body: string }
  try {
    answer = await deps.fetch(node.url.trim())
  } catch (error) {
    return { kind: 'refused', reason: `that request did not answer: ${error instanceof Error ? error.message : String(error)}` }
  }
  // BYTES, not characters (M190's critic, 6): the cap is a byte count and a
  // UTF-8 body sliced by characters disagrees with the socket's own count.
  const raw = Buffer.from(answer.body, 'utf8')
  const truncated = raw.length > NODE_FETCH_MAX_BYTES
  const body = truncated ? raw.subarray(0, NODE_FETCH_MAX_BYTES).toString('utf8') : answer.body
  let host = 'a remote server'
  try { host = new URL(node.url.trim()).host } catch { /* the refusal above already parsed it */ }
  const gated = outward(body, `a remote server at ${host}`)
  return { kind: 'ok', status: answer.status, text: gated.text, note: gated.note, truncated, ms: deps.now() - started }
}
