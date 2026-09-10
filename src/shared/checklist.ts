/** A task view edits recognised lines, never reserialises somebody else's Markdown. */
export interface ChecklistItem { line: number; text: string; checked: boolean }
export type ChecklistDocument = { kind: 'document'; lines: string[]; items: ChecklistItem[]; malformed: number[] }
export type ChecklistParse = { kind: 'absent' } | { kind: 'malformed'; reason: string } | ChecklistDocument
export type ChecklistEdit = { type: 'add'; text: string } | { type: 'toggle' | 'delete'; line: number } | { type: 'move'; line: number; to: number }
export type ChecklistEditResult = { kind: 'edited'; content: string } | { kind: 'refused'; reason: string }
export interface ChecklistRun { panelId: string; sentAt: number; turn: number; text: string }
export interface ChecklistView {
  /** Last document the person accepted. Absent on import until reviewed. */
  accepted?: string
  /** Line numbers refer to accepted, and are remapped by an item edit. */
  runs?: Record<string, ChecklistRun>
}

export function parseChecklistView(raw: unknown): { kind: 'absent' } | { kind: 'malformed'; reason: string } | { kind: 'view'; view: ChecklistView } {
  if (raw === undefined) return { kind: 'absent' }
  const bad = { kind: 'malformed' as const, reason: 'checklist view must contain bounded accepted text and valid run references' }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return bad
  const value = raw as Record<string, unknown>, view: ChecklistView = {}
  if ('accepted' in value) {
    if (typeof value.accepted !== 'string' || value.accepted.length > 2 * 1024 * 1024 || value.accepted.includes('\0')) return bad
    view.accepted = value.accepted
  }
  if ('runs' in value) {
    if (!value.runs || typeof value.runs !== 'object' || Array.isArray(value.runs)) return bad
    const runs: Record<string, ChecklistRun> = {}
    for (const [key, rawRun] of Object.entries(value.runs)) {
      if (!/^\d+$/.test(key) || !rawRun || typeof rawRun !== 'object') return bad
      const r = rawRun as Record<string, unknown>
      if (typeof r.panelId !== 'string' || !r.panelId || typeof r.text !== 'string' || r.text.length > 10000 || typeof r.sentAt !== 'number' || !Number.isFinite(r.sentAt) || typeof r.turn !== 'number' || !Number.isSafeInteger(r.turn) || r.turn < 0) return bad
      runs[key] = { panelId: r.panelId, text: r.text, sentAt: r.sentAt, turn: r.turn }
    }
    if (Object.keys(runs).length > 10000) return bad
    view.runs = runs
  }
  return { kind: 'view', view }
}

export function parseChecklist(value: unknown): ChecklistParse {
  if (value === undefined) return { kind: 'absent' }
  if (typeof value !== 'string' || value.includes('\0')) return { kind: 'malformed', reason: 'a checklist must be Markdown text without NUL bytes' }
  const lines = value.match(/[^\n]*\n|[^\n]+$/g) ?? []
  const items: ChecklistItem[] = [], malformed: number[] = []
  let fence: { char: string; length: number } | undefined
  lines.forEach((line, index) => {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)
    if (marker) {
      if (!fence) fence = { char: marker[1][0], length: marker[1].length }
      else if (marker[1][0] === fence.char && marker[1].length >= fence.length && /^\s*$/.test(line.slice(marker[0].length))) fence = undefined
      return
    }
    if (fence || /^(?: {4}|\t)/.test(line)) return
    const match = /^( {0,3})- \[([ xX])\](?:[ \t]+([^\r\n]*))?(?:\r?\n)?$/.exec(line)
    if (match) items.push({ line: index, checked: match[2].toLowerCase() === 'x', text: match[3] ?? '' })
    else if (/^ {0,3}-\s+\[/.test(line)) malformed.push(index)
  })
  return { kind: 'document', lines, items, malformed }
}

export function checklistText(doc: ChecklistDocument): string { return doc.lines.join('') }
export function checklistSummary(content: string): string {
  const parsed = parseChecklist(content)
  return parsed.kind !== 'document' || parsed.items.length === 0 ? '' : `${parsed.items.filter((i) => i.checked).length} of ${parsed.items.length}`
}

export function editChecklist(content: string, edit: ChecklistEdit): ChecklistEditResult {
  const doc = parseChecklist(content)
  if (doc.kind !== 'document') return { kind: 'refused', reason: 'this is not an editable Markdown document' }
  const lines = [...doc.lines]
  if (edit.type === 'add') {
    const text = edit.text.trim()
    if (!text || /[\r\n\0]/.test(text)) return { kind: 'refused', reason: 'write one nonempty task on one line' }
    const eol = content.includes('\r\n') ? '\r\n' : '\n'
    // Do not append inside an unclosed fence: insert before the document's first fence.
    const at = lines.findIndex((line) => /^ {0,3}(`{3,}|~{3,})/.test(line))
    if (at >= 0) lines.splice(at, 0, `- [ ] ${text}${eol}`)
    else return { kind: 'edited', content: content + (content && !content.endsWith('\n') ? eol : '') + `- [ ] ${text}${eol}` }
  } else {
    if (!doc.items.some((item) => item.line === edit.line)) return { kind: 'refused', reason: 'that task is no longer in this document' }
    if (edit.type === 'toggle') lines[edit.line] = lines[edit.line].replace(/\[([ xX])\]/, (_, checked: string) => checked === ' ' ? '[x]' : '[ ]')
    if (edit.type === 'delete') lines.splice(edit.line, 1)
    if (edit.type === 'move') {
      const from = doc.items.findIndex((i) => i.line === edit.line), to = doc.items.findIndex((i) => i.line === edit.to)
      if (to < 0) return { kind: 'refused', reason: 'choose another task as the destination' }
      // Move task bodies across task slots; headings and other prose keep their exact positions.
      const bodies = doc.items.map((i) => lines[i.line].replace(/\r?\n$/, ''))
      const [body] = bodies.splice(from, 1); bodies.splice(to, 0, body)
      doc.items.forEach((item, n) => { lines[item.line] = bodies[n] + (lines[item.line].match(/\r?\n$/)?.[0] ?? '') })
    }
  }
  return { kind: 'edited', content: lines.join('') }
}

/** An edited/reordered line must not inherit a different task's run. Duplicates are ambiguous. */
export function remapChecklistRuns(before: string, after: string, runs?: Record<string, ChecklistRun>): Record<string, ChecklistRun> | undefined {
  if (!runs) return undefined
  const a = parseChecklist(before), b = parseChecklist(after)
  if (a.kind !== 'document' || b.kind !== 'document') return undefined
  const out: Record<string, ChecklistRun> = {}
  for (const [line, run] of Object.entries(runs)) {
    const text = a.items.find((i) => String(i.line) === line)?.text
    const matches = b.items.filter((i) => i.text === text)
    if (matches.length === 1 && a.items.filter((i) => i.text === text).length === 1) out[matches[0].line] = run
  }
  return Object.keys(out).length ? out : undefined
}
