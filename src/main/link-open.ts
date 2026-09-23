import { isAbsolute, join } from 'node:path'

/**
 * M51. The pure half of link:open — what a Cmd-clicked path or URL turns
 * into. Plain-node tested (verify:tmux link-open.1); main/index.ts does the
 * opening with the result.
 *
 * Only main opens anything: the renderer's CSP is default-src 'self' and
 * will-navigate is blocked outright, because a navigation kills the window's
 * PTYs. So the renderer sends the TEXT it underlined and the panel it came
 * from, and this decides. A URL opens only on http/https — never file:,
 * never javascript: — and a path is resolved against the panel's cwd with ~
 * expanded and its :line[:col] suffix stripped, and opens only if it exists.
 * Everything else is a RESULT with a reason: a refusal is a sentence the
 * palette can show, never a throw and never a navigation.
 */
export interface LinkOpenRequest {
  target: string
  /** The panel's cwd as main knows it — the live one when tmux reports it. */
  cwd: string
}

export type LinkOpenResolution =
  | { kind: 'url'; url: string }
  /**
   * `line`/`col` from a `:line[:col]` suffix. M313: the handler takes them to
   * the person's editor (editor-open.ts); `note` is what is said when the
   * opener falls back to the default app and the line is dropped.
   */
  | { kind: 'path'; path: string; line?: number; col?: number; note?: string }
  | { kind: 'refused'; reason: string }

export interface LinkOpenDeps {
  home: string
  exists: (path: string) => boolean
}

const SUFFIX = /:(\d+)(?::(\d+))?$/

export function resolveLinkOpen(req: LinkOpenRequest, deps: LinkOpenDeps): LinkOpenResolution {
  const target = req.target.trim()
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(target) || /^[a-z][a-z0-9+.-]*:/i.test(target) && !target.startsWith('~') && !/^\.{0,2}\//.test(target) && !/\//.test(target.split(':')[0] ?? '')) {
    // A scheme. Only the web opens.
    let url: URL
    try { url = new URL(target) } catch { return { kind: 'refused', reason: `not a URL this app opens: ${target}` } }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return { kind: 'refused', reason: `only http and https links open here, not ${url.protocol.replace(':', '')}` }
    return { kind: 'url', url: url.toString() }
  }
  const m = SUFFIX.exec(target)
  const bare = m ? target.slice(0, m.index) : target
  const expanded = bare === '~' ? deps.home : bare.startsWith('~/') ? join(deps.home, bare.slice(2)) : bare
  const path = isAbsolute(expanded) ? expanded : join(req.cwd, expanded)
  if (!deps.exists(path)) return { kind: 'refused', reason: `${path} does not exist` }
  return m
    ? { kind: 'path', path, line: Number(m[1]), ...(m[2] !== undefined ? { col: Number(m[2]) } : {}), note: `opened in its default app; going to line ${m[1]} needs an editor — set “Open files in”` }
    : { kind: 'path', path }
}

/** For harnesses that register the handler without a real opener behind it. */
export interface LinkHandlers {
  open: (req: { panelId: string; target: string }) => { kind: 'opened' | 'refused'; reason?: string } | Promise<{ kind: 'opened' | 'refused'; reason?: string }>
}
export const INERT_LINKS: LinkHandlers = { open: () => ({ kind: 'refused', reason: 'links are not wired in this process' }) }
