/**
 * M39, for M48. Backlog #31's standing rule made concrete: anything that moves
 * terminal bytes OFF the machine is a disclosure surface, because agents print
 * secrets — they `cat` a `.env`, echo a token into a curl, paste an error with
 * a session cookie in it. This is the scrubber that surface applies before a
 * byte leaves. It is deliberately NOT applied to the live terminal (the
 * user's own screen) and not to the local log (marked, not redacted, by the
 * setting's own description); its customers are the text export and the
 * diagnostics bundle.
 *
 * Detection is heuristic and fails toward the user, never toward silence:
 * every match becomes a placeholder that NAMES what it replaced, nothing is
 * dropped, and the count comes back so an export can say how many. The
 * patterns are the well-known shapes with a distinctive prefix or envelope;
 * a bare hex sha, a UUID or the word "token" is never touched, because an
 * export that redacts a commit sha is one nobody can act on.
 *
 * Imports nothing; plain-node checked in verify:usage.
 */
export interface Redaction {
  text: string
  count: number
}

const RULES: Array<{ pattern: RegExp; placeholder: string }> = [
  // Envelopes first, so a key inside one is one replacement, not many.
  { pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, placeholder: '[redacted private key]' },
  { pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/g, placeholder: 'Bearer [redacted bearer token]' },
  { pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, placeholder: '[redacted jwt]' },
  { pattern: /\bAKIA[0-9A-Z]{16}\b/g, placeholder: '[redacted aws key]' },
  { pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/g, placeholder: '[redacted github token]' },
  { pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, placeholder: '[redacted github token]' },
  { pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/g, placeholder: '[redacted api key]' },
  { pattern: /\bxox[abpors]-[A-Za-z0-9-]{10,}\b/g, placeholder: '[redacted slack token]' }
]

export function redactSecrets(text: string): Redaction {
  let count = 0
  let out = text
  for (const rule of RULES) {
    out = out.replace(rule.pattern, () => {
      count += 1
      return rule.placeholder
    })
  }
  return { text: out, count }
}
