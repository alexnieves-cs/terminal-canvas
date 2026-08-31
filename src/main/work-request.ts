/**
 * What both work adapters need from the network, and the one implementation of
 * it.
 *
 * The TYPES live in main rather than in shared/ deliberately: nothing here
 * crosses IPC, and a requester type in shared/ would invite the renderer to
 * imagine it could make a request. What DOES cross IPC is `WorkListResult`,
 * which is in shared/ for exactly that reason — see the M14 boundary rule this
 * milestone inherits rather than reinvents: no IPC return carries a secret, and
 * a credential never reaches the renderer at all.
 *
 * It is injected everywhere it is used (the same trade `GitRunner` makes for
 * review and `credential-crypto` makes for the store), which is what keeps
 * `verify:work` in the cheap plain-node tier and keeps `npm run verify` offline
 * — the repo's one green-or-not signal must not depend on GitHub being up.
 */
import { request } from 'node:https'

export const WORK_TIMEOUT_MS = 15000
export const WORK_MAX_BODY_BYTES = 1024 * 1024

export interface WorkRequest {
  url: string
  headers: Record<string, string>
  timeoutMs: number
}

export interface WorkResponse {
  status: number
  body: string
  /**
   * Header names LOWER-CASED, so a caller never has to guess the casing a
   * service happened to send.
   *
   * Jira ignores these entirely; GitHub cannot, because it answers 403 both for
   * a rejected token and for an exhausted search rate limit, and
   * `x-ratelimit-remaining` is the only thing that separates them. Reporting a
   * spent rate limit as a bad credential sends the user off to regenerate a
   * token that was fine — a confident wrong answer, which is the one direction
   * this app's integration surfaces are built never to fail in.
   */
  headers: Record<string, string>
}

export type WorkRequester = (req: WorkRequest) => Promise<WorkResponse>

export function createWorkRequester(): WorkRequester {
  return ({ url, headers, timeoutMs }) =>
    new Promise((resolve, reject) => {
      const req = request(url, { method: 'GET', headers, timeout: timeoutMs }, (res) => {
        let body = ''
        let bytes = 0
        res.setEncoding('utf8')
        res.on('data', (part: string) => {
          bytes += Buffer.byteLength(part)
          // Capped for the reason every reader of something this app does not
          // own is capped (REVIEW_FILE_CAP, the prompt reader's 64KB): a
          // service is free to answer with more than we asked for.
          if (bytes > WORK_MAX_BODY_BYTES) res.destroy(new Error('response too large'))
          else body += part
        })
        res.on('end', () => {
          const flat: Record<string, string> = {}
          for (const [key, value] of Object.entries(res.headers)) {
            if (typeof value === 'string') flat[key.toLowerCase()] = value
            else if (Array.isArray(value)) flat[key.toLowerCase()] = value.join(', ')
          }
          resolve({ status: res.statusCode ?? 0, body, headers: flat })
        })
        res.on('error', reject)
      })
      req.on('timeout', () => req.destroy(new Error('timeout')))
      req.on('error', reject)
      req.end()
    })
}
