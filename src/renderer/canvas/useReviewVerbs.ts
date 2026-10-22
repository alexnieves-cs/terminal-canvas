import { type Dispatch, type RefObject, type SetStateAction, useCallback, type DragEvent } from 'react'
import type { PersistedWorkItem } from '@shared/work-items'
import type { ChecklistView } from '@shared/checklist'
import type { DeckView } from '@shared/deck'
import { isSheetPath, type SheetView } from '@shared/sheet'
import type { ImportedNote } from '@shared/imported-note'
import { isWorkPanel, isReviewPanel, isTerminalPanel, makeFilePanel, makeToolboxPanel, isChatPanel, makeReviewPanel, nextZ, reviewCentre, REVIEW_H, REVIEW_MIN, REVIEW_W, TASK_REVIEW_SIZE, type Panel } from '@renderer/panels/panels'
import { WORK_ITEM_GONE } from '@renderer/work/WorkNode'
import { ACROSS_BASELINE, type ReviewSubject } from '@shared/review'
import type { PlaceFn } from './place-new'
import type { Viewport, Point } from './viewport'
import { sizeToView, viewCentre } from './safe-area'
import { railLabel } from '../shell/rail-rows'

import type { Registry } from '@renderer/session/session-registry'
/**
 * M507 (E4, the Canvas.tsx split). The review verbs: a review node minted from
 * the subject's baseline, the task review (M202) that all four doors reach,
 * the review of every worktree (M86), the toolbox doors (M149) and the drag-
 * over guard. Lifted out of Canvas VERBATIM as one contiguous run and called
 * at exactly the position it occupied, just below useNavGrid, with one
 * destructured Deps object so every dependency array names the same values.
 */
export interface UseReviewVerbsDeps {
  registry: Registry
  commitHistory: (next: Panel[]) => void
  hostRef: RefObject<HTMLDivElement | null>
  jumpToAttention: (panelId: string) => void
  nextIdRef: RefObject<number>
  panelsRef: RefObject<Panel[]>
  placer: (opts?: { quiet?: true; lit?: true; exact?: boolean; }) => PlaceFn
  selectOnly: (id: string | null) => void
  setPanels: Dispatch<SetStateAction<Panel[]>>
  taskLaneOf: (itemId: string) => { path: string; root: string; panelId: string; branch: string; } | undefined
  viewportRef: RefObject<Viewport>
  workItemsRef: RefObject<PersistedWorkItem[]>
  worldCentre: () => Point
}

export function useReviewVerbs(deps: UseReviewVerbsDeps) {
  const {
    commitHistory, hostRef, jumpToAttention, nextIdRef, panelsRef, placer, selectOnly, setPanels, taskLaneOf, viewportRef, workItemsRef, worldCentre, registry
  } = deps
  /**
   * A review node is minted from the SUBJECT's stored baseline, asked for
   * once here and then carried inside the node — see ReviewSubject. The
   * label is snapshotted through the same honest chain the rail row walks,
   * because the panel it names may be closed long before the node is.
   */
  const openReview = useCallback((subjectId: string) => {
    const subject = panelsRef.current.find((p) => p.rect.id === subjectId)
    // A review of a review is not a thing, and neither is a review of a file
    // panel: only a terminal panel ever had a session, and only a session ever
    // had a baseline. The id could only reach here from a row that should have
    // been gated.
    // M77: a chat panel has a baseline too (agent:create captures one).
    if (subject === undefined || !(isTerminalPanel(subject) || isChatPanel(subject))) return
    const label = railLabel(subject, isTerminalPanel(subject) ? registry.get(subjectId)?.status : undefined)
    void window.canvas.review.baseline(subjectId).then((baseline) => {
      // Null is reachable despite the row's gate: a panel can be killed
      // between the click and the reply, and main drops its baseline on
      // kill. Minting a node with no baseline would produce a panel that can
      // never answer anything.
      if (baseline === null) return
      // RE-READ, never the captured `subject`: the await is a real gap, and
      // it is not only "the panel got closed" (dispose drops the baseline
      // too, which the null check above already catches). A WORKSPACE
      // SWITCH landing in this gap replaces the whole `panels` array while
      // leaving the subject's session — and therefore its baseline —
      // perfectly intact (demote, not dispose), so `baseline` comes back
      // non-null for a panel that is no longer in THIS canvas. Using the
      // captured `subject.rect` would place the node by a rect that only
      // meant something in the workspace that is no longer on screen, and
      // the node would carry a subjectId nothing here answers to.
      const current = panelsRef.current.find((p) => p.rect.id === subjectId)
      if (current === undefined || !(isTerminalPanel(current) || isChatPanel(current))) return
      // `r`, from the SAME counter `n` comes from. PanelId doubles as a tmux
      // session name, so a review node minting an id a terminal panel in any
      // workspace already owns is M7's invisible collision through a new
      // door — the second panel to go live attaches to the first one's
      // session and the user simply sees one agent through two panels.
      const id = `r${nextIdRef.current++}`
      // M402. Sized to the canvas it opens into (B3), placed by the one rule
      // beside its subject (B4) — never on another review of the same panel —
      // and flown to.
      const size = sizeToView(hostRef.current, { w: REVIEW_W, h: REVIEW_H }, REVIEW_MIN)
      const place = placer({ lit: true })
      setPanels((existing) => {
        const centre = reviewCentre(current.rect, size?.w, size?.h)
        const next = [
          ...existing,
          place(existing, makeReviewPanel(id, centre, nextZ(existing), {
            subjectId,
            repoRoot: baseline.root,
            baselineSha: baseline.sha,
            label
          }, size), { anchored: true, parentId: subjectId })
        ]
        commitHistory(next)
        return next
      })
      selectOnly(id)
    })
  }, [commitHistory, placer])

  /**
   * M202 (D07). THE TASK REVIEW — the one implementation all four doors reach
   * (the card's verb, the palette row, `tc plan review-task` and an action
   * node), the way M197 made every Start work door land on one.
   *
   * It is deliberately NOT `openReviewAcross` with an extra field. That one
   * starts from the SUBJECT PANEL and asks main for its baseline, so it needs
   * the lane's conversation to still be open — and a task whose chat has been
   * closed is exactly the case this milestone exists for: the item keeps its
   * `panelId` and notes `lane closed`, and the work is still sitting in the
   * worktree. This one starts from the WORKTREE RECORD instead, which carries
   * the repository `root` and outlives the panel that made it (a worktree
   * record OUTLIVES its panel — M37's rule), so the review opens on a lane
   * whose agent was dismissed hours ago.
   *
   * Every refusal is BY NAME, because the card's button is always present.
   */
  const reviewTaskLane = useCallback((itemId: string): { kind: 'ran'; note?: string } | { kind: 'refused'; reason: string } => {
    const item = workItemsRef.current.find((i) => i.id === itemId)
    if (item === undefined) return { kind: 'refused', reason: WORK_ITEM_GONE }
    if (item.worktreeId === undefined) return { kind: 'refused', reason: 'no lane yet — start work on this item first' }
    // The SAME records the card's readiness was judged against, read by the
    // handoff hook rather than by the palette's list — which loads only when
    // ⌘K opens, and would refuse this verb on a real lane until it did.
    const record = taskLaneOf(itemId)
    // The worktree was removed outside this app, or its record was pruned.
    // Never fall back to another root: reviewing a different repository under
    // this task's name is the substitution the guide forbids by name.
    if (record === undefined) return { kind: 'refused', reason: 'the worktree this task was started in is not listed any more — start work again to give it a fresh lane' }
    // M315. One review per task. A second press used to stack a second node
    // beside the first, off-screen, and the person saw nothing happen. The
    // existing one is brought into view instead — the press always LANDS.
    // A census node a canvas saved before M315 is REPLACED by the lane's own
    // review below rather than landed on — it cannot show the diff.
    const isLaneReview = (p: Panel): boolean => isReviewPanel(p) && p.subject.workItemId === itemId && p.subject.across !== true
    const already = panelsRef.current.find(isLaneReview)
    if (already !== undefined) { jumpToAttention(already.rect.id); return { kind: 'ran' } }
    const mint = (subject: ReviewSubject): void => {
      if (panelsRef.current.some(isLaneReview)) return
      const census = subject.across === true ? panelsRef.current.find((p) => isReviewPanel(p) && p.subject.workItemId === itemId) : undefined
      if (census !== undefined) { jumpToAttention(census.rect.id); return }
      const id = `r${nextIdRef.current++}`
      // M402 (B3). The review opens at the size of the canvas it opens into,
      // up to TASK_REVIEW_SIZE — a fixed 960 was wider than a 1200px window's
      // canvas, so its controls sat off screen under the minimap.
      const size = sizeToView(hostRef.current, TASK_REVIEW_SIZE, REVIEW_MIN) ?? TASK_REVIEW_SIZE
      // The review opens where the person can SEE it: minted beside the
      // conversation it was otherwise placed off-screen with no camera move,
      // and the press looked like it did nothing. The placer's reveal waits
      // for the panel to be rendered before flying to it at a readable zoom,
      // and lands with the arrival glow the attention jump has (`lit`).
      const place = placer({ lit: true })
      setPanels((current) => {
        const existing = subject.across === true ? current : current.filter((p) => !(isReviewPanel(p) && p.subject.workItemId === itemId))
        const anchorPanel = existing.find((p) => p.rect.id === item.panelId) ?? existing.find((p) => isWorkPanel(p) && p.work.itemId === itemId)
        const made = makeReviewPanel(id, anchorPanel === undefined ? viewCentre(hostRef.current, viewportRef.current) : reviewCentre(anchorPanel.rect, size.w, size.h), nextZ(existing), subject, size)
        const next = [...existing, place(existing, made, anchorPanel === undefined ? undefined : { anchored: true, parentId: anchorPanel.rect.id })]
        commitHistory(next)
        return next
      })
      selectOnly(id)
    }
    const across: ReviewSubject = {
      subjectId: item.panelId ?? itemId,
      repoRoot: record.root,
      // Never sent to git: an across node asks `review:across` with its
      // root alone and each section compares against its own fork.
      baselineSha: ACROSS_BASELINE,
      label: item.title,
      across: true,
      workItemId: itemId
    }
    // M315. THE LANE, not the census. An across node lists every worktree of
    // the repository with no diff, no line comments and a blocked commit —
    // so the review a task's "Review changes" opened could not show what the
    // agent changed, and the comment loop the guide promised had no gutter to
    // start from. The lane's own section carries its fork point; a review of
    // the WORKTREE against that fork is an ordinary `review:at` node, the
    // most-exercised review there is. The census is the fallback only when
    // the fork cannot be read, never a silent substitute for another root.
    void window.canvas.review.across(record.root).then((answer) => {
      const section = answer.kind === 'across' ? answer.sections.find((s) => s.path === record.path || (s.path !== answer.root && s.panelId === record.panelId)) : undefined
      mint(section?.base === undefined
        ? across
        : { subjectId: item.panelId ?? itemId, repoRoot: section.path, baselineSha: section.base, label: item.title, workItemId: itemId })
    }).catch(() => mint(across))
    return { kind: 'ran' }
  }, [commitHistory, taskLaneOf, jumpToAttention, placer])

  /**
   * M86. A review of EVERY worktree of the subject's repository: the same mint
   * as `openReview`, with the subject flagged `across`. The node asks for its
   * root's sections rather than one baseline, so a killed subject changes
   * nothing about what it shows — the whole reason the flag exists.
   */
  const openReviewAcross = useCallback((subjectId: string) => {
    const subject = panelsRef.current.find((p) => p.rect.id === subjectId)
    if (subject === undefined || !(isTerminalPanel(subject) || isChatPanel(subject))) return
    void window.canvas.review.baseline(subjectId).then((baseline) => {
      if (baseline === null) return
      const current = panelsRef.current.find((p) => p.rect.id === subjectId)
      if (current === undefined || !(isTerminalPanel(current) || isChatPanel(current))) return
      const id = `r${nextIdRef.current++}`
      const size = sizeToView(hostRef.current, { w: REVIEW_W, h: REVIEW_H }, REVIEW_MIN)
      const place = placer({ lit: true })
      setPanels((existing) => {
        const next = [
          ...existing,
          place(existing, makeReviewPanel(id, reviewCentre(current.rect, size?.w, size?.h), nextZ(existing), { subjectId, repoRoot: baseline.root, baselineSha: baseline.sha, label: `every worktree of ${baseline.root.split('/').pop() ?? baseline.root}`, across: true }, size), { anchored: true, parentId: subjectId })
        ]
        commitHistory(next)
        return next
      })
      selectOnly(id)
    })
  }, [commitHistory, placer])

  /**
   * Put a file on the canvas, at a world point.
   *
   * Modelled on openReview, and it needs none of that function's await: the
   * path is already in hand, so there is no IPC gap for a workspace switch to
   * land in and nothing to re-read afterwards. The READ is the node's own
   * (FileNode's mount effect), which is what keeps "the renderer is showing
   * this file" and "main is watching it" one statement.
   */
  const openFilePanel = useCallback((path: string, centre: Point, opts?: { prose?: true; checklist?: ChecklistView; imported?: ImportedNote; sheet?: SheetView; deck?: DeckView; exact?: true }) => {
    // M245. A newly opened .csv/.tsv/.xlsx opens as a sheet. Only NEW opens:
    // a persisted file panel without the key stays the text view it was.
    const sheet = opts?.sheet ?? (opts?.prose !== true && opts?.checklist === undefined && opts?.deck === undefined && isSheetPath(path) ? {} : undefined)
    if (path === '') return
    // `f`, off the SAME counter as `n` and `r`. PanelId doubles as a tmux
    // session name and the global-uniqueness rule turns on nothing else being
    // able to mint a colliding one — see nextIdRef's own comment for the two
    // seed sites that keep this counter ahead of every persisted id.
    //
    // Minted OUTSIDE the updater, exactly as openReview mints its `r`: a
    // state updater must be pure, and `nextIdRef.current++` inside one is a
    // side effect StrictMode would run twice, burning an id per spawn.
    const id = `f${nextIdRef.current++}`
    // M402. The one placement rule, as onSpawn and openReview: opening the
    // same file twice at an unmoved camera must not stack the two, and a note
    // made from ⌘K lands where "+ Create" would put it, not on what is there.
    const place = opts?.exact ? null : placer()
    setPanels((existing) => {
      const made = makeFilePanel(id, centre, nextZ(existing), {
          path,
          // Conditional, never `...opts`. A spread writes `prose: undefined`,
          // which `'prose' in source` reads as PRESENT — the absent-stays-
          // absent trap this field's own doc comment records. ONE mint
          // function for both, so a note and an opened file cannot drift
          // apart in id minting, cascading, z-order or selection.
          ...(opts?.prose === true ? { prose: true as const } : {}),
          ...(opts?.checklist === undefined ? {} : { checklist: opts.checklist }),
          ...(sheet === undefined ? {} : { sheet }),
          ...(opts?.imported === undefined ? {} : { imported: opts.imported }),
          ...(opts?.deck === undefined ? {} : { deck: opts.deck })
        })
      const next = [...existing, place === null ? made : place(existing, made)]
      commitHistory(next)
      return next
    })
    // selectOnly, not setSelectedIds: a freshly opened file panel is the
    // whole selection, and this is the one helper that says so. See the
    // selectedIds note — the marquee made selection a SET, so every
    // single-panel selector goes through here.
    selectOnly(id)
  }, [commitHistory, selectOnly, placer])
  // M149 (the Act II critic). A STABLE door for the memo'd toolbox nodes: a
  // fresh arrow per render defeated ToolboxNode's memo for every node.
  const openFileAtCentre = useCallback((path: string) => openFilePanel(path, worldCentre()), [openFilePanel, worldCentre])

  /**
   * Open a toolbox node for one panel's directory.
   *
   * Takes the cwd and a LABEL rather than a panel id, and that is the same
   * decision `openReview` makes for `ReviewSubject`: the node must keep
   * answering after the panel it was opened from is closed, so it snapshots
   * what it needs at mint time and holds no reference to the panel.
   */
  const openToolboxPanel = useCallback((cwd: string, label: string, centre: Point) => {
    if (cwd === '') return
    // `t`, off the SAME counter as `n`, `r`, `f` and `j`. Minted OUTSIDE the
    // updater for openFilePanel's stated reason: a state updater must be pure,
    // and `nextIdRef.current++` inside one is a side effect StrictMode would
    // run twice. See nextIdRef's two seed sites, both of which had to widen
    // their regex to `[nrfjt]` for this prefix — and which were already blind
    // to M19's own `j`.
    const id = `t${nextIdRef.current++}`
    const place = placer()
    setPanels((existing) => {
      const next = [
        ...existing,
        place(existing, makeToolboxPanel(id, centre, nextZ(existing), { cwd, label }))
      ]
      commitHistory(next)
      return next
    })
    selectOnly(id)
  }, [commitHistory, selectOnly])

  /**
   * The drop door, on the .canvas host.
   *
   * preventDefault on dragover is REQUIRED, not defensive: without it the
   * browser's default action for a dropped file is to NAVIGATE to it, which
   * destroys the app's own page — every panel, every camera, the whole
   * renderer — and looks like a crash rather than like a missing handler.
   *
   * Known, currently-unaddressed edge case: these handlers are on `.canvas`,
   * and both the palette and the nav grid mount as children of it too — so a
   * drop while either overlay is open mints a file panel underneath it,
   * unseen until the overlay closes. Worth a note, not a fix.
   */
  const onDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
  }, [])

  return { onDragOver, openFileAtCentre, openFilePanel, openReview, openReviewAcross, openToolboxPanel, reviewTaskLane }
}
