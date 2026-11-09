/**
 * M643 (lane W). The setup doctor's one new fact: is there EVIDENCE that an
 * agent CLI has been signed in?
 *
 * Most failed first runs are a CLI that is installed and signed out: the
 * panel opens, prints a login prompt, and reads as the app being broken. The
 * first-run card can say so before the first task, but only as far as this
 * module can see without touching a secret:
 *
 * - **Existence only.** It asks whether a credentials file, a keychain item or
 *   an environment variable NAME exists. It never opens the file, never asks
 *   the keychain for the password (`find-generic-password` without `-w` or
 *   `-g` returns attributes and does not prompt), and never reads a value.
 *   Nothing here crosses the bridge except the two words below.
 * - **Two words, and a third that is silence.** `found` is evidence of a
 *   sign-in; `none` is "looked in every place this CLI is known to keep one,
 *   and found nothing"; undefined is "did not or could not look" (an agent
 *   this table does not know, a keychain that did not answer). `none` is not
 *   "signed out": a CLI can keep its sign-in somewhere this table has not
 *   learned, so the card says "no sign-in found" and never blocks a start.
 *   `onboardingReadiness` still reports `authentication: 'unknown'`: the
 *   first real turn remains the only proof (M180).
 *
 * PURE: every fact is injected, so verify:onboarding answers without a Mac.
 */
import type { CliName, SignInEvidence } from '../shared/env-report'

export interface SignInFacts {
  /** The resolved login environment. Only key names are consulted, and `*_HOME`-style keys for a folder. */
  env: Readonly<Record<string, string>>
  home: string
  exists: (path: string) => boolean
  /** macOS keychain: true/false when it answered, undefined when it did not or this is not a Mac. */
  keychainHas?: (service: string) => boolean | undefined
}

interface Source {
  /** Variable NAMES whose presence is a sign-in of its own (an API key, a cloud route). */
  envKeys: readonly string[]
  /** Credential files, relative to the CLI's own folder. */
  files: (f: SignInFacts) => string[]
  keychain?: string
}

const folder = (f: SignInFacts, key: string, fallback: string): string => {
  const set = (f.env[key] ?? '').trim()
  return (set !== '' ? set : `${f.home}/${fallback}`).replace(/\/+$/, '')
}

/** Where each CLI is known to keep a sign-in. A CLI not listed is never judged. */
export const SIGN_IN_SOURCES: Readonly<Partial<Record<CliName, Source>>> = {
  claude: {
    envKeys: ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX'],
    files: (f) => [`${folder(f, 'CLAUDE_CONFIG_DIR', '.claude')}/.credentials.json`],
    keychain: 'Claude Code-credentials'
  },
  codex: {
    envKeys: ['OPENAI_API_KEY', 'CODEX_API_KEY'],
    files: (f) => [`${folder(f, 'CODEX_HOME', '.codex')}/auth.json`]
  },
  gemini: {
    envKeys: ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_APPLICATION_CREDENTIALS', 'GOOGLE_GENAI_USE_VERTEXAI'],
    files: (f) => [`${f.home}/.gemini/oauth_creds.json`]
  }
}

export function signInEvidence(name: CliName, f: SignInFacts): SignInEvidence | undefined {
  const source = SIGN_IN_SOURCES[name]
  if (source === undefined) return undefined
  if (source.envKeys.some((key) => (f.env[key] ?? '') !== '')) return 'found'
  if (source.files(f).some((path) => f.exists(path))) return 'found'
  if (source.keychain !== undefined && f.keychainHas !== undefined) {
    const has = f.keychainHas(source.keychain)
    if (has === true) return 'found'
    // The keychain is one of this CLI's places and it did not answer: not looked, so not `none`.
    if (has === undefined) return undefined
  }
  return 'none'
}
