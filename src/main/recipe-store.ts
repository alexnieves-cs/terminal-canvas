import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { parseRecipe, parseRecipes, RECIPES_MAX, type Recipe } from '../shared/recipes'

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
}

export function createRecipeStore(o: { dir: string }): RecipeStore {
  const file = join(o.dir, 'recipes.json')
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
      const recipe = parseRecipe(raw)
      if (recipe === null) return { ok: false as const, reason: 'a recipe needs a name and an id of letters, digits and dashes' }
      const list = (await read()).filter((r) => r.id !== recipe.id)
      if (list.length >= RECIPES_MAX) return { ok: false as const, reason: `${RECIPES_MAX} recipes is the most kept — delete one first` }
      await write([recipe, ...list])
      return { ok: true as const, recipe }
    }),
    remove: (id) => serial(async () => {
      const list = await read()
      const kept = list.filter((r) => r.id !== id)
      if (kept.length === list.length) return false
      await write(kept)
      return true
    })
  }
}
