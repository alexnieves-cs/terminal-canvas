import { dialog } from 'electron'
import { findOrphans, orphanPrompt } from '../orphans'
import { staleBaselineIds } from '../baseline-capture'
import type { OrphanRow } from '../../shared/orphans'
import type { Stores } from './stores'
import type { MainState } from './context'

/**
 * M55. A tmux session with no panel to reach it holds a process and a shell
 * the user cannot see, close, or type into — possible if a crash landed
 * between a spawn and the store's coalesced save. Until M55 these were killed
 * outright ("adopting would mint geometry the user never chose"); placement
 * exists now, so the user is ASKED, once, by name. Never adopted silently: no
 * dialog, no restore.
 *
 * The known set is EVERY workspace's ids. It used to be the active
 * workspace's alone, which killed a session kept across quit (M38) for a
 * panel in a hidden workspace at the next launch — verify:tmux orphan.1.
 *
 * Returns the rows the user chose to restore, for the renderer to hear about
 * once it can hold panels. Empty means either no orphans or a Discard.
 */
export async function sweepOrphans(state: MainState, stores: Stores): Promise<OrphanRow[]> {
  const { layoutStore, ptyManager } = stores
  let recovered: OrphanRow[] = []

  const known = new Set(layoutStore.workspaces().flatMap((w) => w.panelIds))
  const orphans = findOrphans(ptyManager.list(), known)
  let restore = false
  if (orphans.length > 0) {
    const prompt = orphanPrompt(orphans)
    // App-modal: the window does not exist yet, and that is fine. Restore
    // is the default button because the cost of a wrong Discard is an
    // agent's work, and the cost of a wrong Restore is a panel to close.
    const { response } = await dialog.showMessageBox({
      type: 'question',
      message: prompt.message,
      detail: prompt.detail,
      buttons: prompt.buttons,
      defaultId: 0,
      cancelId: 1
    })
    restore = response === 0
  }
  // Collected as the loop runs rather than from a second list() call: a
  // session KILLED here has not survived, and treating it as though it
  // had would leave its baseline in place for a panel that is about to
  // spawn a brand-new agent.
  const surviving: string[] = []
  // M77. A chat's baseline survives a relaunch: the conversation RESUMES
  // (`--resume`) rather than starting over, so its starting point is still
  // the right thing to diff against. Every saved chat panel counts.
  for (const w of layoutStore.mergedWorkspaces()) for (const p of w.panels) if (p.kind === 'chat') surviving.push(p.id)
  const orphanIds = new Set(orphans.map((o) => o.panelId))
  for (const session of ptyManager.list()) {
    if (known.has(session.panelId)) { surviving.push(session.panelId); continue }
    if (orphanIds.has(session.panelId) && restore) { surviving.push(session.panelId); continue }
    console.warn(
      `[tmux] orphan session ${session.panelId} (pid ${session.pid}) has no saved ` +
        'panel; discarding it. A session with no panel cannot be reached, closed, or typed into.'
    )
    state.backend.destroy(session.panelId)
  }
  if (restore) recovered = orphans

  // A baseline describes ONE session's starting point, and quitting the app
  // kills every session by default (before-quit's end arm runs shutdown(), i.e.
  // kill-server; the M38 keep arm is exactly the case where sessions DO survive
  // and their baselines are kept, which staleBaselineIds handles by asking), so
  // a baseline that outlived its session would have the next launch's fresh
  // agent diffed against a snapshot from a previous day — blaming it for
  // every edit the user made by hand in between. Dropped HERE, at startup,
  // and nowhere else: PtyManager's in-memory capturedBaselineIds is the
  // guard that covers Cmd+R within one run, where the sessions really do
  // survive and recapture really would be wrong, and this main process's
  // copy of that set is empty by construction. See staleBaselineIds' own
  // comment (verify:review 37/37b).
  for (const id of staleBaselineIds(layoutStore.baselineIds(), surviving)) {
    console.log(
      `[review] dropping the stored baseline for panel ${id}: its session did not ` +
        `survive, so its next spawn is a new session and needs a new snapshot.`
    )
    layoutStore.dropBaseline(id)
  }

  return recovered
}
