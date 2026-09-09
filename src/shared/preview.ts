/**
 * M185. THE PREVIEW'S PURE RULES — what a project preview is, before anything
 * runs a process or opens a socket. Shared by main's discoverer, the browser
 * node, the palette rows and the agent verbs, so the four doors cannot drift.
 *
 * Pure: no DOM, no node. Plain-node checked in `verify:file preview.1`.
 */

/**
 * A named width, never a text field. The brief's "device widths and reload are
 * compact named controls": a person previewing a page wants the phone, not
 * 390. `full` is the pane's own width and is the ABSENT default — a record
 * without a `device` is every pre-M185 browser panel and must warn nothing.
 */
export interface DeviceWidth {
  id: 'phone' | 'tablet' | 'laptop' | 'full'
  label: string
  /** CSS pixels, or `null` for the pane's own width. */
  px: number | null
}

export const DEVICE_WIDTHS: readonly DeviceWidth[] = [
  { id: 'phone', label: 'Phone', px: 390 },
  { id: 'tablet', label: 'Tablet', px: 834 },
  { id: 'laptop', label: 'Laptop', px: 1280 },
  { id: 'full', label: 'Full width', px: null }
]

export type DeviceWidthId = DeviceWidth['id']

export function deviceWidth(id: string | undefined): DeviceWidth {
  return DEVICE_WIDTHS.find((d) => d.id === id) ?? (DEVICE_WIDTHS[3] as DeviceWidth)
}

export function isDeviceWidthId(value: unknown): value is DeviceWidthId {
  return typeof value === 'string' && DEVICE_WIDTHS.some((d) => d.id === value)
}

/** A port a process of this panel's own tree is listening on. */
export interface ListeningPort { pid: number; port: number }

/**
 * `lsof -nP -iTCP -sTCP:LISTEN -a -p <pids>` in its machine-readable field
 * form (`-F pn`): `p<pid>` lines followed by `n<address>` lines. Parsed rather
 * than the human table because the table's NAME column is padded and the
 * address form differs between `*:5173` and `127.0.0.1:5173` — and a preview
 * URL built from a mis-split column points at nothing with no error.
 *
 * A `n` line with no preceding `p` line is dropped (it belongs to no process
 * this app asked about); a port that is not a positive integer is dropped;
 * the same pid and port twice (IPv4 and IPv6 rows of one socket) is ONE entry.
 * Order is the file's, so the first candidate is the first port the tree
 * opened.
 */
export function parseListeningPorts(text: string): ListeningPort[] {
  const out: ListeningPort[] = []
  const seen = new Set<string>()
  let pid: number | undefined
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (line.startsWith('p')) {
      const n = Number(line.slice(1))
      pid = Number.isInteger(n) && n > 0 ? n : undefined
      continue
    }
    if (!line.startsWith('n') || pid === undefined) continue
    // `*:5173`, `127.0.0.1:5173`, `[::1]:5173` — the port is after the LAST colon.
    const address = line.slice(1)
    const cut = address.lastIndexOf(':')
    if (cut < 0) continue
    const port = Number(address.slice(cut + 1))
    if (!Number.isInteger(port) || port <= 0 || port > 65535) continue
    const key = `${pid}:${port}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ pid, port })
  }
  return out
}

/** A script `package.json` names that starts something to look at. */
export interface DevScript { name: string; command: string }

/**
 * The four names a dev server is spelled with, in the order a person would try
 * them. A CLOSED list on purpose: `parseDevScripts` is offered to a person as
 * "this is what your project can start", and guessing from every script would
 * offer `test` and `postinstall` as things to look at in a browser.
 */
export const DEV_SCRIPT_NAMES: readonly string[] = ['dev', 'start', 'serve', 'preview']

/**
 * The dev-ish scripts of a `package.json` TEXT, plus the project's name.
 * Absent/unreadable/malformed are three answers, not one: `undefined` means
 * this directory holds no package.json the caller could read (the caller
 * knows which), `{ name: undefined, scripts: [] }` means it holds one that
 * names none.
 */
export function parseDevScripts(text: string): { name?: string; scripts: DevScript[] } | undefined {
  let parsed: unknown
  try { parsed = JSON.parse(text) } catch { return undefined }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined
  const record = parsed as Record<string, unknown>
  const scriptsValue = record.scripts
  const scripts: DevScript[] = []
  if (scriptsValue !== null && typeof scriptsValue === 'object' && !Array.isArray(scriptsValue)) {
    for (const wanted of DEV_SCRIPT_NAMES) {
      const command = (scriptsValue as Record<string, unknown>)[wanted]
      if (typeof command === 'string' && command.trim() !== '') scripts.push({ name: wanted, command })
    }
  }
  const name = typeof record.name === 'string' && record.name.trim() !== '' ? record.name : undefined
  return { ...(name === undefined ? {} : { name }), scripts }
}

/** `http://127.0.0.1:<port>/` — loopback by name, never `localhost` (which resolves to ::1 first on this machine and to nothing in some containers). */
export function previewUrlFor(port: number): string {
  return `http://127.0.0.1:${port}/`
}

export interface PreviewCandidate { url: string; why: string }

export interface Discovery {
  /**
   * `not-asked`, `none`, `one` or `many` — FOUR states, because each leads to
   * a different next action. M185's critic (finding 6) found the first two
   * collapsed: a panel with no running process was told "nothing of X is
   * listening yet", which asserts a fact the app never checked. The fix for
   * "not asked" is to select the terminal the project runs in; the fix for
   * "nothing answered" is to start the server.
   */
  kind: 'not-asked' | 'none' | 'one' | 'many'
  project?: string
  candidates: PreviewCandidate[]
  scripts: DevScript[]
  /** One sentence naming what was asked and what answered. */
  note: string
}

/**
 * The answer, assembled from what the listener and the package file said.
 * Pure so every door says the same sentence: the node's empty state, the
 * palette row's subtitle and the agent verb's note are this one `note`.
 */
export function discoveryOf(input: {
  ports: readonly ListeningPort[]
  project?: string
  scripts?: readonly DevScript[]
  /** The directory the question was asked about, for the sentence. */
  where: string
  /** False when there was no process to ask lsof about — never conflated with an empty answer. */
  asked?: boolean
}): Discovery {
  const candidates = input.ports.map((p) => ({ url: previewUrlFor(p.port), why: `a process of this panel is listening on ${p.port}` }))
  const scripts = [...(input.scripts ?? [])]
  const kind = input.asked === false ? 'not-asked' : candidates.length === 0 ? 'none' : candidates.length === 1 ? 'one' : 'many'
  const project = input.project
  const named = project === undefined ? input.where : `${project} (${input.where})`
  const note = kind === 'not-asked'
    ? `nothing of ${named} is running, so there was nothing to ask — select the terminal your project runs in${scripts.length > 0 ? `, or start ${scripts.map((s) => s.name).join(' or ')}` : ''}`
    : kind === 'one'
    ? `${named} is listening on ${input.ports[0]?.port} — open it to see the page`
    : kind === 'many'
      ? `${named} has ${candidates.length} processes listening — pick the one you meant`
      : scripts.length > 0
        ? `nothing of ${named} is listening yet — ${scripts.map((s) => s.name).join(' or ')} would start it`
        : `nothing of ${named} is listening, and its package.json names no dev script — open the address by hand`
  return { kind, ...(project === undefined ? {} : { project }), candidates, scripts, note }
}

/** Why a capture cannot be taken, in a sentence that names the next useful step. */
export function captureRefusal(reason: 'no-guest' | 'not-web' | 'empty', detail?: string): string {
  if (reason === 'no-guest') return 'no page is open in this pane — open one, then capture it'
  if (reason === 'empty') return 'the page answered no pixels — it may still be loading; try again once it has painted'
  return detail === undefined ? 'only an http(s) page can be captured' : detail
}

/**
 * M195 (D03). WHICH WORK A PREVIEW IS A PREVIEW OF.
 *
 * Before this, `BrowserNode.tsx` subscribed to `file:changed` with a callback
 * that took NO PARAMETER: the event was never read, and the only filter was
 * that the guest's own page was loopback. Every local pane therefore reloaded
 * on every open file panel's change — two projects on one canvas reloaded one
 * another, and an unrelated note reloaded both.
 *
 * A binding is PROVENANCE and nothing else. It answers one question — does
 * this change belong to this pane — and explains itself; it is never asked
 * whether something is allowed. Nothing may read `root` as a grant: it reaches
 * no Places gate, no spawn, no credential and no read.
 */
export interface PreviewBinding {
  /** The directory whose changes reload this pane. Absolute and normalised. */
  root: string
  /**
   * The panel the binding was taken from, when there was one. It may DANGLE —
   * a source panel can be closed — and that is rendered rather than repaired:
   * the root outlives it and stays valid (D03's "preserve a still-valid
   * directory association when the view closes").
   */
  sourcePanelId?: string
}

/**
 * Absolute, `.` and `..` collapsed, no trailing slash (the root stays `/`);
 * `null` for anything relative, empty or `~`-prefixed.
 *
 * Hand-written, and it must stay that way. `@shared/places.ts` has this
 * function already and imports `node:path` to get it — which the RENDERER
 * cannot bundle (`Canvas.tsx`'s own comment at the skill-assign check records
 * that the hard way), and this rule runs in the renderer. `display-path.ts` is
 * the precedent: forward-slash arithmetic, no `path` module. Reusing
 * `insidePlace` would need a `realpath` the renderer does not have and would
 * put a PERMISSION gate in the way of a display question.
 *
 * A relative path is refused rather than resolved, for `places.ts`'s reason:
 * every root this app could pick is a guess the user did not make.
 */
export function normalisePreviewPath(path: string): string | null {
  if (!path.startsWith('/')) return null
  const out: string[] = []
  for (const segment of path.split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') { out.pop(); continue }
    out.push(segment)
  }
  return out.length === 0 ? '/' : `/${out.join('/')}`
}

/**
 * True when `path` IS the root or lies under it, on SEGMENT boundaries.
 *
 * The boundary is the whole point: a bare `startsWith` answers true for
 * `/w/apiary` against `/w/api`, so a preview would follow the neighbouring
 * project on disk — a wrong reload that looks exactly like a right one.
 */
export function pathInsidePreview(root: string, path: string): boolean {
  const r = normalisePreviewPath(root)
  const p = normalisePreviewPath(path)
  if (r === null || p === null) return false
  return p === r || p.startsWith(r === '/' ? '/' : `${r}/`)
}

/**
 * The hosts that are this machine's own work, and the only pages a file change
 * may reload. `[::1]` is BRACKETED because that is what `URL.hostname` answers
 * for an IPv6 literal; a bare `'::1'` member (which the effect this replaced
 * carried) matches nothing the parser can produce and is left out rather than
 * kept as a spelling no input reaches.
 */
const LOOPBACK_HOSTS: readonly string[] = ['127.0.0.1', 'localhost', '[::1]']

/**
 * Whether a file change reloads this pane, and — when it does not — WHY, in a
 * word. A skip with no `why` is a preview that stopped reloading for a reason
 * nobody can name, which is the failure this milestone exists to end.
 *
 * `not-local` covers both a remote page and a pane with no page yet: for THIS
 * decision they are one fact — the pane is not showing this machine's work.
 * (M186's finding 7 is the loopback half, unchanged and now named: a person
 * filling in a form on a remote page must not lose it because an agent wrote a
 * note.)
 *
 * `no-path` and `unknown-source` are two facts and not one. `no-path` is a
 * panel that is GONE (it closed between the write and the event). `unknown-
 * source` is a panel that is still there and whose file path this canvas does
 * not hold: a SKILL panel is the case — it registers the same `file:read`
 * watch (`SkillNode.tsx`) but its record carries `{scope, name}` and no path
 * on purpose (M128: the file is the authority), so a `SKILL.md` edited under a
 * bound root does NOT reload the preview. Collapsing it into `no-path` would
 * report a live panel as a closed one, which is the wrong fix in a log and the
 * wrong sentence in a report.
 */
export type PreviewReloadDecision =
  | { kind: 'reload' }
  | { kind: 'skip'; why: 'unbound' | 'outside' | 'not-local' | 'no-path' | 'unknown-source' }

export function previewReloadDecision(input: {
  binding: PreviewBinding | undefined
  /** The changed file's path, or undefined when the changed panel could not be resolved to one. */
  changedPath: string | undefined
  /**
   * Whether the panel the event named is still on the canvas. It separates
   * `unknown-source` (a live panel whose path this canvas does not hold — a
   * skill panel) from `no-path` (a panel that is gone). Absent reads as gone.
   */
  changedPanelExists?: boolean
  /** The guest's own live url, or null before it has navigated. */
  liveUrl: string | null | undefined
}): PreviewReloadDecision {
  if (input.binding === undefined) return { kind: 'skip', why: 'unbound' }
  let host: string
  try { host = new URL(input.liveUrl ?? '').hostname } catch { return { kind: 'skip', why: 'not-local' } }
  if (!LOOPBACK_HOSTS.includes(host)) return { kind: 'skip', why: 'not-local' }
  if (input.changedPath === undefined || input.changedPath === '') return { kind: 'skip', why: input.changedPanelExists === true ? 'unknown-source' : 'no-path' }
  return pathInsidePreview(input.binding.root, input.changedPath) ? { kind: 'reload' } : { kind: 'skip', why: 'outside' }
}

/**
 * The sentence the inspector explains a pane's source with. FOUR states, and
 * each one leads somewhere different: bound with its source panel still open;
 * bound with that panel closed (the folder is STILL bound, and saying so is
 * the difference between a preview that works and one a person thinks is
 * broken); bound with no source panel at all (a lineup's preview seat is born
 * this way — a folder and no panel to name), which still needs words rather
 * than a bare path; and not bound, which says what that MEANS.
 *
 * The unbound sentence says NOTHING RELOADS IT, and getting this right is not
 * a wording choice. The first cut read *"a file change reloads this pane for
 * nothing"* — which describes the behaviour this milestone REMOVED (M185 to
 * M192, when an unbound loopback pane reloaded on every open file panel's
 * change). Under this rule an unbound pane does not reload at all, so the
 * reason to bind is that binding turns reloading ON. Told the opposite, a
 * person would read the control as a way to reduce noise rather than as the
 * thing that makes the preview follow their work.
 */
export function previewSourceLine(binding: PreviewBinding | undefined, sourceLabel: string | undefined): string {
  if (binding === undefined) return 'not bound to a folder — nothing reloads this pane; bind it to the work it previews and its own changes will'
  if (sourceLabel !== undefined) return `${binding.root} — from ${sourceLabel}`
  if (binding.sourcePanelId === undefined) return `${binding.root} — bound to the folder, with no source panel to name`
  return `${binding.root} — the panel it was opened from is closed, and the folder is still bound`
}
