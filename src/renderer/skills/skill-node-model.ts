import type { NamedToolEntry, SkillResources, ToolScope } from '@shared/toolbox'
import type { PluginDetailsResult } from '@shared/skills'

/**
 * M127. The skill panel's whole body, as data.
 *
 * Pure, for the reason every view model in this repo since M8c is: the
 * component owns the frame, the doors and the scroll host, and NOTHING that
 * decides what a section says. The six sections are each a THREE-STATE
 * result — "this skill ships nothing", "we could not look" and "here it is"
 * are three different sentences leading a user to three different fixes, and
 * collapsing any two of them tells them the wrong one (`SkillResources`'
 * own rule, applied to the other five).
 *
 * Nothing here is copied onto the panel record: the record is `{scope, name}`
 * and every word below is derived from a live inventory read. A description
 * on the record would be a second author that goes stale silently.
 */

export type SkillSectionId = 'frontmatter' | 'text' | 'resources' | 'also' | 'panels' | 'plugin'

export interface SkillSection {
  id: SkillSectionId
  heading: string
  /**
   * `none` — asked, and the answer is genuinely nothing.
   * `unknown` — we could not ask, or the answer did not arrive.
   * `some` — a real answer.
   */
  state: 'none' | 'unknown' | 'some'
  /** The sentence for `none`/`unknown`, or the rendered lines for `some`. */
  lines: string[]
}

/** The capped `SKILL.md` text, read through the ordinary `file:read` door. */
export type SkillTextState =
  | { kind: 'pending' }
  | { kind: 'unknown'; why: string }
  | { kind: 'some'; text: string; truncated: boolean }

/** One open panel that has a directory, and whether its inventory holds this skill. */
export interface SkillPanelSighting {
  panelId: string
  label: string
  sees: boolean
}

export interface SkillNodeInput {
  scope: ToolScope
  name: string
  /** The live entry, when some inventory holds it. */
  entry: NamedToolEntry | undefined
  /** Why there is no entry — a sentence, never an empty section. */
  entryWhy: string
  text: SkillTextState
  /** Every open panel with a directory; `sees` is per-panel, never a global yes. */
  panels: readonly SkillPanelSighting[]
  /** `undefined` until the panel has asked; only ever asked for a plugin skill. */
  details: PluginDetailsResult | undefined
}

const SCOPE_WORD: Readonly<Record<ToolScope, string>> = { user: 'user', project: 'project', local: 'local' }

function resourceLines(resources: SkillResources | undefined): SkillSection {
  const heading = 'Resources'
  if (resources === undefined) return { id: 'resources', heading, state: 'unknown', lines: ['no inventory has been read for this skill yet'] }
  if (resources.kind === 'none') return { id: 'resources', heading, state: 'none', lines: ['this skill ships no bundled files'] }
  // `unknown` carries the reader's own why: a `0` here would be the
  // confident wrong answer `SkillResources` exists to refuse.
  if (resources.kind === 'unknown') return { id: 'resources', heading, state: 'unknown', lines: [`the folder could not be listed — ${resources.why}`] }
  return { id: 'resources', heading, state: 'some', lines: [`${resources.n} bundled file${resources.n === 1 ? '' : 's'}`] }
}

export function skillNodeSections(input: SkillNodeInput): SkillSection[] {
  const { entry, name } = input
  const out: SkillSection[] = []

  /* 1. Frontmatter — the name and the sentence, as the file declares them. */
  if (entry === undefined) {
    out.push({ id: 'frontmatter', heading: 'Frontmatter', state: 'unknown', lines: [input.entryWhy] })
  } else if (entry.description === '') {
    out.push({ id: 'frontmatter', heading: 'Frontmatter', state: 'none', lines: [`${entry.name} — the file declares no description`] })
  } else {
    out.push({
      id: 'frontmatter',
      heading: 'Frontmatter',
      state: 'some',
      // The truncation is SAID, never silent: a sentence that stops
      // mid-word without saying so is a list that lies about being complete.
      lines: [entry.name, entry.descriptionTruncated ? `${entry.description} (cut)` : entry.description]
    })
  }

  /* 2. The SKILL.md text, capped by the reader this panel borrows. */
  const t = input.text
  out.push(
    t.kind === 'pending' ? { id: 'text', heading: 'SKILL.md', state: 'unknown', lines: ['reading…'] }
      : t.kind === 'unknown' ? { id: 'text', heading: 'SKILL.md', state: 'unknown', lines: [t.why] }
        : t.text.trim() === '' ? { id: 'text', heading: 'SKILL.md', state: 'none', lines: ['the file is empty below its frontmatter'] }
          : { id: 'text', heading: 'SKILL.md', state: 'some', lines: t.truncated ? [t.text, '(the rest of the file is past the read cap)'] : [t.text] }
  )

  /* 3. Resources. */
  out.push(resourceLines(entry?.resources))

  /* 4. alsoDefinedIn — the LINK, and no winner.
     M21 measured that two scopes can define one name and REFUSED to say
     which the CLI uses, because this app cannot verify that resolution and a
     confident answer would mark a row inactive for an agent that can in fact
     use it. This panel inherits that refusal rather than re-deciding it. */
  if (entry === undefined) {
    out.push({ id: 'also', heading: 'Also defined in', state: 'unknown', lines: [input.entryWhy] })
  } else if (entry.alsoDefinedIn.length === 0) {
    out.push({ id: 'also', heading: 'Also defined in', state: 'none', lines: [`only the ${SCOPE_WORD[entry.scope]} scope defines ${name}`] })
  } else {
    out.push({
      id: 'also',
      heading: 'Also defined in',
      state: 'some',
      lines: [
        `${name} is also defined in ${entry.alsoDefinedIn.map((s) => SCOPE_WORD[s]).join(', ')}.`,
        'This app does not say which file the CLI reaches for — it reports the link.'
      ]
    })
  }

  /* 5. Which OPEN panels can see this skill. `docs/ideas-backlog.md` #26
     calls this the entry's whole original argument, and it is cheap because
     the inventory cache is keyed by resolved cwd: twelve panels in one
     repository cost one parse. */
  const seeing = input.panels.filter((p) => p.sees)
  if (input.panels.length === 0) {
    out.push({ id: 'panels', heading: 'Available in', state: 'unknown', lines: ['no open panel has a directory, so no inventory could be read'] })
  } else if (seeing.length === 0) {
    out.push({ id: 'panels', heading: 'Available in', state: 'none', lines: ['no open panel can see this skill'] })
  } else {
    out.push({
      id: 'panels',
      heading: 'Available in',
      state: 'some',
      lines: [`${seeing.length} of ${input.panels.length} open panel${input.panels.length === 1 ? '' : 's'} can see this skill:`, ...seeing.map((p) => p.label)]
    })
  }

  /* 6. `claude plugin details <id>`, VERBATIM. There is no --json
     (measurement 5), so nothing here parses it: the text is one string, and
     the component puts it in a <pre>. A non-plugin skill says so — never an
     absent section, which reads as a feature that was never built. */
  const pluginId = entry?.pluginId
  if (pluginId === undefined) {
    out.push({ id: 'plugin', heading: 'Plugin', state: 'none', lines: ['not a plugin skill'] })
  } else if (input.details === undefined) {
    out.push({ id: 'plugin', heading: 'Plugin', state: 'unknown', lines: [`asking claude plugin details ${pluginId}…`] })
  } else if (input.details.kind === 'unknown') {
    out.push({ id: 'plugin', heading: 'Plugin', state: 'unknown', lines: [input.details.why] })
  } else {
    out.push({ id: 'plugin', heading: 'Plugin', state: 'some', lines: [input.details.text] })
  }

  return out
}

/** M127. The door's refusal when the entry carries no file to reveal. */
/**
 * M128 fix. The delete confirm, which NAMES WHAT GOES WITH THE SKILL.
 *
 * `deleteSkill` trashes the DIRECTORY, so a skill's bundled `references/`,
 * `scripts/` and `assets/` go with it. A confirm that said "delete this
 * skill?" would understate what the user is about to lose by however many
 * files the folder holds, and the three-state resource count is already read
 * — so all three states are said, and each says something different: a
 * count, an admission that the folder could not be listed (never a confident
 * `0`, `costOf`'s rule), and — for a skill that ships nothing — nothing at
 * all, because there is nothing extra to warn about.
 */
export function deleteConfirmText(name: string, resources: SkillResources | undefined): string {
  const tail =
    resources === undefined ? ''
      : resources.kind === 'some' ? ` and its ${resources.n} resource${resources.n === 1 ? '' : 's'}`
        : resources.kind === 'unknown' ? ' — its resources folder could not be read' : ''
  return `Move ${name}${tail} to the Trash? The Finder is the way back.`
}

export const REASON_NO_SOURCE = 'no inventory has been read for this skill yet, so there is no folder to open'
