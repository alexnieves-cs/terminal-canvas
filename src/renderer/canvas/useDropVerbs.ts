import { type RefObject, useCallback, useRef, type DragEvent } from 'react'
import type { PaletteController } from '@renderer/palette/usePalette'
import type { PaletteActions } from '@renderer/palette/commands'
import { type Panel, isChatPanel } from '@renderer/panels/panels'
import { shellQuote } from '@renderer/shell/file-tree-model'
import { insertIntoComposer, attachToComposer } from '@renderer/chat/chat-store'
import { attachmentKind } from '@renderer/chat/composer-model'
import type { SpawnResult } from '@shared/ipc-contract'
import type { AgentOptions } from '@shared/cost'
import type { AgentBackend } from '@shared/agent-session'
import { parseSkillKey } from '@shared/skills'
import { SKILL_CARD_MIME } from '@renderer/shell/skills-pane-model'
import { type Viewport, type WorldRect, screenToWorld, type Point, hitTest } from './viewport'

import type { ChecklistView } from '@shared/checklist'
import type { DeckView } from '@shared/deck'
import type { ImportedNote } from '@shared/imported-note'
import type { SheetView } from '@shared/sheet'
import type { Registry } from '@renderer/session/session-registry'
/**
 * M507 (E4, the Canvas.tsx split). The drop (M59): one function behind the
 * real drop and the __m59Drop door, a path relative to a chat's directory
 * (M75), and the refs later verbs are assigned into. Lifted out of Canvas
 * VERBATIM as one contiguous run and called at exactly the position it
 * occupied, with one destructured Deps object so every dependency array names
 * the same values.
 */
export interface UseDropVerbsDeps {
  registry: Registry
  hitOrderRef: RefObject<WorldRect[]>
  navGridIsOpenRef: RefObject<() => boolean>
  openFilePanel: (path: string, centre: Point, opts?: { prose?: true; checklist?: ChecklistView; imported?: ImportedNote; sheet?: SheetView; deck?: DeckView; exact?: true; }) => void
  palette: PaletteController
  paletteActionsRef: RefObject<PaletteActions | null>
  panelsRef: RefObject<Panel[]>
  viewportRef: RefObject<Viewport>
}

export function useDropVerbs(deps: UseDropVerbsDeps) {
  const {
    hitOrderRef, navGridIsOpenRef, openFilePanel, palette, paletteActionsRef, panelsRef, viewportRef, registry
  } = deps
  /**
   * M59. ONE function behind the real drop and the __m59Drop hook, so a check
   * through the hook is evidence about the door a user reaches. Three
   * answers, each the audit's: a drop while the palette or the nav grid is
   * open is IGNORED (it used to mint a file panel unseen underneath the
   * overlay); a drop OVER a live terminal panel PASTES the path into it —
   * bracketed, shell-quoted, the same door Jira context and the file tree
   * use, because a file dragged onto an agent's terminal means "give this to
   * the agent"; anywhere else opens a file panel at the drop's own world
   * point, as before.
   */
  // M75. A path relative to a chat's directory, when it is inside it.
  const relativeTo = (cwd: string, path: string): string => {
    const base = cwd.replace(/\/+$/, '')
    return path.startsWith(base + '/') ? path.slice(base.length + 1) : path
  }
  const addImageRef = useRef<((path: string, world?: Point) => Promise<unknown>) | null>(null)
  const importDocxRef = useRef<((path: string, world?: Point) => Promise<unknown>) | null>(null)
  const dropPath = useCallback((path: string, screen: Point): 'ignored' | 'pasted' | 'opened' => {
    if (palette.isOpen() || navGridIsOpenRef.current()) return 'ignored'
    const world = screenToWorld(screen, viewportRef.current)
    const hit = hitTest(hitOrderRef.current, world)
    if (hit !== null) {
      const target = panelsRef.current.find((p) => p.rect.id === hit)
      const session = registry.get(hit)
      if (target !== undefined && target.kind === 'terminal' && session !== undefined && session.spawned) {
        session.handle.paste(shellQuote(path))
        return 'pasted'
      }
      // M75. A drop on a chat panel: an image becomes an attachment on the
      // next message, anything else a `@` reference relative to the panel's
      // directory — the composer's own verbs, never a file panel.
      if (target !== undefined && isChatPanel(target)) {
        if (attachmentKind(path) === 'image') attachToComposer(hit, { kind: 'path', path })
        else insertIntoComposer(hit, `@${relativeTo(target.chat.cwd, path)} `)
        return 'pasted'
      }
    }
    // M186. A PICTURE dropped on nothing becomes a picture. The agent targets
    // above are untouched — a drop on a chat is still an attachment and a drop
    // on a terminal is still a shell-quoted path — because this is the arm for
    // a gesture that landed on the canvas itself, which had no arm at all.
    // Through a REF: `addImageFromPath` is declared with the other media
    // verbs further down, and naming a `const` from a hook's dependency list
    // above its declaration is a TDZ error rather than a style preference
    // (the same reason `openFilePanel`'s own test hook sits in its own effect).
    if (attachmentKind(path) === 'image') {
      void addImageRef.current?.(path, world)
      return 'opened'
    }
    // M250. A WORD DOCUMENT dropped on nothing becomes a note — the canvas
    // door of `import-docx`, through a ref for addImageRef's TDZ reason. A
    // .docx opened as a file panel would be a "binary" arm nobody can use.
    if (/\.docx$/i.test(path)) {
      void importDocxRef.current?.(path, world)
      return 'opened'
    }
    openFilePanel(path, world)
    return 'opened'
  }, [openFilePanel, palette, registry])
  const onDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    // M127. The Skills pane's OWN MIME, read here and nowhere else — M114's
    // rule for the board's drops. A card dropped on the canvas opens the
    // skill's panel at the drop point, through the ONE door
    // `openSkillPanel`; the `skill` panel kind is M128's, so today that door
    // records the request and opens nothing. Checked BEFORE the file arm,
    // because a drag with no files would otherwise fall out of it silently.
    // M59's guard, hoisted ABOVE the skill arm: a drop while the palette or
    // the nav grid owns the keyboard opens NOTHING. The skill arm returned
    // before ever reaching it, so a card dropped under an open overlay minted
    // a panel the user could not see — the same defect the file arm's own
    // comment already records.
    if (palette.isOpen() || navGridIsOpenRef.current()) return
    const skill = event.dataTransfer.getData(SKILL_CARD_MIME)
    if (skill !== '') {
      const parsed = parseSkillKey(skill)
      if (parsed !== null) {
        const box = event.currentTarget.getBoundingClientRect()
        const world = screenToWorld({ x: event.clientX - box.left, y: event.clientY - box.top }, viewportRef.current)
        paletteActionsRef.current?.openSkillPanel(parsed.scope, parsed.name, world)
      }
      return
    }
    // One file. A multi-file drop opening N panels at once is a decision to
    // ask for rather than to acquire as a side effect of a gesture.
    const file = event.dataTransfer.files[0]
    if (file === undefined) return
    // Electron 43 REMOVED File.path from the renderer. Reading `file.path`
    // yields undefined, the mint is skipped, and the drop looks like it did
    // nothing at all — with no error, because undefined is a perfectly
    // ordinary value for a property that does not exist. webUtils.getPathForFile,
    // behind the bridge, is the supported replacement.
    const path = window.canvas.file.pathForFile(file)
    if (!path) return
    const host = event.currentTarget.getBoundingClientRect()
    // The DROP's own screen point, so the panel lands under the cursor at
    // every zoom rather than where the cursor would have been at 1:1.
    dropPath(path, { x: event.clientX - host.left, y: event.clientY - host.top })
    // M137. `palette.isOpen()` is read through a stable ref, so `dropPath` is
    // the one dependency; if the palette ever becomes a value, it joins this list.
  }, [dropPath])

  /**
   * verify:panels' route into the file-panel gesture, the same reason every
   * other window hook in this file exists: main's open dialog is native and a
   * real drop cannot be synthesised, so executeJavaScript has no other way in.
   *
   * It drives openFilePanel — the SAME function the palette row and the drop
   * handler both call — rather than reaching for setPanels itself, so a check
   * that passes through it is evidence about production code rather than about
   * a second mint path that only the suite can reach.
   *
   * Its own effect rather than a member of the __m4a* block above, and that is
   * forced rather than tidy: this effect's dependency list is evaluated during
   * render at the line it sits on, and openFilePanel is a `const` declared
   * further down — naming it up there is a TDZ error, not a style preference.
   */
  // M73. Assigned below, after beginNewChat is declared; read by the test hook.
  const beginNewChatRef = useRef<(opts?: { cwd?: string; title?: string; agentOptions?: AgentOptions; appendSystemPrompt?: string; message?: string; backend?: AgentBackend; teammateId?: string; sandbox?: true; routine?: true }) => Promise<SpawnResult>>(
    async () => ({ kind: 'refused', reason: 'the canvas is not ready' })
  )
  const openAsChatRef = useRef<(id: string) => Promise<{ kind: string; reason?: string }>>(async () => ({ kind: 'refused', reason: 'not ready' }))
  const openInTerminalRef = useRef<(id: string) => { kind: string; reason?: string }>(() => ({ kind: 'refused', reason: 'not ready' }))

  return { addImageRef, beginNewChatRef, dropPath, importDocxRef, onDrop, openAsChatRef, openInTerminalRef }
}
