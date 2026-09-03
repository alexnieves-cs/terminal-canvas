import { addTotals, emptyTotals, type TokenTotals } from '@shared/cost'
import { parseStreamLine, type TranscriptTurn } from '@shared/transcript'

/**
 * M74. A terminal's Claude session, read from the CLI's OWN transcript
 * (`~/.claude/projects/<slug>/<uuid>.jsonl`, found by M17's
 * `resolveTranscript`) into the turns a chat panel renders — the import
 * behind `Open as chat`.
 *
 * Pure over the file's text, so `verify:agent-session import.*` drives it
 * under plain node. The file is another program's, measured on 2026-09-03
 * (the M74 spec records the shapes): `assistant` records are the stream's
 * shape, one per content block, merged here by `message.id` with their
 * repeated usage counted ONCE per message; `user` records carry either a
 * block list or a bare STRING (a typed prompt — the one arm the stream never
 * produces); `isSidechain: true` marks a subagent's records, which are not
 * this conversation's turns; `isMeta: true` marks the CLI's own injected
 * notes (an image marker, a companion line), which are not turns the user
 * typed; every other record type is ignored and counted, a malformed line
 * costs itself.
 */

export interface ImportedTranscript {
  turns: TranscriptTurn[]
  meta: { usage: TokenTotals; costUsd?: number; turns: number }
  skipped: { sidechain: number; meta: number; ignored: number; malformed: number }
}

function isRecord(raw: unknown): raw is Record<string, unknown> {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw)
}

export function importClaudeTranscript(text: string): ImportedTranscript {
  const turns: TranscriptTurn[] = []
  const skipped = { sidechain: 0, meta: 0, ignored: 0, malformed: 0 }
  let usage = emptyTotals()
  const priced = new Set<string>()
  let userTurns = 0
  let seq = 0
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue
    let raw: unknown
    try {
      raw = JSON.parse(line)
    } catch {
      skipped.malformed += 1
      continue
    }
    if (!isRecord(raw)) {
      skipped.malformed += 1
      continue
    }
    if (raw.isSidechain === true) {
      skipped.sidechain += 1
      continue
    }
    if (raw.isMeta === true) {
      skipped.meta += 1
      continue
    }
    const at = typeof raw.timestamp === 'string' ? (Date.parse(raw.timestamp) || 0) : 0
    const event = parseStreamLine(line)
    if (event.type === 'assistant') {
      const last = turns[turns.length - 1]
      if (last && last.role === 'assistant' && last.id === event.messageId) {
        last.blocks.push(...event.blocks)
      } else {
        turns.push({ id: event.messageId || `a-${++seq}`, role: 'assistant', blocks: event.blocks, ...(event.model === undefined ? {} : { model: event.model }), at })
      }
      if (event.usage && event.messageId && !priced.has(event.messageId)) {
        priced.add(event.messageId)
        usage = addTotals(usage, event.usage)
      }
      continue
    }
    if (event.type === 'user') {
      if (event.blocks.length === 0) {
        skipped.ignored += 1
        continue
      }
      if (event.blocks.some((b) => b.type === 'text')) userTurns += 1
      turns.push({ id: `u-${++seq}`, role: 'user', blocks: event.blocks, at })
      continue
    }
    if (event.type === 'malformed') skipped.malformed += 1
    else skipped.ignored += 1
  }
  return { turns, meta: { usage, turns: userTurns }, skipped }
}
