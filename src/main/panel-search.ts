import { redactSecrets } from '../shared/redact'
import type { TranscriptTurn } from '../shared/transcript'
import type { PanelSearchHit, PanelSearchResult } from '../shared/ipc-contract'

/**
 * M122. FIND IN PANELS — one query over the two durable logs this app keeps:
 * the scrollback log (M39, one append-only file per terminal panel) and the
 * chat transcript log (M73, one JSONL per chat panel). Both are files, which
 * is the whole point: a DORMANT panel answers exactly like a live one, and a
 * search that read only the live buffers would answer for whichever panels
 * happened to be awake — a silent, camera-dependent hole.
 *
 * Three rules, each a silent failure without it:
 *   - Every line that leaves is REDACTED (`redactSecrets`, the outward gate's
 *     fourth named caller — `verify:verbs gate.2`), and the result carries
 *     the count: a palette row is pane content read by another reader, and a
 *     token that scrolled past in a terminal would otherwise sit in the
 *     palette's list, matchable by its own first characters.
 *   - The cap is STATED on the result (`capped`, `cap`), never silent: a list
 *     that stops at fifty with no word reads as "fifty matches", which is a
 *     different fact from "the first fifty".
 *   - The readers are injected, so `verify:file psearch.1` drives the whole
 *     function over two real logs under plain node and the invoke in main is
 *     a thin binding over the active workspace's panels.
 */

export type { PanelSearchHit, PanelSearchResult } from '../shared/ipc-contract'

export interface PanelSearchPanel {
  id: string
  kind: string
  title?: string
}

export interface PanelSearchDeps {
  /** The scrollback log's own search over the ids given, newest first, already capped by it. */
  scrollback: (panelIds: string[], query: string, caps: { maxHits: number; maxPerPanel: number }) => Promise<{ panelId: string; line: string; lineIndex: number }[]>
  /** A chat's stored turns; [] for a panel with no file. */
  transcript: (panelId: string) => TranscriptTurn[]
}

const textOf = (turn: TranscriptTurn): string =>
  turn.blocks.filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text').map((b) => b.text).join('\n')

export async function searchPanels(
  query: string,
  panels: readonly PanelSearchPanel[],
  deps: PanelSearchDeps,
  caps: { maxHits: number; maxPerPanel: number }
): Promise<PanelSearchResult> {
  const q = query.trim().toLowerCase()
  const empty: PanelSearchResult = { hits: [], capped: false, cap: caps.maxHits, redacted: 0 }
  if (q === '') return empty
  const hits: PanelSearchHit[] = []
  let redacted = 0
  const push = (hit: PanelSearchHit): void => {
    const r = redactSecrets(hit.line)
    redacted += r.count
    hits.push({ ...hit, line: r.text })
  }
  // Terminals first, through the log's own newest-first search, then the
  // chats: the order a user scanning "which panel printed that" expects.
  const terminalIds = panels.filter((p) => p.kind !== 'chat').map((p) => p.id)
  let raw: { panelId: string; line: string; lineIndex: number }[] = []
  try {
    raw = terminalIds.length === 0 ? [] : await deps.scrollback(terminalIds, q, caps)
  } catch {
    raw = []
  }
  for (const hit of raw) {
    if (hits.length >= caps.maxHits) break
    push({ panelId: hit.panelId, kind: 'scrollback', line: hit.line, lineIndex: hit.lineIndex })
  }
  let capped = hits.length >= caps.maxHits && raw.length > hits.length
  for (const panel of panels) {
    if (panel.kind !== 'chat') continue
    let turns: TranscriptTurn[] = []
    try { turns = deps.transcript(panel.id) } catch { turns = [] }
    let perPanel = 0
    for (let i = turns.length - 1; i >= 0; i -= 1) {
      const turn = turns[i]
      if (turn === undefined) continue
      for (const line of textOf(turn).split('\n')) {
        if (line.trim() === '' || !line.toLowerCase().includes(q)) continue
        if (hits.length >= caps.maxHits || perPanel >= caps.maxPerPanel) { capped = true; break }
        push({ panelId: panel.id, kind: 'transcript', line: line.trim(), turnIndex: i })
        perPanel += 1
      }
      if (capped) break
    }
    if (capped) break
  }
  return { hits, capped, cap: caps.maxHits, redacted }
}
