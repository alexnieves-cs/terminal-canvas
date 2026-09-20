/**
 * M288. THE SUBJECT GATE — every workbench read is bound to the selection
 * identity it was asked for, and an answer lands only if that identity is
 * still the one on show AND no later answer for it has landed already.
 *
 * Two failures this closes, both measured in Phase C's harness before it
 * existed: (1) a rapid selection switch A → B → A, where B's slow answer
 * arrives after A's fast one and paints B's diff under A's controls; the key
 * check alone lets it through, because A IS current again; (2) two answers for
 * the SAME subject (a Refresh clicked twice) arriving out of order, the older
 * one overwriting the newer. A per-key monotonic sequence refuses both: a
 * ticket is minted when the read is ASKED, and lands only if it is newer than
 * whatever last landed for that key. Pure and framework-free, so
 * `verify:orchestration orch-islands.*` can drive it in plain node.
 */

export interface SubjectTicket {
  readonly key: string
  readonly seq: number
}

export interface SubjectGate {
  /** The selection moved: from now on only `key`'s tickets may land. */
  move(key: string): void
  /** Mint a ticket for a read about `key` — call when the read is STARTED, never when it lands. */
  ask(key: string): SubjectTicket
  /** True exactly once per ticket that is both current and newest; false is "drop this answer". */
  lands(ticket: SubjectTicket): boolean
  current(): string
}

export function createSubjectGate(initial = ''): SubjectGate {
  let current = initial
  let seq = 0
  const landed = new Map<string, number>()
  return {
    move(key) { current = key },
    ask(key) { seq += 1; return { key, seq } },
    lands(ticket) {
      if (ticket.key !== current) return false
      const last = landed.get(ticket.key) ?? 0
      if (ticket.seq <= last) return false
      landed.set(ticket.key, ticket.seq)
      return true
    },
    current() { return current }
  }
}
