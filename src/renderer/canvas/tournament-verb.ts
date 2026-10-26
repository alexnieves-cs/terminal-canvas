import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from 'react'
import type { PlaceFn } from './place-new'
import { type Viewport } from './viewport'
import { viewCentre } from './safe-area'
import { addLink, isChatPanel, isWorkPanel, makeChatPanel, nextZ, setLinkLabel, workCardItemId, CHAT_W, type Panel } from '@renderer/panels/panels'
import { backendAvailable } from '@renderer/palette/commands/reasons'
import type { PresetRow } from '@renderer/palette/commands'
import { carryWorkItem, type PersistedWorkItem } from '@shared/work-items'
import { defaultField, judgePrompt, judgeRefusal, parseField, pickRefusal, tournamentFromItem, TOURNAMENT_ENTRANTS_MIN } from '@shared/tournament'
import { sendRefusalSentence } from '@shared/agent-session'
import { carryBackend } from '@shared/agent-backends'

/**
 * M548. THE TOURNAMENT VERB, the renderer's half: every door (the work
 * card's Tournament, the bracket's Stop and Pick, the three palette rows,
 * an agent line, an action node) lands on this one function.
 *
 * The renderer NAMES and PLACES; main runs (M547). Starting one reads the
 * card's task and check (`tournamentFromItem`), mints a panel id per entrant
 * (the renderer owns ids), and hands main the spec; main makes each
 * worktree and chat and starts each run, and answers with where each
 * entrant landed. The chats are then placed in a row beside the card, each
 * linked from it, so the canvas shows the race as it runs.
 *
 * The repository is the one the task's lane is in: a tournament forks from
 * the same main tree the task already works in (main resolves the lane's
 * folder to it), so a task that was never started is refused by name rather
 * than guessed into some other repository.
 *
 * PICK keeps the winner and closes the rest of the field's chats. The
 * winner becomes the task's lane (`panelId`, `worktreeId`), so Review, Open
 * PR and the morning queue all read the winning work through the doors they
 * already have. The losers' worktrees are NOT removed: their branches hold
 * work a person may still want, git refuses a dirty one anyway, and the
 * Worktrees list is where a lane is removed on purpose.
 *
 * M549. JUDGE opens one more chat, read-only (plan mode) at the
 * repository's main tree, and sends it `judgePrompt`: a short comparison of
 * the PASSING entrants. It is advice beside the scorer, never a second
 * scorer — nothing it says moves the winner. COMBINE opens the task's focus
 * view, whose Combine tab already lists every lane of the repository and
 * checks a combined tree before anything lands; a tournament does not grow
 * a second merge path.
 */

export type VerbOutcome = { kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }

export interface TournamentVerbDeps {
  panelsRef: MutableRefObject<Panel[]>
  setPanels: Dispatch<SetStateAction<Panel[]>>
  commitHistory: (next: Panel[]) => void
  workItemsRef: MutableRefObject<PersistedWorkItem[]>
  setWorkItems: Dispatch<SetStateAction<PersistedWorkItem[]>>
  nextIdRef: MutableRefObject<number>
  mergedRef: MutableRefObject<boolean>
  placer: () => PlaceFn
  hostRef: RefObject<HTMLDivElement | null>
  viewportRef: MutableRefObject<Viewport>
  presetRowsRef: MutableRefObject<PresetRow[]>
  closePanel: (id: string) => void
  /** M549. Open a task's focus view, where its Combine tab is. */
  focusItem?: (itemId: string) => void
}

const GAP = 48

export function tournamentVerb(d: TournamentVerbDeps): (op: string, value?: string) => Promise<VerbOutcome> {
  const patchItem = (itemId: string, fields: Partial<PersistedWorkItem>): void => {
    const next = d.workItemsRef.current.map((i) => (i.id === itemId ? carryWorkItem({ ...i, ...fields, updatedAt: Date.now() }) : i))
    d.workItemsRef.current = next
    d.setWorkItems(next)
  }

  const itemOf = (name: string): PersistedWorkItem | undefined => {
    const items = d.workItemsRef.current
    const card = d.panelsRef.current.find((p) => p.rect.id === name && isWorkPanel(p))
    const viaCard = card === undefined ? undefined : workCardItemId(card)
    return items.find((i) => i.id === name || i.key === name || (viaCard !== undefined && i.id === viaCard))
  }

  const start = async (name: string, fieldText: string | undefined): Promise<VerbOutcome> => {
    const door = window.canvas?.tournament
    if (door === undefined) return { kind: 'refused', reason: 'tournaments are not available in this window' }
    if (d.mergedRef.current) return { kind: 'refused', reason: 'the merged view is read-only' }
    const item = itemOf(name)
    if (item === undefined) return { kind: 'refused', reason: `no work item is called ${name} — name one by its id or key, or select its card` }
    const lane = item.panelId === undefined ? undefined : d.panelsRef.current.find((p) => p.rect.id === item.panelId)
    if (lane === undefined || !isChatPanel(lane)) return { kind: 'refused', reason: 'start this task once so it has a lane — the tournament forks from the repository that lane is in' }
    const available = (b: Parameters<typeof backendAvailable>[1]): boolean => backendAvailable(d.presetRowsRef.current, b)
    let field = defaultField(available)
    if (fieldText !== undefined && fieldText.trim() !== '') {
      const parsed = parseField(fieldText, available)
      if (parsed.kind === 'refused') return parsed
      field = parsed.field
    }
    if (field.length < TOURNAMENT_ENTRANTS_MIN) return { kind: 'refused', reason: 'a tournament needs two agents, and claude was not found — install it, or name a field such as codex copilot' }
    const built = tournamentFromItem(item, lane.chat.cwd, field)
    if (built.kind === 'refused') return built
    const entrants = (built.spec.entrants as Record<string, unknown>[]).map((e) => ({ ...e, panelId: `c${d.nextIdRef.current++}` }))
    const r = await door.start({ ...built.spec, itemId: item.id, entrants })
    if (r.kind === 'refused') return r
    // Placed beside the card, one after another, each by the one placement
    // rule (anchored, so a crowded canvas pushes them along rather than under).
    const before = d.panelsRef.current
    const card = before.find((p) => isWorkPanel(p) && workCardItemId(p) === item.id)
    let next: Panel[] = [...before]
    const place = d.placer()
    r.status.entrants.forEach((e, i) => {
      if (e.sessionId === undefined || e.path === undefined) return
      if (next.some((p) => p.rect.id === e.panelId)) return
      const centre = card === undefined
        ? (() => { const c = viewCentre(d.hostRef.current, d.viewportRef.current); return { x: c.x + i * (CHAT_W + GAP), y: c.y } })()
        : { x: card.rect.x + card.rect.w + GAP + CHAT_W / 2 + i * (CHAT_W + GAP), y: card.rect.y + card.rect.h / 2 }
      const made = { ...makeChatPanel(e.panelId, centre, nextZ(next), { cwd: e.path, sessionId: e.sessionId, ...carryBackend({ backend: e.backend }), ...(e.model === undefined ? {} : { agentOptions: { model: e.model } }), dispatch: true }), title: `${e.label} · tournament` }
      next = [...next, card === undefined ? place(next, made) : place(next, made, { anchored: true, parentId: card.rect.id })]
      if (card !== undefined) next = setLinkLabel(addLink(next, card.rect.id, e.panelId), card.rect.id, e.panelId, 'entrant')
    })
    d.panelsRef.current = next
    d.setPanels(() => { d.commitHistory(next); return next })
    const out = r.status.entrants.filter((e) => e.state === 'stuck')
    const racing = r.status.entrants.length - out.length
    return { kind: 'ran', note: `${racing} agents on ${item.key ?? item.title}; \`${r.status.check}\` picks the winner${out.length === 0 ? '' : ` · ${out.map((e) => `${e.label}: ${e.reason ?? 'refused'}`).join('; ')}`}` }
  }

  const pick = async (entrantId: string | undefined): Promise<VerbOutcome> => {
    const door = window.canvas?.tournament
    if (door === undefined) return { kind: 'refused', reason: 'tournaments are not available in this window' }
    if (d.mergedRef.current) return { kind: 'refused', reason: 'the merged view is read-only' }
    const st = await door.status()
    const why = pickRefusal(st, entrantId)
    if (why !== null || st === null || st.score === undefined) return { kind: 'refused', reason: why ?? 'no tournament has run' }
    const id = entrantId ?? (st.score.winner as string)
    const winner = st.entrants.find((e) => e.id === id)
    if (winner === undefined) return { kind: 'refused', reason: `no entrant is called ${id}` }
    const losers = st.entrants.filter((e) => e.id !== id && d.panelsRef.current.some((p) => p.rect.id === e.panelId))
    for (const e of losers) d.closePanel(e.panelId)
    const item = st.itemId === undefined ? undefined : d.workItemsRef.current.find((i) => i.id === st.itemId)
    if (item !== undefined) {
      patchItem(item.id, {
        panelId: winner.panelId,
        ...(winner.worktreeId === undefined ? {} : { worktreeId: winner.worktreeId }),
        note: `picked ${winner.label} from a tournament of ${st.entrants.length} — its check passed`
      })
    }
    const kept = st.entrants.filter((e) => e.id !== id && e.path !== undefined).length
    return { kind: 'ran', note: `${winner.label} is ${item === undefined ? 'kept' : `now the lane of ${item.key ?? item.title}`}; ${losers.length} chat${losers.length === 1 ? '' : 's'} closed${kept === 0 ? '' : ` — ${kept} worktree${kept === 1 ? '' : 's'} kept until you remove ${kept === 1 ? 'it' : 'them'} in Worktrees`}` }
  }

  const judge = async (): Promise<VerbOutcome> => {
    const door = window.canvas?.tournament
    if (door === undefined) return { kind: 'refused', reason: 'tournaments are not available in this window' }
    if (d.mergedRef.current) return { kind: 'refused', reason: 'the merged view is read-only' }
    const st = await door.status()
    const why = judgeRefusal(st)
    if (why !== null || st === null) return { kind: 'refused', reason: why ?? 'no tournament has run' }
    if (!backendAvailable(d.presetRowsRef.current, 'claude')) return { kind: 'refused', reason: 'the judge is a claude chat, and claude was not found — install it, or compare the lanes in Review' }
    const id = `c${d.nextIdRef.current++}`
    const sessionId = crypto.randomUUID()
    const created = await window.canvas.agentSession.create({ id, cwd: st.root, sessionId, agentOptions: { permissionMode: 'plan' } })
    if (created.kind === 'refused') return created
    const before = d.panelsRef.current
    const card = st.itemId === undefined ? undefined : before.find((p) => isWorkPanel(p) && workCardItemId(p) === st.itemId)
    const centre = card === undefined ? viewCentre(d.hostRef.current, d.viewportRef.current) : { x: card.rect.x + card.rect.w / 2, y: card.rect.y + card.rect.h + GAP + 300 }
    const made = { ...makeChatPanel(id, centre, nextZ(before), { cwd: st.root, sessionId, agentOptions: { permissionMode: 'plan' } }), title: `judge · ${st.title}` }
    let next: Panel[] = [...before, d.placer()(before, made, card === undefined ? {} : { anchored: true, parentId: card.rect.id })]
    if (card !== undefined) next = setLinkLabel(addLink(next, card.rect.id, id), card.rect.id, id, 'judge')
    d.panelsRef.current = next
    d.setPanels(() => { d.commitHistory(next); return next })
    const notSent = sendRefusalSentence(await window.canvas.agentSession.send(id, judgePrompt(st), []))
    if (notSent !== null) return { kind: 'refused', reason: `the judge's chat is open, but its message was refused — ${notSent}` }
    return { kind: 'ran', note: `the judge is reading the ${st.score?.ranking.filter((r) => r.eligible).length ?? 0} passing lanes, read-only — the scorer's pick stands until you choose` }
  }

  const combine = async (): Promise<VerbOutcome> => {
    const st = await window.canvas?.tournament?.status()
    if (st == null || st.itemId === undefined) return { kind: 'refused', reason: 'no tournament on a task has run' }
    if (st.score === undefined) return { kind: 'refused', reason: 'the tournament is still running — combine finished work' }
    if (d.focusItem === undefined) return { kind: 'refused', reason: 'the canvas is not ready yet' }
    d.focusItem(st.itemId)
    return { kind: 'ran', note: 'the task is open — its Combine tab lists every lane, the entrants\' among them, and checks the combined tree before anything lands' }
  }

  return async (op, value) => {
    const word = op.trim()
    if (word === 'judge') return judge()
    if (word === 'combine') return combine()
    if (word === 'stop') {
      const door = window.canvas?.tournament
      if (door === undefined) return { kind: 'refused', reason: 'tournaments are not available in this window' }
      return (await door.stop()) ? { kind: 'ran', note: 'the tournament stopped — the field is scored as it stands' } : { kind: 'refused', reason: 'no tournament is running' }
    }
    if (word === 'pick') return pick(value === undefined || value.trim() === '' ? undefined : value.trim())
    if (word === '') return { kind: 'refused', reason: 'name the task: tournament <task> [agent:model …], or tournament stop, pick, judge or combine' }
    return start(word, value)
  }
}
