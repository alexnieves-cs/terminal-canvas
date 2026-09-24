import type { PersistedWorkItem } from './work-items'
import type { SwarmPresetId } from './swarm'
import { parameterizeRecipe, recipeHash, renderRecipeText, type RecipeParam, type RecipeRequires, type RecipeUse, type RenderContext } from './recipe-portability'

/**
 * M314. WORKFLOW RECIPES — a few excellent starting points, each carrying the
 * useful context, the checks and the expected deliverables, not merely a
 * panel arrangement (which is what a swarm preset already is, and all a saved
 * arrangement was: M302 kept brief and validation as PROSE in a template's
 * description, where nothing could read them back).
 *
 * A recipe fills a task. Picking one in Start work writes the task's brief,
 * criteria, checks and deliverables (the M314 work-item fields) and chooses
 * its arrangement; the person edits any of it before anything starts. From
 * then on the RECIPE is not consulted again — the task holds its own copy, so
 * editing a recipe never rewrites a task already under way, and a task whose
 * recipe was deleted still knows what "done" meant.
 *
 * Built-ins are code (never persisted, never editable, the BUILT_IN_TEMPLATES
 * rule); the person's own are a list main stores (`recipe:*`), capped, parsed
 * field-level. Pure; plain-node tier (verify:review recipe.*).
 */

/** What a recipe tells the agent to gather before it changes anything. */
export type RecipeContext = 'failing-output' | 'issue' | 'diff' | 'repro' | 'setup'
const CONTEXTS: readonly RecipeContext[] = ['failing-output', 'issue', 'diff', 'repro', 'setup']

export interface Recipe {
  id: string
  name: string
  /** One line for the picker. */
  hint: string
  /** The one thing the person types to aim it: which test, which issue, which change. */
  ask: { label: string; placeholder: string }
  /** The arrangement to start with; absent is a solo agent. */
  swarm?: SwarmPresetId
  /** The intended outcome, with `{input}` where the person's answer goes. */
  brief: string
  criteria: string[]
  /** Commands that decide "done". Empty means the repository setup's checks (M312). */
  checks: string[]
  deliverables: string[]
  context: RecipeContext[]
  builtIn?: true
  /** Present on a recipe saved from a task: which one, and when. */
  savedFrom?: { taskId: string; at: number }
  /**
   * M321. The definition's version: absent is 1. A save whose definition
   * differs from every stored version of this id lands one past the newest;
   * the earlier versions stay in the store's history, so a run started from
   * v2 can still be read as v2 after v3 exists.
   */
  version?: number
  /** M321. Named inputs beyond the one `ask` — `{param:NAME}` in the text, each with an optional default. */
  params?: RecipeParam[]
  /** M321. What the recipe needs beyond its text: backend capabilities, tools on PATH, a saved setup. */
  requires?: RecipeRequires
}

export const RECIPES_MAX = 30
const TEXT_MAX = 2000

const CONTEXT_WORDS: Record<RecipeContext, string> = {
  'failing-output': 'Run the failing check first and read its exact output before changing code; quote the failure you fixed.',
  issue: 'Read the whole issue, including comments, and restate what it asks for before you start.',
  diff: 'Read the change under review in full (every file, not only the summary) before judging it.',
  repro: 'Reproduce the problem before proposing a cause, and write the reproduction down so someone else can run it.',
  setup: 'The worktree is already prepared with the repository setup; use its commands rather than inventing new ones.'
}

export const BUILT_IN_RECIPES: readonly Recipe[] = [
  {
    id: 'recipe-fix-test',
    name: 'Fix a failing test',
    hint: 'Reproduce the failure, fix the cause (not the test), prove it passes',
    ask: { label: 'Which test is failing?', placeholder: 'e.g. auth › refreshes an expired token' },
    brief: 'Make the failing test "{input}" pass by fixing the cause in the code under test. Do not weaken, skip or delete the test.',
    criteria: ['The test passes', 'No other test regressed', 'The test itself was not weakened, skipped or deleted'],
    checks: [],
    deliverables: ['The fix', 'One paragraph: what was wrong and why the fix is right', 'The check output showing the test passing'],
    context: ['failing-output', 'setup'],
    builtIn: true
  },
  {
    id: 'recipe-implement-issue',
    name: 'Implement an issue',
    hint: 'From the issue to a reviewed change with tests and a pull request',
    ask: { label: 'Which issue?', placeholder: 'e.g. owner/repo#123, or describe it' },
    swarm: 'implement',
    brief: 'Implement "{input}" as the issue describes, with tests that cover the new behaviour.',
    criteria: ['Everything the issue asks for is done, or what is not is named', 'New behaviour has tests', 'Existing checks pass'],
    checks: [],
    deliverables: ['The change', 'Tests for the new behaviour', 'A pull request description: what changed, how it was verified, what is left'],
    context: ['issue', 'setup'],
    builtIn: true
  },
  {
    id: 'recipe-review-change',
    name: 'Review a change',
    hint: 'Read a branch or diff and report findings, most severe first — no edits',
    ask: { label: 'Which change?', placeholder: 'e.g. branch feature/x, PR #45, or the last commit' },
    swarm: 'review',
    brief: 'Review "{input}" for correctness, risk and missing tests. Report findings; do not change the code.',
    criteria: ['Every finding names a file and line', 'Findings are ranked by severity', 'Nothing in the working tree was modified'],
    checks: [],
    deliverables: ['A findings list: file:line, what is wrong, how it fails, suggested fix', 'A one-line verdict: merge, merge after fixes, or do not merge'],
    context: ['diff'],
    builtIn: true
  },
  {
    id: 'recipe-investigate-bug',
    name: 'Investigate a bug',
    hint: 'Reproduce, find the cause, propose a fix — with evidence, before any change lands',
    ask: { label: 'What is the bug?', placeholder: 'e.g. the export button does nothing on large canvases' },
    swarm: 'explore',
    brief: 'Find the root cause of: {input}. Reproduce it first; propose a fix with the evidence for it.',
    criteria: ['The bug is reproduced, with steps', 'The root cause is named with the code that causes it', 'The proposed fix addresses the cause, not the symptom'],
    checks: [],
    deliverables: ['Reproduction steps', 'The root cause, with file:line', 'A proposed fix (or the fix, with a test that failed before it)'],
    context: ['repro', 'setup'],
    builtIn: true
  }
]

const str = (v: unknown, max = TEXT_MAX): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim().slice(0, max) : null)
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => str(x, 400)).filter((x): x is string => x !== null).slice(0, 20) : [])
const SWARMS: readonly SwarmPresetId[] = ['explore', 'implement', 'test', 'review']
const CAPABILITIES: readonly string[] = ['cli', 'prompt', 'no-publish', 'interrupt', 'resume', 'images', 'cost', 'window', 'permissions', 'read-only']

/** M321. Parameters, field-level: a malformed one costs itself; a duplicate name keeps the first. */
function parseParams(v: unknown): RecipeParam[] | undefined {
  if (!Array.isArray(v)) return undefined
  const out: RecipeParam[] = []
  for (const raw of v) {
    if (typeof raw !== 'object' || raw === null) continue
    const o = raw as Record<string, unknown>
    const name = typeof o.name === 'string' && /^[a-z][a-z0-9-]{0,39}$/.test(o.name) ? o.name : null
    if (name === null || out.some((p) => p.name === name)) continue
    out.push({ name, label: str(o.label, 200) ?? name, ...(str(o.default, 400) === null ? {} : { default: str(o.default, 400)! }) })
  }
  return out.length === 0 ? undefined : out.slice(0, 12)
}

/** M321. Requirements, field-level. */
function parseRequires(v: unknown): RecipeRequires | undefined {
  if (typeof v !== 'object' || v === null) return undefined
  const o = v as Record<string, unknown>
  const capabilities = Array.isArray(o.capabilities) ? [...new Set(o.capabilities.filter((c): c is string => typeof c === 'string' && CAPABILITIES.includes(c)))] : []
  const tools = Array.isArray(o.tools) ? [...new Set(o.tools.filter((t): t is string => typeof t === 'string' && /^[\w.+-]{1,60}$/.test(t)))].slice(0, 20) : []
  const out: RecipeRequires = {
    ...(capabilities.length === 0 ? {} : { capabilities: capabilities as RecipeRequires['capabilities'] }),
    ...(tools.length === 0 ? {} : { tools }),
    ...(o.setup === true ? { setup: true } : {})
  }
  return Object.keys(out).length === 0 ? undefined : out
}

/** One saved recipe, field-level: a malformed optional costs itself; no id or name costs the recipe. */
export function parseRecipe(raw: unknown): Recipe | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  const id = str(r.id, 80)
  const name = str(r.name, 80)
  if (id === null || name === null || !/^[\w-]+$/.test(id) || id.startsWith('recipe-') && BUILT_IN_RECIPES.some((b) => b.id === id)) return null
  const ask = typeof r.ask === 'object' && r.ask !== null ? r.ask as Record<string, unknown> : {}
  const sf = typeof r.savedFrom === 'object' && r.savedFrom !== null ? r.savedFrom as Record<string, unknown> : null
  return {
    id,
    name,
    hint: str(r.hint, 200) ?? '',
    ask: { label: str(ask.label, 120) ?? 'What is the task?', placeholder: str(ask.placeholder, 200) ?? '' },
    ...(SWARMS.includes(r.swarm as SwarmPresetId) ? { swarm: r.swarm as SwarmPresetId } : {}),
    brief: str(r.brief) ?? '{input}',
    criteria: strs(r.criteria),
    checks: strs(r.checks),
    deliverables: strs(r.deliverables),
    context: Array.isArray(r.context) ? [...new Set(r.context.filter((c): c is RecipeContext => CONTEXTS.includes(c as RecipeContext)))] : [],
    ...(sf !== null && typeof sf.taskId === 'string' && typeof sf.at === 'number' ? { savedFrom: { taskId: sf.taskId, at: sf.at } } : {}),
    ...(typeof r.version === 'number' && Number.isInteger(r.version) && r.version >= 1 ? { version: r.version } : {}),
    ...(parseParams(r.params) === undefined ? {} : { params: parseParams(r.params)! }),
    ...(parseRequires(r.requires) === undefined ? {} : { requires: parseRequires(r.requires)! })
  }
}

/**
 * M321. What a run was started from, read back from a work item: the whole
 * definition must parse (a run's recipe is not guessed field by field — the
 * point is the EXACT definition), and the hash is recomputed rather than
 * trusted, so a hand-edited file cannot claim a version it is not.
 */
export function parseRecipeUse(raw: unknown): RecipeUse | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const r = raw as Record<string, unknown>
  if (typeof r.id !== 'string' || typeof r.at !== 'number' || typeof r.version !== 'number') return undefined
  // A built-in's id is refused by parseRecipe (the shadowing rule), so the
  // definition is parsed under a neutral id and given its own back.
  const def = parseRecipe({ ...(r.definition as object), id: 'run-definition' })
  if (def === null) return undefined
  const definition: Recipe = { ...def, id: r.id }
  const params = typeof r.params === 'object' && r.params !== null
    ? Object.fromEntries(Object.entries(r.params as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === 'string').slice(0, 12))
    : undefined
  return {
    id: r.id, version: r.version, hash: recipeHash(definition), definition, at: r.at,
    ...(typeof r.repository === 'string' && r.repository.startsWith('/') ? { repository: r.repository } : {}),
    ...(params === undefined || Object.keys(params).length === 0 ? {} : { params })
  }
}

/** The person's list: malformed entries dropped, duplicate ids keep the first, capped. */
export function parseRecipes(raw: unknown): Recipe[] {
  if (!Array.isArray(raw)) return []
  const out: Recipe[] = []
  for (const r of raw) {
    const p = parseRecipe(r)
    if (p !== null && !out.some((x) => x.id === p.id)) out.push(p)
  }
  return out.slice(0, RECIPES_MAX)
}

/** Every recipe the picker lists: built-ins first, then the person's, newest first as stored. */
export function allRecipes(saved: readonly Recipe[]): Recipe[] {
  return [...BUILT_IN_RECIPES, ...saved]
}

export interface RecipeFill {
  title: string
  brief: string
  criteria: string[]
  checks: string[]
  deliverables: string[]
  recipeId: string
  swarm?: SwarmPresetId
}

/**
 * What picking `recipe` and answering its ask writes into the Start work sheet.
 * M321: every text field is rendered — `{input}`, and with a context the
 * target `{repository}`, `{repo}` and each `{param:NAME}` (its value, else its
 * default). A placeholder the context cannot fill stays as written, and the
 * preflight refuses the start on it.
 */
export function applyRecipe(recipe: Recipe, input: string, ctx: Omit<RenderContext, 'input'> = {}): RecipeFill {
  const answer = input.trim()
  const params: Record<string, string> = {}
  for (const p of recipe.params ?? []) { const v = ctx.params?.[p.name] ?? p.default; if (v !== undefined && v !== '') params[p.name] = v }
  const render = (text: string): string => renderRecipeText(text, { ...ctx, input: answer, params })
  const brief = render(recipe.brief)
  const title = answer === '' ? recipe.name : `${recipe.name}: ${answer}`.slice(0, 120)
  return {
    title,
    brief,
    criteria: recipe.criteria.map(render),
    checks: recipe.checks.map(render),
    deliverables: recipe.deliverables.map(render),
    recipeId: recipe.id,
    ...(recipe.swarm === undefined ? {} : { swarm: recipe.swarm })
  }
}

/**
 * The part of the first message a recipe adds: how to gather context, the
 * checks that decide done, what to hand back. Empty for a task with none —
 * the M310 message stays byte-identical for every task started without one.
 */
export function recipeMessage(item: Pick<PersistedWorkItem, 'checks' | 'deliverables' | 'recipeId'>, saved: readonly Recipe[] = []): string {
  const recipe = item.recipeId === undefined ? undefined : allRecipes(saved).find((r) => r.id === item.recipeId)
  const parts: string[] = []
  if (recipe !== undefined && recipe.context.length > 0) parts.push(`Before you start:\n${recipe.context.map((c) => `- ${CONTEXT_WORDS[c]}`).join('\n')}`)
  if (item.checks !== undefined && item.checks.length > 0) parts.push(`Checks that must pass:\n${item.checks.map((c) => `- \`${c}\``).join('\n')}`)
  if (item.deliverables !== undefined && item.deliverables.length > 0) parts.push(`Hand back:\n${item.deliverables.map((d) => `- ${d}`).join('\n')}`)
  return parts.join('\n\n')
}

/**
 * A finished task, as a recipe the person can start again. The task's own
 * title is the answer that aimed it, so the brief keeps its shape with the
 * title swapped for `{input}` where it appears; checks are the ones that
 * WITNESSED-passed (a check that never ran is not proof the recipe works),
 * falling back to the task's declared ones.
 */
export function recipeFromTask(
  item: Pick<PersistedWorkItem, 'id' | 'title' | 'brief' | 'criteria' | 'checks' | 'deliverables' | 'recipeId' | 'recipeUsed'>,
  o: { name: string; passedChecks: readonly string[]; swarm?: SwarmPresetId; now: number; saved?: readonly Recipe[]; /** M321. The task's lane and main tree: paths under them become `{repository}`. */ roots?: readonly string[] }
): Recipe {
  const from = item.recipeId === undefined ? undefined : allRecipes(o.saved ?? []).find((r) => r.id === item.recipeId)
  const brief = (item.brief ?? '').trim()
  const templated = brief === '' ? '{input}' : brief.includes(item.title) ? brief.split(item.title).join('{input}') : `${brief}\n\n({input})`
  const slug = o.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'recipe'
  return {
    id: `mine-${slug}-${o.now.toString(36)}`,
    name: o.name.trim().slice(0, 80) || item.title.slice(0, 80),
    hint: `Saved from “${item.title.slice(0, 80)}”`,
    ask: from?.ask ?? { label: 'What is the task?', placeholder: item.title.slice(0, 120) },
    ...(o.swarm !== undefined ? { swarm: o.swarm } : from?.swarm !== undefined ? { swarm: from.swarm } : {}),
    brief: templated,
    criteria: [...(item.criteria ?? [])],
    checks: o.passedChecks.length > 0 ? [...new Set(o.passedChecks)] : [...(item.checks ?? [])],
    deliverables: [...(item.deliverables ?? from?.deliverables ?? [])],
    context: [...(from?.context ?? ['setup'])],
    savedFrom: { taskId: item.id, at: o.now },
    // M321. What the run it was saved from relied on, carried forward: its
    // parameters and requirements (the exact definition it ran, when kept).
    ...(item.recipeUsed?.definition.params ?? from?.params) === undefined ? {} : { params: (item.recipeUsed?.definition.params ?? from?.params)! },
    ...(item.recipeUsed?.definition.requires ?? from?.requires) === undefined ? {} : { requires: (item.recipeUsed?.definition.requires ?? from?.requires)! }
  }
}

/**
 * M321. `recipeFromTask`, portable: the paths it embeds under the task's own
 * repository become `{repository}`, others become parameters. What the
 * palette's Save as recipe calls — the saved recipe can go to another repository.
 */
export function portableRecipeFromTask(...args: Parameters<typeof recipeFromTask>): { recipe: Recipe; lifted: number } {
  const recipe = recipeFromTask(...args)
  const { recipe: portable, findings } = parameterizeRecipe(recipe, args[1].roots ?? [])
  return { recipe: portable, lifted: findings.length }
}
