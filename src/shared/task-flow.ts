import type { PersistedWorkItem } from './work-items'

/**
 * M310. THE FLAGSHIP FLOW'S JOINS — issue → repository → agent in a lane →
 * review → checks → pull request, with the intended outcome carried the
 * whole way rather than typed again at each step.
 *
 * Three pure pieces the surfaces share, so the message the agent gets, the
 * command the person is offered and the PR body a reviewer reads are each
 * written once:
 *
 *   - `dispatchMessage` — the first message a lane's agent receives. It now
 *     carries the person's intended outcome and acceptance criteria (M287's
 *     brief), which the dispatch dropped: an agent told only a title works
 *     to the title, and the review then asks about criteria it never saw.
 *   - `suggestCheckCommand` — a starting point for "Run checks" from the
 *     lane's own files. A SUGGESTION the person edits before anything runs,
 *     never a guess that runs: this app keeps no list of test runners it
 *     trusts (`check-evidence.ts`'s rule), so the answer is what the
 *     repository itself declares.
 *   - `prBody` — the pull request's description with the evidence attached:
 *     the outcome, the criteria with the person's confirmations, the
 *     witnessed checks against the revision they tested, and whether the
 *     task was VERIFIED (M307) — said plainly when it was not.
 *
 * Pure: types only. `verify:review flow.1–.3`.
 */

/**
 * `extras` (M312/M314): sections a caller composes elsewhere — the recipe's
 * context, checks and deliverables, the lane's prepared environment — each
 * appended when non-empty, so a task started with neither sends exactly the
 * M310 message.
 */
export function dispatchMessage(item: Pick<PersistedWorkItem, 'key' | 'title' | 'url' | 'description' | 'brief' | 'criteria'>, extras: readonly string[] = []): string {
  // M315. A task the person TYPED opens with its own words. The tracker
  // header ("Dispatched work item / (typed)") was the first line of the first
  // bubble in every conversation a new user started, in this app's internal
  // vocabulary; it identifies an issue, and a typed task has none.
  const header = item.key === undefined
    ? item.title
    : ['Dispatched work item', item.key, item.title, item.url ?? ''].filter((l) => l !== '').join('\n')
  // A typed title cut to fit the board ends in `…` and the description then
  // carries the whole line — sending both showed the sentence twice, the first
  // time cut off mid-word. The whole line is enough.
  const cutTitle = item.key === undefined && item.title.endsWith('…') && item.description !== undefined && item.description.startsWith(item.title.slice(0, -1).trimEnd())
  const parts = cutTitle ? [] : [header]
  if (item.description !== undefined && item.description !== '') parts.push(item.description)
  if (item.brief !== undefined && item.brief.trim() !== '') parts.push(`Intended outcome:\n${item.brief.trim()}`)
  if (item.criteria !== undefined && item.criteria.length > 0) parts.push(`Done when:\n${item.criteria.map((c) => `- ${c}`).join('\n')}`)
  for (const e of extras) if (e.trim() !== '') parts.push(e.trim())
  return parts.join('\n\n')
}

/**
 * What the lane declares it checks with, from its top-level file names and
 * its package.json text (when one was read). Null when it declares nothing
 * this recognises — the person types one; nothing is invented.
 */
export function suggestCheckCommand(files: readonly string[], packageJson?: string): string | null {
  const has = (n: string): boolean => files.includes(n)
  if (has('package.json') && packageJson !== undefined) {
    let scripts: Record<string, unknown> = {}
    try {
      const parsed = JSON.parse(packageJson) as { scripts?: unknown }
      if (typeof parsed.scripts === 'object' && parsed.scripts !== null) scripts = parsed.scripts as Record<string, unknown>
    } catch { /* an unreadable manifest declares nothing */ }
    const runner = has('pnpm-lock.yaml') ? 'pnpm' : has('yarn.lock') ? 'yarn' : has('bun.lockb') || has('bun.lock') ? 'bun' : 'npm'
    for (const name of ['test', 'check', 'verify']) {
      if (typeof scripts[name] === 'string' && scripts[name] !== '') return name === 'test' && runner !== 'bun' ? `${runner} test` : `${runner} run ${name}`
    }
  }
  if (has('Cargo.toml')) return 'cargo test'
  if (has('go.mod')) return 'go test ./...'
  if (has('pyproject.toml') || has('pytest.ini') || has('setup.cfg')) return 'pytest'
  if (has('Makefile')) return 'make test'
  return null
}

export interface PrEvidence {
  /** `verificationOf(...).word` and its missing parts, when read. */
  verification?: { word: string; missing: readonly string[] }
  /** Witnessed checks, bound: command, the word for its outcome, and the revision it tested. */
  checks: readonly { command: string; words: string; tested?: string }[]
  reviewedFiles?: number
  openComments: number
}

/**
 * `evidence` absent means nobody GATHERED it (a PR opened from the card, not
 * the review): the section is left out rather than saying "no check was
 * witnessed", which would be a claim about a record nobody read.
 */
export function prBody(item: Pick<PersistedWorkItem, 'url' | 'description' | 'brief' | 'criteria' | 'criteriaMet'>, evidence?: PrEvidence): string {
  const out: string[] = ['Dispatched from the Terminal Canvas board.']
  if (item.url !== undefined) out.push(`Closes ${item.url}`)
  if (item.brief !== undefined && item.brief.trim() !== '') out.push(`## Intended outcome\n\n${item.brief.trim()}`)
  else if (item.description !== undefined && item.description !== '') out.push(item.description)
  if (item.criteria !== undefined && item.criteria.length > 0) {
    const met = new Set(item.criteriaMet ?? [])
    out.push(`## Acceptance criteria\n\n${item.criteria.map((c) => `- [${met.has(c) ? 'x' : ' '}] ${c}`).join('\n')}`)
  }
  if (evidence === undefined) return out.join('\n\n')
  const ev: string[] = []
  if (evidence.verification !== undefined) {
    ev.push(evidence.verification.missing.length === 0
      ? `**${evidence.verification.word}** — reviewed at this revision, checks passed on it, every comment resolved.`
      : `**${evidence.verification.word}** — ${evidence.verification.missing.join('; ')}.`)
  }
  if (evidence.reviewedFiles !== undefined) ev.push(`Reviewed ${evidence.reviewedFiles} file${evidence.reviewedFiles === 1 ? '' : 's'} on the canvas.`)
  if (evidence.checks.length > 0) {
    ev.push(`Checks this canvas ran (not the agent's own report):\n${evidence.checks.map((c) => `- \`${c.command}\` — ${c.words}${c.tested === undefined ? '' : ` (tested ${c.tested})`}`).join('\n')}`)
  } else {
    ev.push('No check was witnessed by the canvas for this lane.')
  }
  if (evidence.openComments > 0) ev.push(`${evidence.openComments} review comment${evidence.openComments === 1 ? ' is' : 's are'} still open.`)
  out.push(`## Evidence\n\n${ev.join('\n\n')}`)
  return out.join('\n\n')
}

/**
 * M312. A check command as a watcher's argv. A watcher spawns WITHOUT a shell
 * (watch-handlers.ts), so a plain command splits on whitespace as before, and
 * one that needs a shell — `npm run lint && npm test`, a pipe, a variable —
 * runs as `/bin/sh -c <command>` rather than handing `&&` to npm as an argument.
 */
export function watcherArgv(command: string): { command: string; args: string[] } | null {
  const text = command.trim()
  if (text === '') return null
  if (/[&|;<>$`*?(){}"'\\]/.test(text)) return { command: '/bin/sh', args: ['-c', text] }
  const parts = text.split(/\s+/)
  return { command: parts[0] as string, args: parts.slice(1) }
}
