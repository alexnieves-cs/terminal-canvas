import type { MemoryEntryRow } from '@shared/ipc-contract'

/**
 * M83. What a chat's FIRST message carries from the repository's memory:
 * bounded twice (entries and bytes) and STATED in the panel before it is
 * sent, because nothing may go to a model provider that the user has not
 * been told about.
 */
export const MEMORY_CONTEXT_MAX = 20
export const MEMORY_CONTEXT_BYTES = 4 * 1024

/**
 * The block a first message carries, with the COUNT it actually carries.
 *
 * The count is returned rather than taken from the entry list because the
 * two bounds can disagree: twenty long memories are cut by the byte bound to
 * five, and a panel that said "20 memories" while sending five would be
 * making a promise about a message it did not send (M83's verifier). The
 * bytes are measured with `TextEncoder`, not `String.length`, so a memory
 * written in any script is measured in the units the bound is named in.
 */
export function memoryContext(entries: readonly MemoryEntryRow[]): { text: string; count: number } {
  const encoder = new TextEncoder()
  const lines: string[] = []
  let bytes = 0
  for (const entry of entries.slice(0, MEMORY_CONTEXT_MAX)) {
    const line = `- ${entry.kind}: ${entry.text}`
    bytes += encoder.encode(line).length + 1
    if (bytes > MEMORY_CONTEXT_BYTES) break
    lines.push(line)
  }
  if (lines.length === 0) return { text: '', count: 0 }
  return {
    text: `[what this repository has already decided, tried and failed — ${lines.length} memories]\n${lines.join('\n')}\n\n`,
    count: lines.length
  }
}
