import { useSyncExternalStore } from 'react'
// `trailFromTurns` lives in shared/skill-trail.ts beside `scanTrailChunk`:
// one definition of what counts as a skill invocation, for the two places
// this app can see one — and pure, so verify:file drives it under plain node
// (trail.chat.1a–d) rather than through a rendered panel.
import { trailFromTurns, type Trail } from '@shared/skill-trail'
import { getChat, subscribeChat } from '@renderer/chat/chat-store'
import type { Panel } from '@renderer/panels/panels'

/**
 * M130. WHAT SKILLS THIS PANEL'S AGENT USED — per panel, in a module-level
 * store subscribed BY ID, the shape every store since M12 takes and never
 * `registry.version()`, which carries tier/status/focus/exit and nothing
 * higher-frequency (a trail arriving through it would re-render the whole
 * canvas for one card).
 *
 * Only a TERMINAL's trail is stored here: main tails the CLI's own transcript
 * from a byte offset (`skill-trail-read.ts`) and the renderer caches the
 * answer. A CHAT's trail is not stored at all — the events are already in
 * this renderer's memory, in the chat store's turns, so `trailFromTurns`
 * derives it and no IO, no cache and no invalidation exist for it. Two
 * sources, one shape; see `useTrailFor` for the one door every surface asks.
 *
 * Cleared at every panel-removing call site beside `clearAgentState`, or a
 * recycled id inherits a dead panel's skills.
 */

const trails = new Map<string, Trail>()
const listeners = new Map<string, Set<() => void>>()

/**
 * The one frozen `none`, returned for a panel nothing has been read for yet.
 *
 * A cached constant rather than a fresh object: `useSyncExternalStore`
 * compares snapshots by identity, and a new `{ kind: 'none' }` per call
 * re-renders forever.
 */
const NOT_READ: Trail = Object.freeze({ kind: 'none' }) as Trail

function notify(id: string): void {
  const set = listeners.get(id)
  if (!set) return
  for (const cb of set) cb()
}

/** Main answered `skill:trail` for this panel. */
export function applyTrail(id: string, trail: Trail): void {
  const prev = trails.get(id)
  if (prev !== undefined && sameTrail(prev, trail)) return
  trails.set(id, trail)
  notify(id)
}

/**
 * Value equality over the two fields a render reads, so a poll that answered
 * the same thing again does not re-render the lane. Names and order only —
 * `at` moves for a record with no parseable timestamp (see `scanTrailChunk`)
 * and nothing on screen shows it.
 */
function sameTrail(a: Trail, b: Trail): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'unreadable' && b.kind === 'unreadable') return a.why === b.why
  if (a.kind === 'entries' && b.kind === 'entries') {
    return a.more === b.more && a.entries.length === b.entries.length &&
      a.entries.every((e, i) => e.name === b.entries[i].name)
  }
  return true
}

/** A panel is gone for good: closed, undone, or dropped by a reset. */
export function clearTrail(id: string): void {
  if (!trails.delete(id)) return
  notify(id)
}

export function getTrail(id: string): Trail {
  return trails.get(id) ?? NOT_READ
}

function subscribeTrail(id: string, cb: () => void): () => void {
  let set = listeners.get(id)
  if (!set) { set = new Set(); listeners.set(id, set) }
  set.add(cb)
  return () => {
    set?.delete(cb)
    if (set && set.size === 0) listeners.delete(id)
  }
}

export function useTrail(id: string): Trail {
  return useSyncExternalStore((cb) => subscribeTrail(id, cb), () => getTrail(id), () => getTrail(id))
}


/**
 * The ONE door every surface asks for a panel's trail — a chat's from the
 * chat store, everything else's from this store.
 *
 * Both hooks are called unconditionally (React's rule), and the chat
 * subscription is the store's own per-id one, so a terminal host pays a
 * subscription to an id that never changes and a chat pays nothing for the
 * trail map it does not use.
 */
export { trailFromTurns }

export function useTrailFor(id: string, kind: Panel['kind']): Trail {
  const stored = useTrail(id)
  const chat = useSyncExternalStore((cb) => subscribeChat(id, cb), () => getChat(id).turns, () => getChat(id).turns)
  // Derived per render rather than memoised: `turns` is a stable array
  // identity between turn ends, and a memo keyed on it would cost a hook in
  // every frame for a walk over at most a few hundred blocks.
  return kind === 'chat' ? trailFromTurns(chat) : stored
}

/**
 * M256. EVERY SKILL USE THIS CANVAS CAN SEE, newest first — the Skills
 * workspace's "recent usage". A SNAPSHOT read when asked, never a
 * subscription: the workspace is a view a person opens to look, and a list
 * that reshuffled under the cursor as agents ran would be harder to read than
 * one refreshed on the next open. Both trail sources, through the same rule
 * `useTrailFor` uses: a chat derives from its turns, everything else from the
 * stored answer.
 */
export interface SkillUse { name: string; at: number; panelId: string; where: string }
export function recentSkillUses(panels: ReadonlyArray<{ id: string; kind: Panel['kind']; label: string }>): SkillUse[] {
  const out: SkillUse[] = []
  for (const p of panels) {
    const trail = p.kind === 'chat' ? trailFromTurns(getChat(p.id).turns) : trails.get(p.id)
    if (trail === undefined || trail.kind !== 'entries') continue
    for (const e of trail.entries) out.push({ name: e.name, at: e.at, panelId: p.id, where: p.label })
  }
  return out.sort((a, b) => b.at - a.at)
}
