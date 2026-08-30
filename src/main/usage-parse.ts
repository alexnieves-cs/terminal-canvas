import { type TokenTotals } from '../shared/cost'

/**
 * One assistant turn's usage, pulled out of a Claude Code transcript line.
 *
 * Pure and import-free apart from a type, so it runs in the plain-node verify
 * tier — the same trade git-args.ts makes.
 */
export interface UsageEntry {
  model: string
  totals: TokenTotals
  /** An isSidechain record: a subagent's turn, in the same session file. */
  subagent: boolean
}

export interface ParsedChunk {
  entries: UsageEntry[]
  /**
   * The trailing fragment this chunk ended on, to be prepended to the next.
   *
   * This is the parser's whole correctness. A read can land while Claude Code
   * is mid-write, so the last line routinely arrives without its newline.
   * Parsing it fails; DROPPING it loses that turn's tokens permanently,
   * because the caller's byte offset has already advanced past those bytes and
   * nothing will ever read them again. The failure is a total that is quietly
   * and unrecoverably low, by an amount proportional to how busy the agent
   * is — the worst possible direction for this feature.
   */
  carry: string
}

/** Absent is 0, never NaN: one NaN poisons every later addition silently. */
function num(raw: unknown): number {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : 0
}

function isRecord(raw: unknown): raw is Record<string, unknown> {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw)
}

/**
 * Parse the bytes appended since the last read, plus whatever fragment that
 * read ended on.
 *
 * Individual lines are dropped individually on malformed input, the rule
 * parseLayout already obeys — and with more reason here, since this is another
 * program's file and one bad line must not cost the rest of the chunk.
 */
export function parseUsageChunk(text: string, carry: string): ParsedChunk {
  const whole = carry + text
  const lines = whole.split('\n')
  // The last element is whatever followed the final newline: '' for a chunk
  // that ended cleanly, a fragment otherwise. Either way it is NOT a complete
  // line and must not be parsed.
  const nextCarry = lines.pop() ?? ''
  const entries: UsageEntry[] = []
  for (const line of lines) {
    if (line.trim() === '') continue
    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch {
      continue
    }
    if (!isRecord(parsed) || parsed.type !== 'assistant') continue
    const message = parsed.message
    if (!isRecord(message)) continue
    const usage = message.usage
    // A streamed record can be written before its usage is known. No usage is
    // not a zero-cost turn, it is a turn we cannot price yet.
    if (!isRecord(usage)) continue
    entries.push({
      model: typeof message.model === 'string' ? message.model : 'unknown',
      subagent: parsed.isSidechain === true,
      totals: {
        input: num(usage.input_tokens),
        output: num(usage.output_tokens),
        cacheWrite: num(usage.cache_creation_input_tokens),
        cacheRead: num(usage.cache_read_input_tokens)
      }
    })
  }
  return { entries, carry: nextCarry }
}
