/**
 * M276. Monaco, wired for THIS renderer: bundled, worker and all, under a CSP
 * of `default-src 'self'` that names no `worker-src` (so the worker falls back
 * to 'self') and a packaged renderer that loads from `file://`.
 *
 * What is imported, and what deliberately is NOT:
 *
 * - `editor/edcore.main` — the API plus `editor.all`'s contributions (find,
 *   bracket matching, multi-cursor, comment toggling). `editor/editor.api`
 *   alone compiles and renders a box that cannot find text, which reads as a
 *   broken editor rather than an absent feature.
 * - `basic-languages/monaco.contribution` — Monarch highlighting for every
 *   language Monaco ships. Monarch is a regex tokenizer that runs on the main
 *   thread; it starts no worker of its own.
 * - NOT `language/{typescript,json,css,html}/monaco.contribution`. Each of
 *   those is a real language SERVICE with its own dedicated worker — four more
 *   bundles and four more `file://` worker loads for diagnostics nobody asked
 *   a file panel for. A file panel shows and edits a file; it is not an IDE,
 *   and `editor.main` (which pulls all four) is the import to avoid here.
 *
 * That leaves exactly ONE worker in the bundle — `editorWorkerService`, which
 * Monaco starts LAZILY for diffing, links and word-based suggestions. It is
 * bundled through Vite's `?worker`, which emits a real asset served beside the
 * app's own chunks, because the CSP refuses a `blob:` worker (what
 * `?worker&inline` would produce) with no error at all — the silent-failure
 * shape this repo keeps paying for. See `EDITOR_OPTIONS`: the features that
 * would summon the worker are off, so the ordinary path never needs it, and
 * the bundled worker is what makes the paths that do work rather than throw.
 */
// Two imports for one library, and the split is forced: `edcore.main` is the
// bundle that REGISTERS the contributions but ships no `.d.ts`, while
// `editor.api` is the same API object with types beside it (`edcore.main`'s
// last line is `export * from './editor.api.js'`, so these are one module in
// two spellings, not two copies).
import 'monaco-editor/esm/vs/editor/edcore.main'
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api'
import 'monaco-editor/esm/vs/basic-languages/monaco.contribution'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'

// Monaco reads this global when it first needs a worker. Assigned at module
// scope rather than inside the component: a second assignment after an editor
// exists is ignored, and a FIRST one that lands after the request throws
// "You must define a function MonacoEnvironment.getWorkerUrl".
;(self as unknown as { MonacoEnvironment?: unknown }).MonacoEnvironment = {
  getWorker(): Worker { return new EditorWorker() }
}

export { monaco }

/** The theme name registered below. Monaco requires a string, not an object. */
export const THEME = 'terminal-canvas'

/**
 * Monaco takes `#rrggbb`, never `var(--fg)`, so the theme is READ off the live
 * document rather than restated here. Restating it is how a restyle changes
 * `--s-1` and the editor keeps the old ground for a release: the rule this
 * repo writes as "don't restate a count in prose in more than one place",
 * applied to colour. `data-theme` flips the same tokens, so re-reading on that
 * attribute is the whole of theme support.
 */
const token = (name: string, fallback: string): string => {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  // Monaco throws on a malformed colour and takes the editor down with it, so
  // an unresolved token falls back rather than propagating. A token can be
  // unresolved for one legitimate reason: this runs before styles.css has
  // applied, which the MutationObserver below then corrects.
  return /^#[0-9a-f]{3,8}$/i.test(v) ? v : fallback
}

let applied: string | null = null

/**
 * Registers (or re-registers) the theme from the document's current tokens.
 * Idempotent and cheap; `defineTheme` on an existing name replaces it and
 * every mounted editor repaints, which is exactly what a theme flip wants.
 */
export const syncTheme = (): void => {
  const dark = document.documentElement.getAttribute('data-theme') === 'dark'
  const bg = token('--s-1', dark ? '#12161f' : '#f6f7fa')
  const fg = token('--fg', dark ? '#e9ecf4' : '#1b1e26')
  const muted = token('--fg-2', dark ? '#b8bfcd' : '#3f4552')
  const line = token('--line', dark ? '#262c39' : '#d3d7de')
  const accent = token('--iris', dark ? '#67e8f9' : '#0b7f97')
  const key = `${dark}|${bg}|${fg}|${muted}|${line}|${accent}`
  if (key === applied) return
  applied = key
  monaco.editor.defineTheme(THEME, {
    base: dark ? 'vs-dark' : 'vs',
    // false: inherit the base theme's TOKEN colours (the syntax palette), and
    // override only the chrome below. true would leave every token unstyled
    // and the highlighting would silently do nothing.
    inherit: true,
    rules: [],
    colors: {
      'editor.background': bg,
      'editor.foreground': fg,
      'editorLineNumber.foreground': muted,
      'editorLineNumber.activeForeground': fg,
      'editorCursor.foreground': accent,
      'editorIndentGuide.background1': line,
      'editorWidget.background': bg,
      'editorWidget.border': line,
      'editorGutter.background': bg,
      // The panel paints its own focus ring; a second border inside it reads
      // as a nested box rather than a focused editor.
      'focusBorder': bg
    }
  })
  monaco.editor.setTheme(THEME)
}

syncTheme()
new MutationObserver(syncTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

/**
 * --sp-5 as a number, for the one option Monaco will not take a token for.
 * Falls back to the scale's own value if the token has not resolved yet.
 */
const SP_5 = ((): number => {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--sp-5').trim()
  const n = Number.parseFloat(raw)
  return Number.isFinite(n) && n > 0 ? n : 12
})()

/**
 * The shared editor options. Every feature that would summon the worker or an
 * absent language service is off — see the module comment — and the type
 * scale, ground and mono face come from the same tokens the read view uses so
 * entering edit mode does not reflow the text the reader was just looking at
 * (the rule `.file-node__editor` has carried since M27).
 */
export const EDITOR_OPTIONS: Parameters<typeof monaco.editor.create>[1] = {
  automaticLayout: true,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  renderLineHighlight: 'none',
  // Two panel-shaped choices, not preferences: a file panel is narrow and
  // arbitrarily sized, so long lines WRAP rather than hiding behind a
  // horizontal scrollbar the frame gives no room to reach.
  wordWrap: 'on',
  lineNumbers: 'on',
  lineNumbersMinChars: 3,
  folding: false,
  // Worker-summoning features, off. Not a taste call: each of these is a
  // reason Monaco reaches for `editorWorkerService` on a surface where its
  // answers would be noise anyway (there is no project model behind a single
  // opened file, so "suggestions" means words already on screen).
  wordBasedSuggestions: 'off',
  quickSuggestions: false,
  suggestOnTriggerCharacters: false,
  links: false,
  occurrencesHighlight: 'off',
  codeLens: false,
  contextmenu: false,
  // Monaco takes a NUMBER, so the scale is read rather than restated: this is
  // --sp-5, the same token `.file-node__editor-preload` pads with, so the text
  // does not shift when the pre-paint hands over to the editor. A literal here
  // would also be a literal the style suite cannot see (check 6 only reads
  // CSS), so it would drift off the scale silently.
  padding: { top: SP_5, bottom: SP_5 },
  scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10, useShadows: false },
  overviewRulerLanes: 0,
  fixedOverflowWidgets: true
}

/**
 * Path → Monaco language id, through Monaco's OWN registry rather than a
 * second table: `getLanguages()` carries the extensions each contribution
 * registered, so a language Monaco adds is a language this app highlights,
 * with nothing here to update. Falls back to plaintext, which is what an
 * unknown extension should look like.
 */
export const languageFor = (path: string): string => {
  const name = path.split('/').pop() ?? ''
  const dot = name.lastIndexOf('.')
  const ext = dot > 0 ? name.slice(dot).toLowerCase() : ''
  for (const lang of monaco.languages.getLanguages()) {
    if (lang.extensions?.some((e: string) => e.toLowerCase() === ext)) return lang.id
    if (lang.filenames?.some((f: string) => f.toLowerCase() === name.toLowerCase())) return lang.id
  }
  return 'plaintext'
}
