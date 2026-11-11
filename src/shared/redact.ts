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
  { pattern: /\bxox[abpors]-[A-Za-z0-9-]{10,}\b/g, placeholder: '[redacted slack token]' },
  // The 2026-11-09 audit's additions: shapes an agent prints just as often as
  // the ones above, none of which the `sk-` rule reaches (Stripe's separator is
  // an underscore). Each has a distinctive prefix, so none can touch a sha.
  { pattern: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g, placeholder: '[redacted stripe key]' },
  { pattern: /\bAIza[A-Za-z0-9_-]{35}(?![A-Za-z0-9_-])/g, placeholder: '[redacted google api key]' },
  { pattern: /\bglpat-[A-Za-z0-9_-]{20,}/g, placeholder: '[redacted gitlab token]' },
  { pattern: /\bnpm_[A-Za-z0-9]{36}\b/g, placeholder: '[redacted npm token]' },
  { pattern: /\bhf_[A-Za-z0-9]{30,}\b/g, placeholder: '[redacted hugging face token]' },
  // A password inside a URL (`https://user:pass@host`, a database DSN). The
  // scheme, the user and the host stay so the line still says where it points;
  // only the password goes. A URL with no userinfo is never touched (redact.3).
  // The placeholder holds NO SPACE, unlike the others: phoneText cuts a word at
  // its last `@`, and a space inside the userinfo would split the word first and
  // leave the user name on the phone (verify:mcp push.1).
  { pattern: /\b([a-z][a-z0-9+.-]*:\/\/[^\s:/@]+):[^\s/@]+@/gi, placeholder: '$1:[redacted]@' }
]

export function redactSecrets(text: string): Redaction {
  let count = 0
  let out = text
  for (const rule of RULES) {
    out = out.replace(rule.pattern, (_match: string, group1: unknown) => {
      count += 1
      // `$1` is the one back-reference a placeholder may carry (the URL rule's
      // scheme-and-user); a function replacer does not expand it on its own.
      // M660. Inserted by a function too: a string replacement would read a
      // `$&` or `$'` inside the user name as a pattern and mangle the line.
      return typeof group1 === 'string' ? rule.placeholder.replace('$1', () => group1) : rule.placeholder
    })
  }
  return { text: out, count }
}
