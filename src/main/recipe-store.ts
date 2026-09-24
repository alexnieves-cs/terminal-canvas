import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { parseRecipe, parseRecipes, RECIPES_MAX, type Recipe } from '../shared/recipes'
import { nextRecipeVersion, recipeHash } from '../shared/recipe-portability'

/** M321. How many superseded versions are kept, across every recipe. */
export const RECIPE_HISTORY_MAX = 200

/**
 * M314. The person's own recipes: one JSON list under `userData/recipes.json`,
 * written temp-and-rename (read whole). Built-ins are code and never land
 * here; `parseRecipe` refuses a built-in's id, so a saved list cannot shadow
 * "Fix a failing test" with a stranger's copy.
 */
export interface RecipeStore {
  list(): Promise<Recipe[]>
  save(raw: unknown): Promise<{ ok: true; recipe: Recipe } | { ok: false; reason: string }>
  remove(id: string): Promise<boolean>
  /** M321. Every stored version of a recipe, newest first — the live one, then its history. */
  history(id: string): Promise<Recipe[]>
}

export function createRecipeStore(o: { dir: string }): RecipeStore {
  const file = join(o.dir, 'recipes.json')
  // M321. Superseded versions live in their OWN file, so recipes.json keeps
  // the M314 shape every reader of it already parses.
  const historyFile = join(o.dir, 'recipe-history.json')
  const readHistory = async (): Promise<Recipe[]> => {
    try { const raw: unknown = JSON.parse(await fs.readFile(historyFile, 'utf8')); return Array.isArray(raw) ? raw.map(parseRecipe).filter((r): r is Recipe => r !== null) : [] } catch { return [] }
  }
  const writeHistory = async (list: Recipe[]): Promise<void> => {
    await fs.mkdir(o.dir, { recursive: true })
    await fs.writeFile(`${historyFile}.tmp`, JSON.stringify(list.slice(0, RECIPE_HISTORY_MAX), null, 2), 'utf8')
    await fs.rename(`${historyFile}.tmp`, historyFile)
  }
  let queue: Promise<unknown> = Promise.resolve()
  const read = async (): Promise<Recipe[]> => {
    try { return parseRecipes(JSON.parse(await fs.readFile(file, 'utf8'))) } catch { return [] }
  }
  const write = async (list: Recipe[]): Promise<void> => {
    await fs.mkdir(o.dir, { recursive: true })
    await fs.writeFile(`${file}.tmp`, JSON.stringify(list, null, 2), 'utf8')
    await fs.rename(`${file}.tmp`, file)
  }
  // One read-modify-write at a time: two saves racing would each drop the other's.
  const serial = <T>(f: () => Promise<T>): Promise<T> => {
    const next = queue.then(f, f)
    queue = next.catch(() => undefined)
    return next
  }
  return {
    list: read,
    save: (raw) => serial(async () => {
      const parsed = parseRecipe(raw)
      if (parsed === null) return { ok: false as const, reason: 'a recipe needs a name and an id of letters, digits and dashes' }
      const all = await read()
      const live = all.find((r) => r.id === parsed.id)
      const list = all.filter((r) => r.id !== parsed.id)
      if (list.length >= RECIPES_MAX) return { ok: false as const, reason: `${RECIPES_MAX} recipes is the most kept — delete one first` }
      // M321. The version is the STORE's to assign: the same definition keeps
      // its number, a changed one lands one past the newest ever stored for
      // this id, and the version it replaces moves to the history file.
      const history = await readHistory()
      const known = [...(live === undefined ? [] : [live]), ...history.filter((h) => h.id === parsed.id)]
      const recipe: Recipe = { ...parsed, version: nextRecipeVersion(parsed, known) }
      if (live !== undefined && recipeHash(live) !== recipeHash(recipe) && !history.some((h) => h.id === live.id && (h.version ?? 1) === (live.version ?? 1))) {
        await writeHistory([live, ...history])
      }
      await write([recipe, ...list])
      return { ok: true as const, recipe }
    }),
    history: async (id) => {
      const live = (await read()).find((r) => r.id === id)
      const past = (await readHistory()).filter((h) => h.id === id)
      return [...(live === undefined ? [] : [live]), ...past].sort((a, b) => (b.version ?? 1) - (a.version ?? 1))
    },
    remove: (id) => serial(async () => {
      const list = await read()
      const kept = list.filter((r) => r.id !== id)
      if (kept.length === list.length) return false
      await write(kept)
      return true
    })
  }
}
