import type { Command } from '../palette-model'
import { BACKENDS, BACKEND_IDS } from '@shared/agent-backends'
import type { PaletteContext } from './context'
import { REASON_NOT_ON_PATH, REASON_UNREAD_PRESET, REASON_MERGED_READ_ONLY, REASON_NO_NOTE_ROOT, REASON_NO_CLAUDE, REASON_NO_SELECTION_TEMPLATE, REASON_NO_WATCH_ROOT, REASON_NO_REPO_MEMORY, REASON_NO_TEMPLATES, claudeAvailable, backendAvailable } from './reasons'
import { withReason, hiddenAtRestIf } from './with-reason'
import { creationCommands } from './creation-rows'
/** The dropped "new panel" phrasing, kept findable — INSERT_TERMS's reason in commands.ts. */
const SPAWN_TERMS = 'new panel from preset spawn'

/**
 * M620. Split out of palette/commands.ts, in the order buildCommands pushes
 * them: New panel: presets, templates, chats and the other create doors. Each section is its own function over the same context, so a
 * new row goes beside its neighbours instead of into one 2.7k-line function.
 */
export function newPanelRows(ctx: PaletteContext): Command[] {
  const { actions } = ctx
  const out: Command[] = []
  // --- New panel -----------------------------------------------------------

  // NOT hiddenAtRest, unlike every administration row: this is a create verb
  // like a preset spawn, not an admin one, and it takes no target — there is
  // no captured panel to gate it on and therefore no state in which it is
  // disabled. A row that is only reachable by guessing its query is
  // indistinguishable from a feature that was never built (verify:palette 31's
  // rule), and this feature's other gesture is a drop, which the keyboard
  // cannot reach at all. It lives in THIS section, not Panels, for the same
  // reason: Panels holds verbs about a panel that already exists (go to,
  // rename, restart, review); this one mints a new one, exactly what every
  // row below it does.
  // M65. The considered way to start a panel — where, what, how — first in
  // the section that mints panels, with its chord. ⌘N stays the instant
  // default (the row below carries that chip).
  out.push({
    id: 'spawn.sheet',
    title: 'New panel…',
    subtitle: 'choose the directory, a saved command or a one-off, and the agent\'s mode',
    searchText: 'new panel start spawn sheet directory command task where',
    group: 'spawn',
    shortcut: '⌘⇧N',
    run: () => actions.beginSpawnSheet()
  })
  // M244's creation rows, AFTER New panel… rather than ahead of it: M65's rule
  // (verify:palette sheet.1) is that the considered way to start a panel heads
  // the spawn section. Pushed first, they displaced it — failing on main since
  // 7a3323d0, found while gating M245–M247.
  out.push(...creationCommands(ctx))

  // M80. Templates: one row each, disabled by its own reason when it cannot
  // run; and the save verb, refused by name with nothing selected.
  // M83. The project memory, for the captured panel's repository.
  out.push(withReason({
    id: 'panel.memory', ...hiddenAtRestIf(ctx.memoryRoot === undefined || ctx.memoryRoot === ''),
    title: 'Open memory…',
    subtitle: 'what this repository has decided, tried and failed',
    searchText: 'memory project remember decided tried failed notes',
    group: 'panel',
    run: () => actions.openMemory()
  }, ctx.memoryRoot === undefined || ctx.memoryRoot === '' ? REASON_NO_REPO_MEMORY : undefined))

  // M84. The watcher: a command run on a trigger. Its directory is the
  // selected panel's, like the note and the memory rows, so the row is
  // disabled by NAME rather than opening a form with nowhere to run.
  out.push(withReason({
    id: 'panel.watcher', ...hiddenAtRestIf(ctx.noteRoot === null || ctx.noteRoot === undefined),
    title: 'Watch…',
    // Brief #19: said as what it gives, not what it is.
    subtitle: 'rerun a check whenever files change, so a review always has a fresh result',
    searchText: 'watch watcher run when change trigger tests build timer',
    group: 'panel',
    run: () => actions.beginWatcher()
  }, ctx.noteRoot === null || ctx.noteRoot === undefined ? REASON_NO_WATCH_ROOT : undefined))

  // M103. The browser pane. ALWAYS present and never disabled: a URL is
  // typed, not derived from a captured panel or a directory, so there is no
  // reason a row could be refused for — and a row that only appeared once
  // something was selected would read as a feature that was never built.
  out.push({
    id: 'canvas.browser',
    title: 'Open a page…',
    subtitle: 'a browser panel — a dev server, docs, a preview',
    searchText: 'open page browser url web http localhost dev server preview',
    group: 'spawn',
    run: () => actions.beginBrowser()
  })

  const templateRows = ctx.templates ?? []
  if (templateRows.length === 0) {
    out.push(withReason({
      id: 'template.none', title: 'New from template…', searchText: 'template new from shape of work start',
      group: 'panel', hiddenAtRest: true, run: () => {}
    }, REASON_NO_TEMPLATES))
  }
  for (const t of templateRows) {
    out.push(withReason({
      id: `template.new.${t.id}`,
      title: `New from ${t.name}`,
      subtitle: `${t.nodes} panel${t.nodes === 1 ? '' : 's'} · ${t.edges} edge${t.edges === 1 ? '' : 's'}`,
      searchText: 'template new from shape of work start',
      group: 'panel',
      run: () => actions.beginSpawnSheet(t.id)
    }, t.refusal))
  }
  // M133. The workflow panel's door: one row per template, beside the row
  // that RUNS it. Two verbs, never one — opening a shape and starting it are
  // different acts, and the palette says which is which.
  for (const t of templateRows) {
    // The merged view is read-only, so `openWorkflowPanel` returns without
    // minting anything. A row that runs and does nothing is the silent
    // failure this repository disables by name instead.
    out.push(withReason({
      id: `workflow.open.${t.id}`,
      title: `Open ${t.name} as a workflow`,
      subtitle: `${t.nodes} block${t.nodes === 1 ? '' : 's'} - the diagram, its runs and its triggers`,
      searchText: 'workflow open diagram blocks template runs triggers',
      group: 'panel',
      run: () => actions.openWorkflow(t.id)
    }, ctx.merged === true ? REASON_MERGED_READ_ONLY : undefined))
  }
  out.push(withReason({
    id: 'template.save',
    title: 'Save selection as template…',
    subtitle: 'start the same panels and handoffs again in one step — reusable as a workflow',
    searchText: 'save template selection shape of work',
    group: 'panel',
    hiddenAtRest: true,
    run: () => actions.beginSaveTemplate(ctx.selectedIds)
  }, ctx.selectedIds.length === 0 ? REASON_NO_SELECTION_TEMPLATE : undefined))

  out.push({
    id: 'panel.open-file',
    title: 'Open file…',
    searchText: 'open file read view text document',
    group: 'spawn',
    run: () => actions.openFile()
  })

  // M27. A note is a file panel in prose mode, so this sits beside Open file…
  // as a second CREATE verb rather than anywhere new. Visible at rest for
  // that row's reason: it is the only gesture in the app that makes one, so a
  // hidden row would be a feature reachable only by someone who already knew
  // it existed. Disabled-with-a-reason rather than absent when there is
  // nowhere to put it — verify:palette 31's standing rule.
  out.push(
    withReason(
      {
        id: 'panel.new-note',
        title: 'New note…',
        // M409. What tells it from `New Note` (in search): it asks for the name.
        subtitle: 'choose its filename',
        searchText: 'new note markdown scratch write jot memo notes',
        group: 'spawn',
        run: () => actions.newNote()
      },
      ctx.noteRoot === null ? REASON_NO_NOTE_ROOT : undefined
    )
  )

  // M73. A chat with claude is the third CREATE verb, beside Open file… and
  // New note…, visible at rest for their reason. Disabled BY NAME when the
  // CLI is not on the login PATH — derived from the claude preset row's own
  // availability, so the palette, the launcher and the sheet cannot
  // disagree about whether it was found.
  out.push(
    withReason(
      {
        id: 'panel.new-chat',
        title: 'New chat…',
        searchText: 'new chat claude conversation agent talk ask start a conversation',
        group: 'spawn',
        run: () => actions.newChat()
      },
      claudeAvailable(ctx.presets) ? undefined : REASON_NO_CLAUDE
    )
  )

  // M120. A chat with NO place: one spawn-group row per registered backend, beside New chat…
  // (the sheet's own order), disabled by name for a binary not on the PATH
  // and by the row's own `noSandbox` sentence for a row with no read-only
  // mode — never dropped, so a backend that cannot is a backend that says so.
  // M409 (the critic). One refused row per missing ENGINE stays at rest: its
  // reason is the install hint ("codex was not found … install it"), the only
  // place ⌘K says an engine exists that this Mac lacks. The second backend on
  // the same binary (acp rides copilot) adds nothing, and rests in search.
  const hinted = new Set<string>()
  for (const backend of BACKEND_IDS) {
    const row = BACKENDS[backend]
    const available = backendAvailable(ctx.presets, backend)
    const hint = row.sandboxArgs !== undefined && !available && !hinted.has(row.binary)
    if (hint) hinted.add(row.binary)
    out.push(
      withReason(
        {
          id: `chat.sandbox.${backend}`,
          // M409. The subject is a read-only mode, then the CLI: absent, the row rests in
          // search — except the one install hint per missing engine above.
          ...hiddenAtRestIf(row.sandboxArgs === undefined || (!available && !hint)),
          // M403 (B8). The launcher's own words lead: "Ask a question" existed
          // only on the launcher, which is gone once a panel exists, and the
          // palette called the same door "New chat (no folder)". Both names
          // find it; the id and the no-folder fact are unchanged (sandbox.1).
          title: `Ask a question (new chat, no folder) — ${row.label}`,
          searchText: `ask a question new chat no folder sandbox ${row.label} conversation without a repository`,
          group: 'spawn',
          run: () => actions.newSandboxChat(backend)
        },
        row.sandboxArgs === undefined ? row.reasons.noSandbox : backendAvailable(ctx.presets, backend) ? undefined : row.reasons.noCli
      )
    )
  }

  for (const preset of ctx.presets) {
    out.push(
      withReason(
        {
          id: `preset.spawn.${preset.id}`,
          // M409. Not on the PATH: in search and in Manage presets…, not at rest. An UNREAD
          // preset stays at rest — reading it is a fix the person can act on, beside it.
          ...hiddenAtRestIf(preset.reviewed !== false && !preset.available),
          title: preset.name,
          subtitle: preset.subtitle,
          searchText: SPAWN_TERMS,
          group: 'spawn',
          scope: 'presets',
          // On the DEFAULT preset's row and no other. CLAUDE.md records that
          // this feature sat inert for a whole milestone because nothing
          // anywhere said what Cmd+N would spawn — the stock canvas looked
          // correct and only a user who hand-edited defaultPresetId could
          // tell. A hint on every row would be a lie on all but one.
          ...(preset.isDefault ? { shortcut: '⌘⌥N' } : {}),
          run: () => actions.spawnPreset(preset.id)
        },
        // M253. Unread comes first: a pack preset whose command IS on the
        // PATH still will not spawn, and "read it" is the fix a person can act on.
        preset.reviewed === false ? REASON_UNREAD_PRESET : preset.available ? undefined : REASON_NOT_ON_PATH
      )
    )
    // M253. The unread preset's own door, beside the disabled row: the
    // subtitle is the command and directory a person is agreeing to run.
    if (preset.reviewed === false) {
      out.push({ id: `preset.read.${preset.id}`, title: `I've read this preset: ${preset.name}`, subtitle: preset.subtitle, searchText: `read reviewed trust preset pack ${preset.name}`, group: 'spawn', scope: 'presets', run: () => { void actions.markPresetRead(preset.id) } })
    }
  }

  return out
}
