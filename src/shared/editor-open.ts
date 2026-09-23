/**
 * M313. MEETING AN ENGINEER IN THEIR OWN EDITOR — the pure half.
 *
 * "Open this file at this line" and "open this worktree" are the two moves
 * that let a person adopt the canvas gradually: they read the evidence here
 * and edit where their muscle memory lives. Until M313 a Cmd-clicked
 * `src/a.ts:118` opened the file in its default app and dropped the line with
 * an apology (link-open.ts's note).
 *
 * Three ways to reach an editor, tried in this order for `auto`:
 *  1. its CLI on the LOGIN path (`code -g a.ts:118:4`) — exact, and it reuses
 *     the running window;
 *  2. its URL scheme (`vscode://file/…:118:4`) — works when the app is
 *     installed but its shell command was never added, which is most Macs;
 *  3. the file's default app, with the line dropped and the result SAYING so.
 * A named editor is tried by 1 then 2 and refused by name when neither is
 * there — never silently opened in something else.
 *
 * Imports nothing; plain-node tier (verify:tmux editor.*).
 */

export type EditorId = 'vscode' | 'cursor' | 'windsurf' | 'zed' | 'sublime' | 'idea' | 'webstorm'
export type EditorPref = 'auto' | EditorId | 'system'

export interface EditorTarget {
  path: string
  line?: number
  col?: number
  /** A directory (a worktree) — opened as a folder, never at a line. */
  dir?: boolean
}

interface EditorDef {
  id: EditorId
  label: string
  bins: readonly string[]
  args: (t: EditorTarget) => string[]
  /** The URL scheme, when the editor registers one. */
  url?: (t: EditorTarget) => string
}

const at = (t: EditorTarget): string => `${t.path}${t.line !== undefined ? `:${t.line}${t.col !== undefined ? `:${t.col}` : ''}` : ''}`
const vsLike = (scheme: string) => (t: EditorTarget): string =>
  t.dir === true ? `${scheme}://file${encodeURI(t.path)}?windowId=_blank` : `${scheme}://file${encodeURI(at(t))}`
const vsArgs = (t: EditorTarget): string[] => (t.dir === true ? [t.path] : t.line !== undefined ? ['-g', at(t)] : [t.path])
const jbArgs = (t: EditorTarget): string[] => (t.dir === true || t.line === undefined ? [t.path] : ['--line', String(t.line), ...(t.col !== undefined ? ['--column', String(t.col)] : []), t.path])

/** In `auto`'s order: the editors people most often run beside a terminal agent first. */
export const EDITORS: readonly EditorDef[] = [
  { id: 'cursor', label: 'Cursor', bins: ['cursor'], args: vsArgs, url: vsLike('cursor') },
  { id: 'vscode', label: 'VS Code', bins: ['code', 'code-insiders'], args: vsArgs, url: vsLike('vscode') },
  { id: 'windsurf', label: 'Windsurf', bins: ['windsurf'], args: vsArgs, url: vsLike('windsurf') },
  { id: 'zed', label: 'Zed', bins: ['zed'], args: (t) => [t.dir === true ? t.path : at(t)], url: (t) => `zed://file${encodeURI(t.dir === true ? t.path : at(t))}` },
  { id: 'sublime', label: 'Sublime Text', bins: ['subl'], args: (t) => [t.dir === true ? t.path : at(t)], url: (t) => `subl://open?url=file://${encodeURIComponent(t.path)}${t.line !== undefined ? `&line=${t.line}` : ''}` },
  { id: 'idea', label: 'IntelliJ IDEA', bins: ['idea'], args: jbArgs },
  { id: 'webstorm', label: 'WebStorm', bins: ['webstorm'], args: jbArgs }
]

export function isEditorPref(v: unknown): v is EditorPref {
  return v === 'auto' || v === 'system' || EDITORS.some((e) => e.id === v)
}

export type EditorPlan =
  | { kind: 'cli'; editor: EditorId; label: string; bin: string; args: string[] }
  | { kind: 'url'; editor: EditorId; label: string; url: string }
  | { kind: 'default-app'; path: string; note?: string }
  | { kind: 'refused'; reason: string }

/**
 * How to open `t` under `pref`. `which` resolves a bin on the login PATH;
 * `hasApp` says whether an editor's URL scheme has a handler (main asks the
 * OS). Pure, so every branch is pinned without an editor installed.
 */
export function planEditorOpen(t: EditorTarget, pref: EditorPref, which: (bin: string) => string | null, hasApp: (id: EditorId) => boolean): EditorPlan {
  if (!t.path.startsWith('/')) return { kind: 'refused', reason: `not an absolute path: ${t.path}` }
  const lineNote = t.line !== undefined && t.dir !== true ? `opened in its default app; set “Open files in” to an editor to land on line ${t.line}` : undefined
  if (pref === 'system') return { kind: 'default-app', path: t.path, ...(lineNote === undefined ? {} : { note: lineNote }) }
  const candidates = pref === 'auto' ? EDITORS : EDITORS.filter((e) => e.id === pref)
  for (const e of candidates) {
    for (const b of e.bins) {
      const bin = which(b)
      if (bin !== null) return { kind: 'cli', editor: e.id, label: e.label, bin, args: e.args(t) }
    }
  }
  for (const e of candidates) {
    if (e.url !== undefined && hasApp(e.id)) return { kind: 'url', editor: e.id, label: e.label, url: e.url(t) }
  }
  if (pref !== 'auto') {
    const e = EDITORS.find((x) => x.id === pref)
    return { kind: 'refused', reason: `${e?.label ?? pref} is not installed here — neither its \`${e?.bins[0] ?? pref}\` command nor its app was found` }
  }
  return { kind: 'default-app', path: t.path, ...(lineNote === undefined ? {} : { note: lineNote }) }
}

/** `path:line:col` / `path:line` / `path` → a target. The suffix grammar link-open.ts strips. */
export function parseEditorTarget(text: string): { path: string; line?: number; col?: number } {
  const m = /:(\d+)(?::(\d+))?$/.exec(text)
  if (m === null) return { path: text }
  const line = Number(m[1])
  const col = m[2] === undefined ? undefined : Number(m[2])
  return { path: text.slice(0, m.index), ...(line > 0 ? { line } : {}), ...(col !== undefined && col > 0 ? { col } : {}) }
}

export type EditorOpenResult = { kind: 'opened'; editor: string; note?: string } | { kind: 'refused'; reason: string }
