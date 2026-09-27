import { appendFileSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { contextTokens } from '@shared/agent-session'
import type { TokenTotals } from '@shared/cost'
import type { TranscriptTurn } from '@shared/transcript'

/**
 * M73. The durable transcript of a chat panel: one append-only file per
 * PANEL id under `userData/agent-transcripts/`, written by main from the
 * agent-session manager's events, read by the renderer at restore so a chat
 * panel renders yesterday's turns before any process exists.
 *
 * Two facts shape it:
 *
 * - It is an APPEND STREAM, the scrollback log's shape and deliberately not
 *   `layout-store.ts`'s temp-and-rename: a transcript grows for the life of
 *   a panel and rewriting the whole file per turn is quadratic in
 *   conversation length on the main thread.
 * - A turn is written WHOLE each time it changes. The CLI emits an assistant
 *   message once per content block, so the manager re-emits the merged turn;
 *   appending the new turn line and letting the reader keep the LAST line per
 *   turn id is what makes the file correct without ever seeking in it.
 *
 * The reader is a parser of a file this app wrote and a previous version may
 * have written differently, so parseLayout's rule applies: a malformed line —
 * a torn tail from a crash mid-append, a garbage line — costs itself and
 * nothing else. The CLI's own transcript under `~/.claude/projects` is a
 * different file with a different job: it is what `--resume` reads, and this
 * app never renders from it here (M74 does, for a terminal's session).
 */

export interface AgentTranscriptMeta {
  usage: TokenTotals
  costUsd?: number
  /**
   * M354. The panel's spend CARRIED across every process it ran (M350's
   * `priorUsd + procUsd`), not `costUsd`, which is one process's figure. The
   * runtime's result path is its only writer: an imported conversation's
   * meta has none, so spend made outside this app never counts against a
   * cap here.
   */
  spentUsd?: number
  turns: number
}

export interface AgentTranscriptRead {
  turns: TranscriptTurn[]
  meta?: AgentTranscriptMeta
  /**
   * M382. Sealed lines this machine could not open — written under a key its
   * keychain no longer holds (another Mac's, a reset keychain). Absent when
   * none: a transcript that lost lines says so, never reads as shorter.
   */
  unreadable?: number
}

/**
 * M382. The line cipher: the credential store's shape (`CredentialCrypto`),
 * and in production the same keychain-held key (`credential-crypto.ts`).
 * Called LAZILY for that module's reason: safeStorage is not usable before
 * the app is ready, and the log is built at module scope.
 */
export interface TranscriptCrypto {
  available(): boolean
  encrypt(plaintext: string): Buffer
  decrypt(blob: Buffer): string
}

/** A sealed line's prefix; the version is in it so a second cipher can be told from the first. */
export const SEALED_PREFIX = 'enc1:'

export interface AgentTranscriptLog {
  appendTurn(panelId: string, turn: TranscriptTurn): void
  appendMeta(panelId: string, meta: AgentTranscriptMeta): void
  /**
   * M322. A tombstone: the turn is gone from every later read. A turn
   * appended again under the same id after it takes a NEW position (the end)
   * — which is how a queued message moves to where it was delivered.
   */
  removeTurn(panelId: string, turnId: string): void
  read(panelId: string): AgentTranscriptRead
  drop(panelId: string): void
}

/**
 * M354. The meter a relaunched chat starts from: the spend the last result
 * carried, and the context of the last assistant message that reported usage
 * (each message's usage is the conversation's size at that call, M350).
 * `costUsd` is never read here: it is one process's figure, and an import
 * writes it for spend made outside this app. A figure never measured is
 * absent, never 0.
 */
export function carriedMeter(read: AgentTranscriptRead): { spentUsd?: number; context?: number } {
  let context: number | undefined
  for (let i = read.turns.length - 1; i >= 0 && context === undefined; i--) {
    const turn = read.turns[i]
    if (turn.role === 'assistant' && turn.usage !== undefined) context = contextTokens(turn.usage)
  }
  return { ...(read.meta?.spentUsd === undefined ? {} : { spentUsd: read.meta.spentUsd }), ...(context === undefined ? {} : { context }) }
}

function isRecord(raw: unknown): raw is Record<string, unknown> {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw)
}

function num(raw: unknown): number {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : 0
}

/** Panel ids are renderer-minted short tokens; anything else is refused into a safe name. */
function fileFor(dir: string, panelId: string): string {
  return join(dir, `${panelId.replace(/[^A-Za-z0-9_-]/g, '_')}.jsonl`)
}

/**
 * M382. THE REPLAY RECORD, ENCRYPTED AT REST. A transcript holds every file
 * an agent wrote and every command it ran — a node's whole replay (M381) — so
 * with a cipher each line is sealed on its way to disk under the keychain's
 * key (`enc1:` + base64). Per LINE, so the file stays an append stream (the
 * header's first fact). A file with plaintext lines from before is SEALED
 * WHOLE on this session's first write to it — rewritten through a temp file
 * and a rename, once — so "encrypted at rest" is not "encrypted from now on".
 * Reading takes both: a plaintext line is a line this app wrote earlier, and
 * a sealed line this keychain cannot open is counted (`unreadable`), never
 * silently dropped. With no cipher (a harness) or none available, lines are
 * written plain exactly as before.
 */
export function createAgentTranscriptLog(deps: { dir: string; crypto?: TranscriptCrypto }): AgentTranscriptLog {
  const sealedThisSession = new Set<string>()
  const cipherOn = (): boolean => {
    try { return deps.crypto?.available() === true } catch { return false }
  }
  const seal = (line: string): string => SEALED_PREFIX + (deps.crypto as TranscriptCrypto).encrypt(line).toString('base64')
  const ensureDir = (): void => {
    try {
      mkdirSync(deps.dir, { recursive: true })
    } catch {
      // The append below reports the real failure.
    }
  }
  /** Rewrite a file's plaintext lines sealed, once per file per session. */
  const sealExisting = (file: string): void => {
    if (sealedThisSession.has(file)) return
    sealedThisSession.add(file)
    let text: string
    try { text = readFileSync(file, 'utf8') } catch { return }
    const lines = text.split('\n').filter((l) => l.trim() !== '')
    if (!lines.some((l) => !l.startsWith(SEALED_PREFIX))) return
    const tmp = `${file}.tmp`
    try {
      writeFileSync(tmp, lines.map((l) => (l.startsWith(SEALED_PREFIX) ? l : seal(l))).join('\n') + '\n')
      renameSync(tmp, file)
    } catch (error) {
      console.warn('[agent-transcript] could not seal an older transcript', error)
    }
  }
  const append = (panelId: string, line: string): void => {
    ensureDir()
    const file = fileFor(deps.dir, panelId)
    try {
      if (cipherOn()) {
        sealExisting(file)
        appendFileSync(file, seal(line) + '\n')
      } else {
        appendFileSync(file, line + '\n')
      }
    } catch (error) {
      console.warn(`[agent-transcript] could not append for ${panelId}`, error)
    }
  }
  /** A line as JSON text: a plaintext line as it is, a sealed one opened, or null when it cannot be. */
  const open = (line: string): string | null => {
    if (!line.startsWith(SEALED_PREFIX)) return line
    if (deps.crypto === undefined) return null
    try { return deps.crypto.decrypt(Buffer.from(line.slice(SEALED_PREFIX.length), 'base64')) } catch { return null }
  }
  return {
    appendTurn(panelId, turn) {
      append(panelId, JSON.stringify({ t: 'turn', turn }))
    },
    removeTurn(panelId, turnId) {
      append(panelId, JSON.stringify({ t: 'drop', id: turnId }))
    },
    appendMeta(panelId, meta) {
      append(panelId, JSON.stringify({ t: 'meta', meta }))
    },
    read(panelId) {
      let text: string
      try {
        text = readFileSync(fileFor(deps.dir, panelId), 'utf8')
      } catch {
        return { turns: [] }
      }
      // Last line per turn id wins, but a turn keeps its FIRST position:
      // a re-written turn is the same turn, not a later one.
      const order: string[] = []
      const byId = new Map<string, TranscriptTurn>()
      let meta: AgentTranscriptMeta | undefined
      let unreadable = 0
      for (const raw of text.split('\n')) {
        if (raw.trim() === '') continue
        const line = open(raw)
        if (line === null) { unreadable++; continue }
        let parsed: unknown
        try {
          parsed = JSON.parse(line)
        } catch {
          continue
        }
        if (!isRecord(parsed)) continue
        if (parsed.t === 'turn' && isRecord(parsed.turn)) {
          const turn = parsed.turn
          if (typeof turn.id !== 'string' || (turn.role !== 'user' && turn.role !== 'assistant')) continue
          const stored: TranscriptTurn = {
            id: turn.id,
            role: turn.role,
            // A block with no string `type` would render as "a undefined
            // block": it costs itself, never the turn.
            blocks: Array.isArray(turn.blocks) ? (turn.blocks.filter((b) => isRecord(b) && typeof b.type === 'string') as TranscriptTurn['blocks']) : [],
            at: num(turn.at),
            ...(typeof turn.model === 'string' ? { model: turn.model } : {}),
            ...(isRecord(turn.usage)
              ? { usage: { input: num(turn.usage.input), output: num(turn.usage.output), cacheWrite: num(turn.usage.cacheWrite), cacheRead: num(turn.usage.cacheRead) } }
              : {}),
            ...(turn.delivery === 'queued' || turn.delivery === 'not-delivered' ? { delivery: turn.delivery } : {}),
            ...(typeof turn.deliveryNote === 'string' ? { deliveryNote: turn.deliveryNote } : {})
          }
          if (!byId.has(turn.id)) order.push(turn.id)
          byId.set(turn.id, stored)
        } else if (parsed.t === 'drop' && typeof parsed.id === 'string') {
          if (byId.delete(parsed.id)) order.splice(order.indexOf(parsed.id), 1)
        } else if (parsed.t === 'meta' && isRecord(parsed.meta)) {
          const m = parsed.meta
          const usage = isRecord(m.usage) ? m.usage : {}
          meta = {
            usage: { input: num(usage.input), output: num(usage.output), cacheWrite: num(usage.cacheWrite), cacheRead: num(usage.cacheRead) },
            ...(typeof m.costUsd === 'number' && Number.isFinite(m.costUsd) ? { costUsd: m.costUsd } : {}),
            ...(typeof m.spentUsd === 'number' && Number.isFinite(m.spentUsd) && m.spentUsd >= 0 ? { spentUsd: m.spentUsd } : {}),
            turns: num(m.turns)
          }
        }
      }
      return { turns: order.map((id) => byId.get(id) as TranscriptTurn), ...(meta === undefined ? {} : { meta }), ...(unreadable === 0 ? {} : { unreadable }) }
    },
    drop(panelId) {
      try {
        rmSync(fileFor(deps.dir, panelId), { force: true })
      } catch (error) {
        console.warn(`[agent-transcript] could not drop ${panelId}`, error)
      }
    }
  }
}
