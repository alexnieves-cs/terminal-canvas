/**
 * The UX pass (notes/ux-proposals.md 5.2). PASTE SOMETHING, GET A TASK.
 *
 * Text pasted onto the empty canvas, with no panel holding the keyboard and
 * no copied objects or Mermaid to place, used to land nowhere: the paste
 * returned and said nothing. The things a person most often has on the
 * clipboard when they want work done are an issue link, a failing CI link or
 * an error. Each of those becomes the New task sheet, filled in and NOT
 * started — the sheet is still where the person says go, so nothing pasted
 * runs anything (the inert-until-looked-at rule).
 *
 * Pure: no DOM. `verify:ux ux.paste.*`.
 */

export interface PasteTaskSeed {
  title: string
  brief: string
}

const MAX_TITLE = 80

function clip(line: string): string {
  const t = line.trim().replace(/\s+/g, ' ')
  return t.length > MAX_TITLE ? `${t.slice(0, MAX_TITLE - 1)}…` : t
}

/** A seed for New task from pasted text, or null when the text is none of the shapes it knows. */
export function taskSeedFromPaste(raw: string): PasteTaskSeed | null {
  const text = raw.trim()
  if (text === '') return null
  if (!/\s/.test(text)) {
    let url: URL | null = null
    try { url = new URL(text) } catch { /* not a URL */ }
    if (url !== null && (url.protocol === 'https:' || url.protocol === 'http:')) {
      const gh = /^\/([^/]+)\/([^/]+)\/(issues|pull)\/(\d+)/.exec(url.pathname)
      if (url.hostname === 'github.com' && gh !== null) {
        const [, owner, repo, kind, n] = gh
        return kind === 'pull'
          ? { title: `Review ${owner}/${repo}#${n}`, brief: `Review the pull request at ${text}.` }
          : { title: `Resolve ${owner}/${repo}#${n}`, brief: `Work on the issue at ${text}.` }
      }
      if (url.hostname === 'github.com' && /^\/[^/]+\/[^/]+\/actions\/runs\/\d+/.test(url.pathname)) {
        return { title: 'Fix the failing CI run', brief: `Find out why this CI run failed and fix the cause: ${text}` }
      }
      const jira = /\/browse\/([A-Z][A-Z0-9]+-\d+)/.exec(url.pathname)
      if (jira !== null) return { title: `Resolve ${jira[1]}`, brief: `Work on the ticket at ${text}.` }
    }
    return null
  }
  // An error: a stack frame, a Python traceback, or a line naming an Error or Exception.
  const lines = text.split('\n')
  const errorLine = lines.find((l) => /\b[A-Z]\w*(Error|Exception)\b[:(]?/.test(l) || /^\s*(error|fatal|panic)\b[:[]/i.test(l))
  const stacky = /^\s+at\s+\S/m.test(text) || /Traceback \(most recent call last\)/.test(text) || /^\s+File "[^"]+", line \d+/m.test(text)
  if (errorLine !== undefined && (stacky || lines.length <= 3)) {
    return { title: `Fix: ${clip(errorLine)}`, brief: `Find the cause of this error and fix it:\n\n\`\`\`\n${text}\n\`\`\`` }
  }
  return null
}
