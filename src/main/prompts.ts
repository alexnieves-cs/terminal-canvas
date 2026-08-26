import { readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import type { Prompt } from '../shared/layout-schema'

/**
 * The project half of the prompt library: `.claude/commands/*.md` under a
 * panel's cwd.
 *
 * Read LIVE and never persisted. A prompt in the user's repository belongs to
 * the repository — it version-controls with the project and works when they
 * are in a plain terminal outside this app, which is the whole argument for
 * reading the format rather than inventing a private one (ideas-backlog #27).
 * Writing it is deliberately out of scope: authoring a file someone will
 * commit is a decision to ask for, not to acquire as a side effect of "save".
 *
 * Imports node:fs and stays in the plain-node verify tier for the same reason
 * layout-store.ts does — it is `electron` and `node-pty` that move a module
 * out of that tier, not the filesystem. The cwd arrives already expanded;
 * resolving `~` is main's job, not this module's.
 */

/** One row of the merged list the palette shows. */
export interface PromptListRow {
  id: string
  name: string
  source: 'saved' | 'project'
  body: string
}

/**
 * Caps, not preferences. The directory is whatever the user pointed a panel
 * at, so both the count and the size are attacker-shaped inputs in the
 * ordinary case of "I opened a panel in a repo I just cloned".
 */
export const MAX_PROJECT_PROMPTS = 100
export const MAX_PROMPT_BYTES = 64 * 1024

/** The prefix that keeps a project id from ever colliding with a saved one. */
const PROJECT_ID_PREFIX = 'proj:'

export function readProjectPrompts(cwd: string): PromptListRow[] {
  const dir = join(cwd, '.claude', 'commands')
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    // Missing, unreadable, or not a directory. Every one of those is the
    // ordinary case — most cwds have no .claude/commands — and throwing would
    // take the SAVED prompts down with it, since they share one list call.
    return []
  }

  const out: PromptListRow[] = []
  // Sorted so the palette's order is stable across launches; readdir's order
  // is filesystem-dependent, and a list that reshuffles is a list you cannot
  // learn.
  for (const entry of names.sort()) {
    if (out.length >= MAX_PROJECT_PROMPTS) break
    // One level deep only. Claude Code namespaces commands in subdirectories;
    // supporting that means a recursive walk over a directory this app does
    // not control — a bigger promise than M5b makes.
    if (extname(entry) !== '.md') continue
    const path = join(dir, entry)
    try {
      const stat = statSync(path)
      // Skipped, never truncated: half a prompt pasted into an agent reads as
      // a complete instruction, not a partial one the user can catch.
      if (!stat.isFile() || stat.size > MAX_PROMPT_BYTES) continue
      const body = readFileSync(path, 'utf8')
      if (body === '') continue
      const name = basename(entry, '.md')
      out.push({ id: `${PROJECT_ID_PREFIX}${name}`, name, source: 'project', body })
    } catch {
      // One unreadable file costs that file — the same discipline
      // parseLayout applies to one malformed panel.
      continue
    }
  }
  return out
}

/**
 * Saved first, then project. Never deduped by name: two prompts called
 * "review" from two sources are two rows, and the palette labels each with
 * its source, because pasting the wrong project's context into an agent is
 * silent and expensive.
 */
export function mergePrompts(saved: Prompt[], project: PromptListRow[]): PromptListRow[] {
  return [
    ...saved.map((p) => ({ id: p.id, name: p.name, source: 'saved' as const, body: p.body })),
    ...project
  ]
}
