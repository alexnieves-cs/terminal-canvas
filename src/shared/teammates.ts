/**
 * M100. A TEAMMATE is a persistent identity with a scope, not a spawned
 * process: a name, a brief (the system prompt it carries on every spawn),
 * its own memory, the skills it may read, the PLACES it may touch, the
 * services it may spend (M102), and whether it may message and be scheduled
 * (M101). Saved top level beside `presets` and `templates` in `layout.json`
 * with the record rules: absent is every pre-existing file; a malformed
 * record is dropped by name and the collection survives; an absent optional
 * field stays absent through every copy site (`carryTeammate`).
 *
 * The three permissions are three LISTS, not one flag, because they fail
 * differently: a wrong folder leaks a file, a wrong service spends a
 * credential, a wrong schedule runs unattended. A `trusted` boolean would
 * hide which one the user actually granted.
 *
 * Pure; `verify:teammates record.1`, `verify:layout teammate.1–.2`.
 */
export interface PersistedTeammate {
  id: string
  name: string
  /** The system prompt appended on every spawn (the M81 supervisor rule). Empty is allowed. */
  brief: string
  /** Absolute folders. The ONLY folders this teammate may touch; empty means none. */
  places: string[]
  /** Service ids it may spend through the broker (M102). */
  services: string[]
  /** Absolute paths of `.md` skills it may read — a place rule applies to each. */
  skills: string[]
  /** The slug of its own memory file under `userData/memory/teammates`. */
  memory: string
  /** Panel ids of its chats, newest last. */
  chats: string[]
  messaging: boolean
  scheduling: boolean
}

/** The newest kept; a roster, not a history. */
export const TEAMMATES_MAX = 50

/** Every field copied by value; no key is ever written `undefined`. */
export function carryTeammate(t: PersistedTeammate): PersistedTeammate {
  return {
    id: t.id,
    name: t.name,
    brief: t.brief,
    places: [...t.places],
    services: [...t.services],
    skills: [...t.skills],
    memory: t.memory,
    chats: [...t.chats],
    messaging: t.messaging,
    scheduling: t.scheduling
  }
}

/** A new teammate has NO places, no services and no schedule: nothing is granted by default. */
export function emptyTeammate(id: string, name: string): PersistedTeammate {
  return { id, name, brief: '', places: [], services: [], skills: [], memory: id, chats: [], messaging: false, scheduling: false }
}

/** `chat as ada` — the sheet's row and the chrome's word. */
export function teammateWord(t: PersistedTeammate): string {
  return t.name.trim() === '' ? t.id : t.name
}
