/**
 * M181. THE STARTER CANVAS as data: the manifest (one captioned example of
 * each object kind the app supports today, placed relative to the agent's
 * panel) and the workspace record that makes applying it idempotent.
 *
 * The record lives on the workspace beside `annotations` with the record
 * rules: ABSENT on every pre-M181 file (and absent on disk when the starter
 * was never applied — a written `{version:1, keys:[]}` would claim a canvas
 * the starter never touched), malformed dropped by name, a non-string key
 * dropped with the rest kept. `keys` is the list of manifest keys EVER
 * applied: a key applied once is never minted again, whether its object is
 * still there or the person closed it on purpose — the second is exactly
 * what "never overwrite a canvas a user has edited" means. A later act that
 * adds an object raises STARTER_VERSION and adds a key; applying again mints
 * only the new keys.
 *
 * Pure: `verify:layout starter.1–.3`, `verify:viewport starter.plan.1`.
 */

export const STARTER_VERSION = 1

/** M181. `image:read`'s answer (main/image-read.ts); declared here so the contract imports only from shared. */
export type ImageMediaType = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'
export type ImageResult =
  | { kind: 'data'; dataUrl: string; bytes: number; mediaType: ImageMediaType }
  | { kind: 'missing' }
  | { kind: 'too-large'; bytes: number; cap: number }
  | { kind: 'not-an-image' }

/** M181. `starter:prepare`'s answer (main/starter-prepare.ts). */
export interface StarterFiles { notePath: string; imagePath: string; wrote: string[] }

/** The agent's own key: the chat at the origin, minted through `beginNewChat`, never a manifest object. */
export const AGENT_KEY = 'agent'

export interface StarterObject {
  key: string
  kind: 'terminal' | 'file' | 'workflow' | 'image'
  /** One sentence, shown as a panel-anchored annotation (M93) so it follows its object and dies with it. */
  caption: string
  /** Relative to the agent panel's top-left, in world units. */
  rect: { dx: number; dy: number; w: number; h: number }
}

/**
 * The agent sits at the origin at working size (the chat's default,
 * CHAT_W x CHAT_H = 560x620); the examples form ONE column to its right, so
 * the Examples group's frame (the union of its members) never encloses the
 * agent — the first cut put the image under the chat, the group frame then
 * spanned the composer and swallowed the click on Send (the onboarding
 * journey check found it). 440 wide fits beside the chat in the working view
 * at 100 %; 40 px between rows leaves room for each caption under its
 * object; nothing overlaps (starter.plan.1). Captions are sentences, each
 * under the label's width so none is cut to an ellipsis (the first capture).
 */
export const STARTER_OBJECTS: readonly StarterObject[] = [
  { key: 'terminal', kind: 'terminal', caption: 'A terminal. Click it to start a shell here.', rect: { dx: 640, dy: 0, w: 440, h: 160 } },
  { key: 'note', kind: 'file', caption: 'A note. A Markdown file you can edit in place.', rect: { dx: 640, dy: 200, w: 440, h: 160 } },
  // The workflow's verb strip and its two tabs need the height; 160 clipped them (the M181 critic).
  // M191 (the golden audit, second half, 7). The workflow example is WIDER
  // and TALLER than the others: at 440x260 its verb row wrapped into the
  // header and its diagram was sliced, so the one object meant to show what a
  // workflow is showed a broken panel instead. The others stay small; a
  // shape of work needs room to be a shape.
  { key: 'workflow', kind: 'workflow', caption: 'A workflow. A saved shape of work you can run.', rect: { dx: 640, dy: 400, w: 640, h: 360 } },
  { key: 'image', kind: 'image', caption: 'An image. A picture kept beside the work.', rect: { dx: 640, dy: 800, w: 440, h: 160 } }
]

/**
 * M405 (D3). A STARTER CAPTION is teaching text, not a person's margin note:
 * it paints UNDER the panels (a person's own note stays above them, z 5000),
 * fades out in the far tiers, and retires once its object is taken up. It is
 * recognised by what it IS — a panel-anchored label whose text is one of the
 * manifest's captions — rather than by a new persisted mark, so every canvas
 * the starter already laid out (captions written since M181, no mark) is
 * recognised too, and the annotation record's format does not move. The cost,
 * recorded: a person who types a caption's exact sentence onto a panel gets
 * starter behaviour for that note.
 */
const STARTER_CAPTIONS: ReadonlySet<string> = new Set(STARTER_OBJECTS.map((o) => o.caption))
export function isStarterCaption(a: { text: string; anchor: { kind: string }; ink?: unknown }): boolean {
  return a.ink === undefined && a.anchor.kind === 'panel' && STARTER_CAPTIONS.has(a.text)
}

export interface PersistedStarter {
  version: number
  keys: string[]
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Absent → absent with no warning; malformed → dropped with one warning; a bad key costs that key. A fresh copy. */
export function parseStarter(raw: unknown, warnings: string[]): PersistedStarter | undefined {
  if (raw === undefined) return undefined
  if (!isRecord(raw) || typeof raw['version'] !== 'number' || !Number.isInteger(raw['version']) || raw['version'] < 0 || !Array.isArray(raw['keys'])) {
    warnings.push(`dropped starter record: ${JSON.stringify(raw)} is not { version, keys[] }`)
    return undefined
  }
  return { version: raw['version'], keys: (raw['keys'] as unknown[]).filter((k): k is string => typeof k === 'string') }
}

/** `agent` first, then every manifest key, minus what the record already holds. */
export function starterKeysToApply(record: PersistedStarter | undefined): string[] {
  const applied = new Set(record?.keys ?? [])
  return [AGENT_KEY, ...STARTER_OBJECTS.map((o) => o.key)].filter((k) => !applied.has(k))
}

/** Absent stays absent (a spread would write `starter: undefined`, present at every `in` test); present is copied one level deep. */
export function carryStarter(w: { starter?: PersistedStarter }): { starter?: PersistedStarter } {
  return w.starter === undefined ? {} : { starter: { version: w.starter.version, keys: [...w.starter.keys] } }
}
