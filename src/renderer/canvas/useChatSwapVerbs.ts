import { type Dispatch, type RefObject, type SetStateAction, useCallback } from 'react'
import type { PaletteController } from '@renderer/palette/usePalette'
import type { ChecklistView } from '@shared/checklist'
import type { DeckView } from '@shared/deck'
import type { ImportedNote } from '@shared/imported-note'
import type { InputMode } from '@renderer/palette/Palette'
import { type Panel, makeWatcherPanel, isWatcherPanel, isTerminalPanel, makeChatPanel, isChatPanel, makePanel, nextZ, removePanel } from '@renderer/panels/panels'
import type { SheetView } from '@shared/sheet'
import { REASON_CHAT_BUSY, REASON_CHAT_EMPTY } from '@renderer/palette/commands'
import { getChat } from '@renderer/chat/chat-store'
import { disposeChat } from '@renderer/chat/useChatSessions'
import { disposeWatcher } from '@renderer/watcher/useWatchers'
import { BACKENDS, backendOf } from '@shared/agent-backends'
import { disposeRelayTerminal } from '@renderer/relay/RelayTerminal'
import { clearBrowser } from '@renderer/browser/browser-store'
import { parseTriggerWords } from '@renderer/watcher/trigger-input'
import type { PlaceFn } from './place-new'
import type { Point, Viewport } from './viewport'
import { retainSelection } from './canvas-constants'
import { viewCentre } from './safe-area'
import { railLabel } from '../shell/rail-rows'

/**
M504. Terminal ↔ chat (M74), the front-end switch, watcher arming and asking (M84), and the vault note doors, lifted out of Canvas.tsx at exactly this position. No behaviour change.
 */
export interface UseChatSwapVerbsDeps {
  commitHistory: (next: Panel[]) => void
  hostRef: RefObject<HTMLDivElement | null>
  mergedRef: RefObject<boolean>
  nextIdRef: RefObject<number>
  noteRootRef: RefObject<string | null>
  onClosePanel: (id: string) => void
  openAsChatRef: RefObject<(id: string) => Promise<{ kind: string; reason?: string | undefined; }>>
  openFilePanel: (path: string, centre: Point, opts?: { prose?: true; checklist?: ChecklistView; imported?: ImportedNote; sheet?: SheetView; deck?: DeckView; exact?: true; }) => void
  openInTerminalRef: RefObject<(id: string) => { kind: string; reason?: string | undefined; }>
  palette: PaletteController
  panelsRef: RefObject<Panel[]>
  placer: (opts?: { quiet?: true; lit?: true; exact?: boolean; }) => PlaceFn
  selectOnly: (id: string | null) => void
  selectedIdRef: RefObject<string | null>
  setEnteringPanelIds: Dispatch<SetStateAction<ReadonlySet<string>>>
  setFocusedId: Dispatch<SetStateAction<string | null>>
  setInputMode: Dispatch<SetStateAction<InputMode | null>>
  setPanels: Dispatch<SetStateAction<Panel[]>>
  setPendingFocusId: Dispatch<SetStateAction<string | null>>
  setSelectedIds: Dispatch<SetStateAction<ReadonlySet<string>>>
  vaultRootRef: RefObject<string>
  viewportRef: RefObject<Viewport>
  worldCentre: () => Point
}

export function useChatSwapVerbs(deps: UseChatSwapVerbsDeps) {
  const {
    commitHistory, hostRef, mergedRef, nextIdRef, noteRootRef, onClosePanel, openAsChatRef, openFilePanel, openInTerminalRef, palette, panelsRef, placer, selectOnly, selectedIdRef, setEnteringPanelIds, setFocusedId, setInputMode, setPanels, setPendingFocusId, setSelectedIds, vaultRootRef, viewportRef, worldCentre
  } = deps
  // M74. Terminal → chat. main is asked FIRST (`agent:import` validates the
  // pin, the live process and the CLI's file, and writes the turns under the
  // NEW id); a refusal is shown by name in the palette's line and nothing
  // is minted. Then the terminal leaves through the ordinary close path (its
  // process is not live — the precondition) and the chat takes its rect.
  const openAsChat = useCallback(async (id: string): Promise<{ kind: string; reason?: string }> => {
    if (mergedRef.current) return { kind: 'refused', reason: 'the merged view is read-only' }
    const panel = panelsRef.current.find((p) => p.rect.id === id)
    if (!panel || !isTerminalPanel(panel)) return { kind: 'refused', reason: 'only a terminal panel can open as chat' }
    const newId = `c${nextIdRef.current++}`
    const result = await window.canvas.agentSession.importSession({ fromPanelId: id, toPanelId: newId })
    if (result.kind === 'refused') {
      setInputMode({ kind: 'text', label: result.reason, initial: '', feedback: true, submit: () => setInputMode(null) })
      palette.openPalette()
      return result
    }
    const rect = panel.rect
    const knobs = panel.spec.agentOptions
    const title = panel.title
    onClosePanel(id)
    setPanels((current) => {
      const chat = makeChatPanel(newId, { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 }, nextZ(current),
        { cwd: panel.spec.cwd, sessionId: result.sessionId, ...(knobs === undefined ? {} : { agentOptions: knobs }) }, { w: rect.w, h: rect.h })
      const next = [...current, title === undefined ? chat : { ...chat, title }]
      commitHistory(next)
      return next
    })
    selectOnly(newId)
    return { kind: 'opened' }
  }, [commitHistory, onClosePanel, selectOnly, palette])
  // M74. Chat → terminal. The chat leaves through its own close path (the
  // session disposed with its file — the CLI's transcript is the durable
  // one) and a terminal spawns at its rect with `claude --resume <id>`, the
  // chat's knobs and title, focused so it is live before the hand leaves
  // the keyboard. main adopts the resumed id as the terminal's pin.
  const openInTerminal = useCallback((id: string): { kind: string; reason?: string } => {
    if (mergedRef.current) return { kind: 'refused', reason: 'the merged view is read-only' }
    const panel = panelsRef.current.find((p) => p.rect.id === id)
    if (!panel || !isChatPanel(panel)) return { kind: 'refused', reason: 'only a chat panel can open in a terminal' }
    // M90/M99. The terminal door is `claude --resume`; a backend without one refuses by its row's reason.
    const row = BACKENDS[backendOf(panel.chat)]
    if (!row.terminalDoor) return { kind: 'refused', reason: row.reasons.noTerminal }
    // The precondition IN the verb, not only on its three doors (M74's
    // verifier): a turn in flight or a permission waiting is one front-end
    // still working, and an empty chat has nothing to resume.
    const mirror = getChat(id)
    if (mirror.snapshot !== null && (mirror.snapshot.status === 'streaming' || mirror.snapshot.pending.length > 0)) return { kind: 'refused', reason: REASON_CHAT_BUSY }
    if (!mirror.turns.some((t) => t.role === 'user' && t.blocks.some((b) => b.type === 'text'))) return { kind: 'refused', reason: REASON_CHAT_EMPTY }
    const rect = panel.rect
    const tid = `n${nextIdRef.current++}`
    const knobs = panel.chat.agentOptions
    const title = panel.title
    // The session goes, the FILE stays (drop: false): one Cmd+Z past the
    // move restores the chat panel, and it must render its turns. The
    // ordinary close path would drop the file, so this is the one removal
    // that does not go through it.
    disposeChat(id, false); disposeWatcher(id); clearBrowser(id); disposeRelayTerminal(id)
    setPanels((current) => { const next = removePanel(current, id); commitHistory(next); return next })
    setSelectedIds((current) => retainSelection(current, (sid) => sid !== id))
    setFocusedId((current) => (current === id ? null : current))
    setPendingFocusId(tid)
    setEnteringPanelIds((current) => new Set(current).add(tid))
    setPanels((current) => {
      const term = makePanel(tid, { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 }, nextZ(current),
        { panelId: tid, cwd: panel.chat.cwd, command: 'claude', args: ['--resume', panel.chat.sessionId], agent: 'claude-code', ...(knobs === undefined ? {} : { agentOptions: knobs }) },
        { w: rect.w, h: rect.h })
      const next = [...current, title === undefined ? term : { ...term, title }]
      commitHistory(next)
      return next
    })
    selectOnly(tid)
    return { kind: 'opened', reason: tid }
  }, [commitHistory, onClosePanel, selectOnly])
  openAsChatRef.current = openAsChat
  openInTerminalRef.current = openInTerminal
  // A void wrapper with a stable identity for the memoised terminal panel.
  const openAsChatVoid = useCallback((id: string) => { void openAsChat(id) }, [openAsChat])
  const onFrontEnd = useCallback((id: string) => {
    const panel = panelsRef.current.find((p) => p.rect.id === id)
    if (panel && isChatPanel(panel)) openInTerminal(id)
    else void openAsChat(id)
  }, [openAsChat, openInTerminal])
  /**
   * M84. Asking for a watcher: the command, then when to run it.
   *
   * Two text lines rather than a form, because the palette's line is the one
   * input this app already has for "type a thing" and a modal form would be
   * a second vocabulary for the same act. The trigger line takes the words
   * the node itself shows (`on a change in <path>`, `every 10m`, `when the
   * branch moves`), so what a user types is what they will read back.
   */
  /**
   * M84. Arm or disarm a watcher — a PERSISTED fact on the panel record, so a
   * paused watcher is still paused after a relaunch, and one history entry so
   * ⌘Z puts it back. `armed: true` is written as ABSENCE: the field's absence
   * already means armed, and writing it would make every file differ from the
   * one before it for no new fact.
   */
  const setWatcherArmed = useCallback((id: string, armed: boolean) => {
    setPanels((current) => {
      const next = current.map((p) => {
        if (p.rect.id !== id || !isWatcherPanel(p)) return p
        const { armed: _was, ...rest } = p.watch
        return { ...p, watch: armed ? rest : { ...rest, armed: false as const } }
      })
      commitHistory(next)
      return next
    })
  }, [commitHistory])

  /**
   * M85. Opening a note by its path INSIDE the vault, and offering to create
   * one a link points at but nothing answers.
   *
   * Both go through M27's own verbs — `openFilePanel(..., { prose: true })`
   * and `file:create` — because a note is a file panel in prose mode and a
   * vault is many of them. A second creation path would be a second set of
   * rules about what a note is.
   */
  const openVaultNote = useCallback((relative: string) => {
    const root = vaultRootRef.current
    if (root === '') return
    openFilePanel(`${root.replace(/\/+$/, '')}/${relative}`, worldCentre(), { prose: true })
  }, [openFilePanel, worldCentre])

  const beginCreateVaultNote = useCallback((name: string) => {
    const root = vaultRootRef.current
    if (root === '') return
    // The name as typed in the link, with `.md` — a link that said
    // `[[api notes]]` must create `api notes.md` and resolve NEXT time, which
    // it only does if the file is named what the link said.
    const file = /\.md$/i.test(name) ? name : `${name}.md`
    // Every refusal RE-PROMPTS with its reason, M27's own shape: a `[[../x]]`
    // that main refuses (outside the root), a name that already exists, a
    // write that failed — each closed the line silently and left the link
    // dashed with nothing said (M85's verifier). The catch is mandatory for
    // FileNode's reason: an unhandled rejection leaves the line open forever.
    const prompt = (initial: string, label: string, feedback?: true): void => {
      setInputMode({
        kind: 'text',
        label,
        initial,
        ...(feedback === undefined ? {} : { feedback }),
        submit: (typed) => {
          const named = typed.trim()
          if (named === '') { setInputMode(null); return }
          void window.canvas.file.create({ root, name: named, seed: `# ${named.replace(/\.md$/i, '').split('/').pop() ?? named}\n\n` })
            .then((res) => {
              if (res.kind === 'created') { setInputMode(null); openFilePanel(res.path, worldCentre(), { prose: true }); return }
              const why = res.kind === 'exists' ? 'there is already a note with that name' : res.detail
              prompt(named, `Couldn\u2019t create that note \u2014 ${why}`, true)
            })
            .catch((error: unknown) => { prompt(named, `Couldn\u2019t create that note \u2014 ${String(error)}`, true) })
        }
      })
      palette.openPalette()
    }
    prompt(file, `Create ${file}?`)
  }, [openFilePanel, palette, worldCentre])

  const beginWatcher = useCallback(() => {
    const root = noteRootRef.current
    if (root === null) return
    // The selected panel, when it is one a watcher can wait on — which is
    // what makes `after this passes` a thing a person can type.
    const selected = selectedIdRef.current === null ? undefined : panelsRef.current.find((p) => p.rect.id === selectedIdRef.current)
    const sourceRef = selected !== undefined && (isTerminalPanel(selected) || isChatPanel(selected))
      ? { id: selected.rect.id, label: railLabel(selected, undefined) }
      : undefined
    const askTrigger = (command: string, initial: string, label: string, feedback?: true): void => {
      setInputMode({
        kind: 'text',
        label,
        initial,
        ...(feedback === undefined ? {} : { feedback }),
        submit: (answer) => {
          const text = answer.trim()
          if (text === '') { setInputMode(null); return }
          const trigger = parseTriggerWords(text, root, sourceRef)
          if (trigger === null) {
            askTrigger(command, text, sourceRef === undefined ? 'Try: a path, `every 10m`, or `branch`' : `Try: a path, \`every 10m\`, \`branch\`, or \`after this passes\``, true)
            return
          }
          setInputMode(null)
          const parts = command.trim().split(/\s+/)
          const centre = viewCentre(hostRef.current, viewportRef.current)
          const watcherId = `w${nextIdRef.current++}`
          const place = placer()
          setPanels((current) => {
            const next = [...current, place(current, makeWatcherPanel(watcherId, centre, nextZ(current), {
              cwd: root, command: parts[0] as string, args: parts.slice(1), trigger
            }))]
            commitHistory(next)
            return next
          })
          selectOnly(watcherId)
        }
      })
    }
    setInputMode({
      kind: 'text',
      label: 'What should it run?',
      initial: 'npm test',
      submit: (command) => {
        if (command.trim() === '') { setInputMode(null); return }
        askTrigger(command, 'src', sourceRef === undefined ? 'When? a path to watch, `every 10m`, or `branch`' : `When? a path, \`every 10m\`, \`branch\`, or \`after this passes\` (${sourceRef.label})`)
      }
    })
  }, [commitHistory, selectOnly])

  return { beginCreateVaultNote, beginWatcher, onFrontEnd, openAsChat, openAsChatVoid, openInTerminal, openVaultNote, setWatcherArmed }
}
