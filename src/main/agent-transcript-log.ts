import { appendFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
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
  turns: number
}

export interface AgentTranscriptRead {
  turns: TranscriptTurn[]
  meta?: AgentTranscriptMeta
}

export interface AgentTranscriptLog {
  appendTurn(panelId: string, turn: TranscriptTurn): void
  appendMeta(panelId: string, meta: AgentTranscriptMeta): void
  read(panelId: string): AgentTranscriptRead
  drop(panelId: string): void
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

export function createAgentTranscriptLog(deps: { dir: string }): AgentTranscriptLog {
  const ensureDir = (): void => {
    try {
      mkdirSync(deps.dir, { recursive: true })
    } catch {
      // The append below reports the real failure.
    }
  }
  const append = (panelId: string, line: string): void => {
    ensureDir()
    try {
      appendFileSync(fileFor(deps.dir, panelId), line + '\n')
    } catch (error) {
      console.warn(`[agent-transcript] could not append for ${panelId}`, error)
    }
  }
  return {
    appendTurn(panelId, turn) {
      append(panelId, JSON.stringify({ t: 'turn', turn }))
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
      for (const line of text.split('\n')) {
        if (line.trim() === '') continue
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
              : {})
          }
          if (!byId.has(turn.id)) order.push(turn.id)
          byId.set(turn.id, stored)
        } else if (parsed.t === 'meta' && isRecord(parsed.meta)) {
          const m = parsed.meta
          const usage = isRecord(m.usage) ? m.usage : {}
          meta = {
            usage: { input: num(usage.input), output: num(usage.output), cacheWrite: num(usage.cacheWrite), cacheRead: num(usage.cacheRead) },
            ...(typeof m.costUsd === 'number' && Number.isFinite(m.costUsd) ? { costUsd: m.costUsd } : {}),
            turns: num(m.turns)
          }
        }
      }
      return { turns: order.map((id) => byId.get(id) as TranscriptTurn), ...(meta === undefined ? {} : { meta }) }
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
