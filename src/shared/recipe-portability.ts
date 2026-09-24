import type { Recipe } from './recipes'
import type { RepoSetup } from './repo-setup'
import type { BackendFit, TaskRequirementId } from './backend-fit'
import type { PersistedWorkItem } from './work-items'

/**
 * M321. A RECIPE THAT TRAVELS — a successful task's recipe taken to a second
 * repository without repairing embedded paths and assumptions by hand.
 *
 * M314's recipes carried a brief, checks and deliverables as text, and a
 * recipe saved from a task kept whatever that task's text said: `cd
 * /Users/a/work/api && npm test` is a check that runs in exactly one place.
 * Nothing said which tools it needed, nothing checked them before a worker
 * existed, a saved recipe overwritten by a later save forgot what the earlier
 * run was started from, and nothing compared a reuse with the run it reused.
 *
 * Five rules, each a silent failure without it:
 *
 *  - **Paths are parameters.** The repository a recipe was saved from becomes
 *    `{repository}`; any other absolute path becomes a named parameter with
 *    the original as its default — flagged, so a person decides whether it
 *    belongs to this repository at all.
 *  - **Every placeholder is filled or the start is refused.** A check that
 *    reached a shell as `{param:fixtures}` would fail in the lane with an
 *    error about a directory called `{param:fixtures}`.
 *  - **Prerequisites are checked before workers exist.** The tools the setup
 *    and the checks invoke must be on the login PATH, the setup the recipe
 *    needs must be saved, and the backend must meet what the recipe requires.
 *    The preview says what WILL run — install steps, services and their
 *    ports, checks — before anything does.
 *  - **A run keeps the exact definition it used.** A work item records the
 *    recipe's id, version, content hash and the definition itself; editing
 *    or deleting the recipe later never rewrites what a run was started from.
 *  - **A reuse is compared with the last success**, on facts both runs have,
 *    with the definition differences named — never a verdict it cannot know.
 *
 * Pure; plain-node tier (`verify:review portable.*`).
 */

/* ── Placeholders ───────────────────────────────────────────────────────── */

export interface RecipeParam {
  /** `[a-z][a-z0-9-]*` — what `{param:NAME}` names. */
  name: string
  label: string
  default?: string
}

/** What a recipe needs beyond its text. */
export interface RecipeRequires {
  /** Backend capabilities the recipe cannot do without (M319's ids). */
  capabilities?: TaskRequirementId[]
  /** Tools that must be on the login PATH, beyond those its commands name. */
  tools?: string[]
  /** The repository's setup must be saved (its install steps prepare every lane). */
  setup?: boolean
}

const PLACEHOLDER_RE = /\{(input|repository|repo|param:([a-z][a-z0-9-]{0,39}))\}/g

export interface RenderContext {
  input?: string
  /** The target repository's root. */
  repository?: string
  /** `owner/repo`, when known. */
  repo?: string
  params?: Readonly<Record<string, string>>
}

/** Every placeholder a text uses that the context cannot fill, by its spelling. */
export function unfilled(text: string, ctx: RenderContext): string[] {
  const out: string[] = []
  for (const m of text.matchAll(PLACEHOLDER_RE)) {
    const name = m[1] as string
    const ok = name === 'input' ? true
      : name === 'repository' ? ctx.repository !== undefined && ctx.repository !== ''
        : name === 'repo' ? ctx.repo !== undefined && ctx.repo !== ''
          : (ctx.params?.[m[2] as string] ?? '') !== ''
    if (!ok && !out.includes(m[0])) out.push(m[0])
  }
  return out
}

/** Fill what can be filled; anything else stays as written (the caller refuses on `unfilled`). */
export function renderRecipeText(text: string, ctx: RenderContext): string {
  return text.replace(PLACEHOLDER_RE, (whole, name: string, param: string | undefined) => {
    if (name === 'input') return (ctx.input ?? '').trim() || '…'
    if (name === 'repository') return ctx.repository ?? whole
    if (name === 'repo') return ctx.repo ?? whole
    const v = param === undefined ? undefined : ctx.params?.[param]
    return v === undefined || v === '' ? whole : v
  })
}

/** Every text field of a recipe a placeholder can live in, with its name. */
export function recipeTexts(r: Pick<Recipe, 'brief' | 'criteria' | 'checks' | 'deliverables'>): { field: string; text: string }[] {
  return [
    { field: 'brief', text: r.brief },
    ...r.criteria.map((text) => ({ field: 'criteria', text })),
    ...r.checks.map((text) => ({ field: 'checks', text })),
    ...r.deliverables.map((text) => ({ field: 'deliverables', text }))
  ]
}

/* ── Portability: find and parameterise embedded paths ──────────────────── */

/** An absolute filesystem path in running text — not a URL's path (`://host/x`), not `{repository}/x`. */
const ABS_PATH_RE = /(?<![\w.:/}])(\/(?:[\w.@+-]+\/)*[\w.@+-]+\/?)/g

export interface PortabilityFinding {
  field: string
  path: string
  /** `repository`: under a root the recipe was saved from — it becomes `{repository}`. `param`: elsewhere — it becomes a named parameter. */
  fix: 'repository' | 'param'
}

const isUnder = (path: string, root: string): boolean => path === root || path.startsWith(`${root.replace(/\/$/, '')}/`)

/** The absolute paths a recipe's text embeds; `roots` are the repositories (main tree, lane) it was saved from. */
export function portabilityScan(r: Pick<Recipe, 'brief' | 'criteria' | 'checks' | 'deliverables'>, roots: readonly string[]): PortabilityFinding[] {
  const out: PortabilityFinding[] = []
  for (const { field, text } of recipeTexts(r)) {
    for (const m of text.matchAll(ABS_PATH_RE)) {
      const path = m[1] as string
      // Two segments at least: `/` alone, `/dev/null`-style device paths and a
      // lone `/tmp` are not a repository assumption worth a parameter.
      if (path.split('/').filter((s) => s !== '').length < 2 || /^\/dev\//.test(path)) continue
      const fix = roots.some((root) => root !== '' && isUnder(path, root)) ? 'repository' : 'param'
      if (!out.some((f) => f.field === field && f.path === path)) out.push({ field, path, fix })
    }
  }
  return out
}

const paramName = (path: string, taken: ReadonlySet<string>): string => {
  const base = (path.split('/').filter((s) => s !== '').pop() ?? 'path').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'path'
  let name = /^[a-z]/.test(base) ? base : `p-${base}`
  let n = 2
  while (taken.has(name)) name = `${base}-${n++}`
  return name
}

/**
 * The recipe with its embedded paths lifted out: a path under one of `roots`
 * becomes `{repository}` plus its remainder (longest root first, so a lane
 * inside the main tree wins); any other absolute path becomes `{param:NAME}`
 * with a parameter whose default is the original. Idempotent.
 */
export function parameterizeRecipe<R extends Recipe>(r: R, roots: readonly string[]): { recipe: R; findings: PortabilityFinding[] } {
  const findings = portabilityScan(r, roots)
  if (findings.length === 0) return { recipe: r, findings }
  const sorted = [...roots].filter((x) => x !== '').sort((a, b) => b.length - a.length)
  const params: RecipeParam[] = [...(r.params ?? [])]
  const taken = new Set(params.map((p) => p.name))
  const byPath = new Map<string, string>()
  for (const f of findings) {
    if (f.fix !== 'param' || byPath.has(f.path)) continue
    const existing = params.find((p) => p.default === f.path)
    if (existing !== undefined) { byPath.set(f.path, existing.name); continue }
    const name = paramName(f.path, taken)
    taken.add(name)
    byPath.set(f.path, name)
    params.push({ name, label: `Path for ${f.path.split('/').filter((s) => s !== '').pop() ?? 'this'} (was ${f.path})`, default: f.path })
  }
  const lift = (text: string): string => text.replace(ABS_PATH_RE, (whole, path: string) => {
    const root = sorted.find((x) => isUnder(path, x))
    if (root !== undefined) return `{repository}${path.slice(root.replace(/\/$/, '').length)}`
    const name = byPath.get(path)
    return name === undefined ? whole : `{param:${name}}`
  })
  return {
    recipe: {
      ...r,
      brief: lift(r.brief),
      criteria: r.criteria.map(lift),
      checks: r.checks.map(lift),
      deliverables: r.deliverables.map(lift),
      ...(params.length === 0 ? {} : { params })
    },
    findings
  }
}

/** M321. A workflow template member's cwd, portable: under a root it becomes `{{repository}}` (the template hole). */
export function portableCwd(cwd: string, roots: readonly string[]): string {
  const root = [...roots].filter((x) => x !== '').sort((a, b) => b.length - a.length).find((x) => isUnder(cwd, x))
  return root === undefined ? cwd : `{{repository}}${cwd.slice(root.replace(/\/$/, '').length)}`
}

/* ── Versions ───────────────────────────────────────────────────────────── */

/** The fields that define what a recipe DOES — its id, version and provenance are not among them. */
export function recipeDefinition(r: Recipe): Omit<Recipe, 'id' | 'version' | 'savedFrom' | 'builtIn'> {
  return {
    name: r.name, hint: r.hint, ask: { label: r.ask.label, placeholder: r.ask.placeholder },
    ...(r.swarm === undefined ? {} : { swarm: r.swarm }),
    brief: r.brief, criteria: [...r.criteria], checks: [...r.checks], deliverables: [...r.deliverables], context: [...r.context],
    ...(r.params === undefined ? {} : { params: r.params.map((p) => ({ ...p })) }),
    ...(r.requires === undefined ? {} : { requires: { ...r.requires } })
  }
}

/** FNV-1a over the definition's canonical JSON — eight hex chars, stable across runs and builds. */
export function recipeHash(r: Recipe): string {
  const text = JSON.stringify(recipeDefinition(r))
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
  return h.toString(16).padStart(8, '0')
}

export function recipeVersion(r: Recipe): number {
  return r.version ?? 1
}

/**
 * The version a save lands as: unchanged when the definition is the same, one
 * past the newest known otherwise. `known` is every stored version of this id
 * (the live one and its history).
 */
export function nextRecipeVersion(incoming: Recipe, known: readonly Recipe[]): number {
  const same = known.find((k) => recipeHash(k) === recipeHash(incoming))
  if (same !== undefined) return recipeVersion(same)
  return known.reduce((m, k) => Math.max(m, recipeVersion(k)), 0) + 1
}

/** What a run was started from — kept on the work item, never re-read from the store. */
export interface RecipeUse {
  id: string
  version: number
  hash: string
  definition: Recipe
  /** The values its parameters were given, and the repository it ran in. */
  params?: Record<string, string>
  repository?: string
  at: number
}

export function recipeUse(r: Recipe, o: { at: number; repository?: string; params?: Record<string, string> }): RecipeUse {
  return {
    id: r.id, version: recipeVersion(r), hash: recipeHash(r), definition: { ...r, ...recipeDefinition(r) }, at: o.at,
    ...(o.repository === undefined ? {} : { repository: o.repository }),
    ...(o.params === undefined || Object.keys(o.params).length === 0 ? {} : { params: { ...o.params } })
  }
}

/** Where two definitions differ, in words — the version comparison's evidence. */
export function recipeChanges(a: Recipe, b: Recipe): string[] {
  const out: string[] = []
  const da = recipeDefinition(a), db = recipeDefinition(b)
  if (da.brief !== db.brief) out.push('the brief changed')
  const list = (x: readonly string[], y: readonly string[], word: string): void => {
    const added = y.filter((v) => !x.includes(v)).length
    const removed = x.filter((v) => !y.includes(v)).length
    if (added + removed > 0) out.push(`${word}: ${added} added, ${removed} removed`)
  }
  list(da.criteria, db.criteria, 'criteria')
  list(da.checks, db.checks, 'checks')
  list(da.deliverables, db.deliverables, 'deliverables')
  if ((da.swarm ?? 'solo') !== (db.swarm ?? 'solo')) out.push(`the arrangement changed (${da.swarm ?? 'solo'} → ${db.swarm ?? 'solo'})`)
  if (JSON.stringify(da.params ?? []) !== JSON.stringify(db.params ?? [])) out.push('the parameters changed')
  if (JSON.stringify(da.requires ?? {}) !== JSON.stringify(db.requires ?? {})) out.push('the requirements changed')
  return out
}

/* ── Preflight ──────────────────────────────────────────────────────────── */

const SHELL_WORDS = new Set(['cd', 'export', 'set', 'unset', 'source', '.', 'exec', 'env', 'time', 'nice', 'true', 'false', 'test', '[', 'echo', 'if', 'then', 'fi', 'for', 'do', 'done', 'while'])

/**
 * The executables a command line invokes, first word of each `&&`/`;`/`|`
 * segment, past `VAR=x` assignments, `env`, `sudo` and shell builtins. A
 * path-qualified tool (`./scripts/x`, `{repository}/bin/y`) is the
 * repository's own and is not a PATH question.
 */
export function toolsOf(command: string): string[] {
  const out: string[] = []
  for (const seg of command.split(/&&|\|\||;|\|/)) {
    const words = seg.trim().split(/\s+/).filter((w) => w !== '')
    let i = 0
    while (i < words.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i]!) || words[i] === 'sudo' || words[i] === 'env')) i += 1
    const w = words[i]
    if (w === undefined || SHELL_WORDS.has(w) || w.includes('/') || w.includes('{') || w.startsWith('$')) continue
    if (!out.includes(w)) out.push(w)
  }
  return out
}

export interface PreflightInput {
  /** The checks the task will be started with (the sheet's, rendered). */
  checks: readonly string[]
  /** The recipe, when the task starts from one. */
  recipe?: Recipe
  /** The texts that must have every placeholder filled, rendered. */
  texts?: readonly { field: string; text: string }[]
  renderContext?: RenderContext
  /** The repository's setup: saved, a draft, or none (not a repository / not read). */
  setup: { kind: 'saved' | 'draft'; setup: RepoSetup } | null
  /** Main's probe of the login PATH, per tool; null = not probed yet. */
  tools: Readonly<Record<string, boolean>> | null
  /** The ports a lane of this repository would get, per service; null = not probed. */
  ports: Readonly<Record<string, number | null>> | null
  /** M319's fit of the chosen backend to the task. */
  fit?: BackendFit
}

export interface PreflightItem {
  id: string
  ok: boolean
  /** `block` disables Start; `warn` is said and allowed. */
  severity: 'block' | 'warn'
  line: string
}

export interface PreflightPreview {
  install: string[]
  services: { name: string; command: string; port: number | null | undefined }[]
  checks: string[]
  preview?: string
}

export interface Preflight {
  items: PreflightItem[]
  /** The first blocking item's sentence; absent when the start may go ahead. */
  blocked?: string
  /** The tools main is asked about. */
  tools: string[]
  /** What will run, in order — install, services with their ports, checks. */
  plan: PreflightPreview
}

/** Every tool a start would invoke: the saved setup's install and services, the checks, and what the recipe names. */
export function preflightTools(input: Pick<PreflightInput, 'checks' | 'recipe' | 'setup'>): { tool: string; where: string }[] {
  const out: { tool: string; where: string }[] = []
  const add = (commands: readonly string[], where: string): void => {
    for (const c of commands) for (const t of toolsOf(c)) if (!out.some((o) => o.tool === t)) out.push({ tool: t, where })
  }
  if (input.setup?.kind === 'saved') {
    add(input.setup.setup.install, 'preparation')
    add(input.setup.setup.services.map((s) => s.command), 'a service')
  }
  add(input.checks, 'the checks')
  for (const t of input.recipe?.requires?.tools ?? []) if (!out.some((o) => o.tool === t)) out.push({ tool: t, where: 'the recipe' })
  return out
}

/**
 * What must be true before a worker exists, and what will run. Pure: the
 * probes are main's (tools, ports), the fit is M319's, the setup is M312's.
 */
export function recipePreflight(input: PreflightInput): Preflight {
  const items: PreflightItem[] = []
  const tools = preflightTools(input)
  // Placeholders a start would send to a shell or an agent unfilled.
  for (const { field, text } of input.texts ?? []) {
    const left = unfilled(text, input.renderContext ?? {})
    if (left.length > 0 && !items.some((i) => i.id === `placeholder:${left[0]}`)) {
      items.push({ id: `placeholder:${left[0]}`, ok: false, severity: 'block', line: `${left.join(', ')} in the ${field} has no value — fill it in before starting` })
    }
  }
  const requires = input.recipe?.requires
  if (requires?.setup === true) {
    items.push(input.setup?.kind === 'saved'
      ? { id: 'setup', ok: true, severity: 'block', line: 'the repository setup this recipe needs is saved' }
      : { id: 'setup', ok: false, severity: 'block', line: 'this recipe needs the repository setup saved — set up this repository first, so every lane is prepared the same way' })
  }
  if (input.tools === null) {
    if (tools.length > 0) items.push({ id: 'tools', ok: false, severity: 'warn', line: `checking ${tools.map((t) => t.tool).join(', ')} on the login PATH…` })
  } else {
    for (const t of tools) {
      const found = input.tools[t.tool]
      if (found === undefined) continue
      items.push(found
        ? { id: `tool:${t.tool}`, ok: true, severity: 'block', line: `${t.tool} is on the login PATH` }
        : { id: `tool:${t.tool}`, ok: false, severity: 'block', line: `${t.tool} is not on the login PATH — ${t.where} would fail in the lane before the agent could do anything` })
    }
  }
  if (input.setup?.kind === 'saved' && input.ports !== null) {
    for (const s of input.setup.setup.services) {
      if (!s.port) continue
      const port = input.ports[s.name]
      if (port === null) items.push({ id: `port:${s.name}`, ok: false, severity: 'warn', line: `no free port is left in this lane's span for ${s.name} — it would start without one` })
    }
  }
  for (const cap of requires?.capabilities ?? []) {
    const row = input.fit?.rows.find((r) => r.id === cap)
    if (input.fit === undefined) continue
    items.push(row !== undefined && row.ok
      ? { id: `capability:${cap}`, ok: true, severity: 'block', line: row.line }
      : { id: `capability:${cap}`, ok: false, severity: 'block', line: `this recipe needs ${cap} from its backend — ${row?.line ?? `${input.fit.backend} was not judged for it`}` })
  }
  const blocked = items.find((i) => !i.ok && i.severity === 'block')?.line
  const saved = input.setup?.kind === 'saved' ? input.setup.setup : null
  return {
    items,
    ...(blocked === undefined ? {} : { blocked }),
    tools: tools.map((t) => t.tool),
    plan: {
      install: saved?.install ?? [],
      services: (saved?.services ?? []).map((s) => ({ name: s.name, command: s.command, port: s.port ? (input.ports === null ? undefined : input.ports[s.name] ?? null) : undefined })),
      checks: input.checks.length > 0 ? [...input.checks] : saved?.checks ?? [],
      ...(saved?.previewAt === undefined ? {} : { preview: `${saved.previewAt.service}${saved.previewAt.path}` })
    }
  }
}

/* ── Comparing a reuse with the last success ────────────────────────────── */

export interface RecipeOutcome {
  itemId: string
  title: string
  version?: number
  finished: boolean
  merged: boolean
  reviewedFiles?: number
  criteria: { met: number; total: number }
  openComments: number
  /** From start to merge (or to the review mark), when both ends are known. */
  durationMs?: number
  /** Check commands that passed / failed on the task's current revision, when the evidence was read. */
  passed?: string[]
  failed?: string[]
}

export function recipeOutcome(item: PersistedWorkItem, checks?: { passed: string[]; failed: string[] }): RecipeOutcome {
  const end = item.merged?.at ?? item.reviewed?.at
  const total = item.criteria?.length ?? 0
  const met = (item.criteria ?? []).filter((c) => (item.criteriaMet ?? []).includes(c)).length
  return {
    itemId: item.id, title: item.title,
    ...(item.recipeUsed === undefined ? {} : { version: item.recipeUsed.version }),
    finished: item.merged !== undefined || item.state === 'done', merged: item.merged !== undefined,
    ...(item.reviewed === undefined ? {} : { reviewedFiles: item.reviewed.files }),
    criteria: { met, total },
    openComments: (item.comments ?? []).filter((c) => c.resolved !== true).length,
    ...(end === undefined ? {} : { durationMs: Math.max(0, end - (item.recipeUsed?.at ?? item.createdAt)) }),
    ...(checks === undefined ? {} : { passed: [...checks.passed], failed: [...checks.failed] })
  }
}

/** The most recent SUCCESSFUL earlier run of the same recipe (merged, or done), other than `item`. */
export function lastSuccessfulRun(items: readonly PersistedWorkItem[], item: PersistedWorkItem): PersistedWorkItem | undefined {
  const id = item.recipeUsed?.id ?? item.recipeId
  if (id === undefined) return undefined
  return items
    .filter((i) => i.id !== item.id && (i.recipeUsed?.id ?? i.recipeId) === id && (i.merged !== undefined || i.state === 'done'))
    .sort((a, b) => (b.merged?.at ?? b.updatedAt) - (a.merged?.at ?? a.updatedAt))[0]
}

const minutes = (ms: number): string => (ms < 90_000 ? `${Math.round(ms / 1000)}s` : ms < 90 * 60_000 ? `${Math.round(ms / 60_000)} min` : `${(ms / 3_600_000).toFixed(1)} h`)

/**
 * This run beside the last successful one, fact by fact — each line says
 * both values, and a fact one side lacks is said to be unknown rather than
 * compared. The definition's changes lead, because a different recipe
 * explains a different outcome before anything else does.
 */
export function compareRecipeRuns(now: { item: PersistedWorkItem; outcome: RecipeOutcome }, before: { item: PersistedWorkItem; outcome: RecipeOutcome }): string[] {
  const out: string[] = []
  const a = before.item.recipeUsed, b = now.item.recipeUsed
  if (a !== undefined && b !== undefined) {
    if (a.hash === b.hash) out.push(`same recipe definition (v${b.version})`)
    else out.push(`v${a.version} → v${b.version}: ${recipeChanges(a.definition, b.definition).join('; ') || 'the definition changed'}`)
    if (a.repository !== undefined && b.repository !== undefined && a.repository !== b.repository) out.push(`another repository (${a.repository.split('/').pop()} → ${b.repository.split('/').pop()})`)
  } else {
    out.push('the earlier run did not record its recipe definition — only its outcome can be compared')
  }
  const o = now.outcome, p = before.outcome
  out.push(`${o.merged ? 'merged' : o.finished ? 'done' : 'not finished'} (last success: ${p.merged ? 'merged' : 'done'})`)
  if (o.durationMs !== undefined && p.durationMs !== undefined) out.push(`${minutes(o.durationMs)} to ${o.merged ? 'merge' : 'review'} (last success: ${minutes(p.durationMs)})`)
  if (o.reviewedFiles !== undefined && p.reviewedFiles !== undefined) out.push(`${o.reviewedFiles} files reviewed (last success: ${p.reviewedFiles})`)
  if (o.criteria.total > 0 || p.criteria.total > 0) out.push(`${o.criteria.met} of ${o.criteria.total} criteria confirmed (last success: ${p.criteria.met} of ${p.criteria.total})`)
  if (o.passed !== undefined && p.passed !== undefined) {
    const lost = p.passed.filter((c) => !(o.passed ?? []).includes(c))
    out.push(lost.length === 0 ? `${o.passed.length} checks passing (last success: ${p.passed.length})` : `${o.passed.length} checks passing — not passing now: ${lost.map((c) => `\`${c}\``).join(', ')}`)
  } else {
    out.push('checks: not compared — the evidence for one of the runs was not read')
  }
  if (o.openComments > 0) out.push(`${o.openComments} review comment${o.openComments === 1 ? '' : 's'} still open`)
  return out
}
