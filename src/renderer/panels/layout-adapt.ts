import { carryBackend } from '@shared/agent-backends'
import type { WatchTrigger } from '@shared/watch-trigger'
import type { PersistedPanel } from '@shared/layout-schema'
import type { ChatSource } from '@shared/chat-panel'
import { isMemoryPanel, isFilePanel, isJiraPanel, isGithubPanel,
  isToolboxPanel, isChatPanel, isWatcherPanel, isReviewPanel, type Panel } from './panels'

/**
 * Between the persisted shape and the in-memory one.
 *
 * These deliberately do NOT live in shared/layout-schema.ts beside the rest of
 * the format: `Panel` is a renderer type, and shared/ importing from renderer/
 * would invert the dependency direction the codebase is arranged around.
 * Nothing is lost — panels.ts is already in the plain-node verify bundle, and
 * this joins it there.
 *
 * The conversion exists at all because Panel nests (rect carries the id, spec
 * carries the command) and the file must not be shaped by those internal
 * choices. Refactoring Panel should never invalidate a saved canvas.
 */

/**
 * M73. One copy of the chat record for both directions — two copies drift
 * the first time only one gains a field. Absent knobs stay absent.
 */
function copyChatSource(chat: ChatSource): ChatSource {
  // M81's `supervisor` copied like every other field: an absent one stays
  // absent (a spread would write `supervisor: undefined`, which survives IPC
  // and reads as present).
  return { cwd: chat.cwd, sessionId: chat.sessionId, ...(chat.supervisor === true ? { supervisor: true } : {}), ...(chat.teammateId === undefined ? {} : { teammateId: chat.teammateId }), ...carryBackend(chat), ...(chat.agentOptions === undefined ? {} : { agentOptions: { ...chat.agentOptions } }) }
}

/** M84. One arm per trigger kind — see the watcher arm below for why. */
function copyTrigger(trigger: WatchTrigger): WatchTrigger {
  switch (trigger.kind) {
    case 'path': return { kind: 'path', path: trigger.path }
    case 'git-ref': return { kind: 'git-ref', root: trigger.root }
    case 'timer': return { kind: 'timer', everyMs: trigger.everyMs }
    case 'panel': return { kind: 'panel', sourceId: trigger.sourceId, on: trigger.on }
  }
}

export function toPanels(persisted: PersistedPanel[]): Panel[] {
  return persisted.map((p) => {
    const base = {
      rect: { id: p.id, x: p.x, y: p.y, w: p.w, h: p.h },
      z: p.z,
      ...(p.title === undefined ? {} : { title: p.title }),
      // M92. Absent stays absent through the copy, like title.
      ...(p.locked === true ? { locked: true as const } : {}),
      ...(p.pinned === true ? { pinned: true as const } : {}),
      ...(p.maximised === undefined ? {} : { maximised: { restore: { id: p.id, ...p.maximised.restore } } }),
      // Absent stays absent, the rule `title` above and `command` below obey.
      // Copied element-wise rather than by reference so a parsed record and
      // the live Panel cannot share a mutable array.
      ...(p.links === undefined
        ? {}
        : { links: p.links.map((l) => ({ ...l, ...(l.automation === undefined ? {} : { automation: { ...l.automation } }) })) })
    }
    // The disk rule stated once, in the one place it converts: only 'review'
    // is tested positively, so an absent kind — every pre-M9b file — becomes
    // a terminal panel here rather than anywhere further downstream.
    if (p.kind === 'review') return { ...base, kind: 'review' as const, subject: { ...p.subject } }
    // `prose` is copied CONDITIONALLY, never spread. A spread writes
    // `prose: undefined`, and `'prose' in source` then reads TRUE for a file
    // panel that was never a note — the absent-stays-absent trap `command`,
    // `title` and `agent` each already record, reaching a fourth field.
    if (p.kind === 'file') {
      return {
        ...base,
        kind: 'file' as const,
        source: { path: p.source.path, ...(p.source.prose === true ? { prose: true as const } : {}) }
      }
    }
    if (p.kind === 'jira') return { ...base, kind: 'jira' as const }
    if (p.kind === 'github') return { ...base, kind: 'github' as const }
    if (p.kind === 'toolbox') {
      return {
        ...base,
        kind: 'toolbox' as const,
        source: { cwd: p.source.cwd, label: p.source.label }
      }
    }
    // M73. Field by field, absent staying absent — the chat record's
    // agentOptions is the seventh optional field this file copies that way.
    if (p.kind === 'chat') {
      return { ...base, kind: 'chat' as const, chat: copyChatSource(p.chat) }
    }
    // M83. The memory node, its root copied field by field.
    if (p.kind === 'memory') return { ...base, kind: 'memory' as const, source: { root: p.source.root } }
    // M84. The watcher, whose trigger is copied by its OWN kind rather than
    // spread: the union's arms have different fields, and a spread of one
    // arm's object into another's type is legal TypeScript that produces a
    // trigger nothing can fire.
    if (p.kind === 'watcher') {
      return {
        ...base,
        kind: 'watcher' as const,
        watch: { cwd: p.watch.cwd, command: p.watch.command, args: [...p.watch.args], ...(p.watch.armed === false ? { armed: false as const } : {}), trigger: copyTrigger(p.watch.trigger) }
      }
    }
    return {
      ...base,
      kind: 'terminal' as const,
      // M49. Absent stays absent — the sixth field-by-field copy site.
      ...(p.fontSize === undefined ? {} : { fontSize: p.fontSize }),
      spec: {
        panelId: p.id,
        cwd: p.cwd,
        // Spread rather than `command: p.command`, so an absent command stays
        // ABSENT rather than becoming an explicit undefined. Only main can name
        // the login shell; a renderer-side default would silently give a bash or
        // fish user zsh.
        ...(p.command === undefined ? {} : { command: p.command }),
        // Same absent-stays-absent rule as `command`: a spread would carry
        // `agent: undefined` across the boundary, which is a different fact
        // from the field being absent, and buildInspectorModel's `pinned`
        // test treats the two differently.
        ...(p.agent === undefined ? {} : { agent: p.agent }),
        // And again for the knobs beside it. One record rather than three
        // fields is what keeps this ONE conditional line instead of three.
        ...(p.agentOptions === undefined ? {} : { agentOptions: p.agentOptions }),
        ...(p.worktree === undefined ? {} : { worktree: p.worktree }),
        args: [...p.args]
      }
    }
  })
}

export function fromPanels(panels: Panel[]): PersistedPanel[] {
  return panels.map((panel) => {
    const base = {
      id: panel.rect.id,
      x: panel.rect.x,
      y: panel.rect.y,
      w: panel.rect.w,
      h: panel.rect.h,
      z: panel.z,
      // Same absent-stays-absent rule as `command`, and for the same reason.
      ...(panel.title === undefined ? {} : { title: panel.title }),
      ...(panel.locked === true ? { locked: true as const } : {}),
      ...(panel.pinned === true ? { pinned: true as const } : {}),
      ...(panel.maximised === undefined ? {} : { maximised: { restore: { x: panel.maximised.restore.x, y: panel.maximised.restore.y, w: panel.maximised.restore.w, h: panel.maximised.restore.h } } }),
      ...(panel.links === undefined
        ? {}
        : { links: panel.links.map((l) => ({ ...l, ...(l.automation === undefined ? {} : { automation: { ...l.automation } }) })) })
    }
    // No cwd and no args keys AT ALL on this branch — not `cwd: undefined`.
    // A review record carrying an explicit undefined cwd fails its own parse
    // on the next launch (the terminal branch's cwd check), which is a canvas
    // that loses every review node on every relaunch, silently.
    if (isReviewPanel(panel)) return { ...base, kind: 'review' as const, subject: { ...panel.subject } }
    // No cwd and no args keys AT ALL, for the reason the review branch above
    // states: an explicit `cwd: undefined` fails the terminal branch's cwd
    // check on the next launch, losing the panel on every relaunch, silently.
    if (isFilePanel(panel)) {
      // Same conditional copy as toPanels above, for the same reason: this is
      // the side that actually writes layout.json.
      return {
        ...base,
        kind: 'file' as const,
        source: { path: panel.source.path, ...(panel.source.prose === true ? { prose: true as const } : {}) }
      }
    }
    if (isJiraPanel(panel)) return { ...base, kind: 'jira' as const }
    if (isGithubPanel(panel)) return { ...base, kind: 'github' as const }
    // Same no-cwd/no-args rule as the two branches above, for the same reason.
    if (isToolboxPanel(panel)) {
      return {
        ...base,
        kind: 'toolbox' as const,
        source: { cwd: panel.source.cwd, label: panel.source.label }
      }
    }
    if (isChatPanel(panel)) return { ...base, kind: 'chat' as const, chat: copyChatSource(panel.chat) }
    // M83. The memory node's own root, field by field.
    if (isMemoryPanel(panel)) return { ...base, kind: 'memory' as const, source: { root: panel.source.root } }
    // M84. Same no-cwd/no-args rule as every branch above: `watch.cwd` is a
    // different fact from a terminal's spawn cwd, and writing a top-level one
    // would make the next launch read this watcher as a terminal and spawn a
    // shell for it.
    if (isWatcherPanel(panel)) {
      return {
        ...base,
        kind: 'watcher' as const,
        watch: { cwd: panel.watch.cwd, command: panel.watch.command, args: [...panel.watch.args], ...(panel.watch.armed === false ? { armed: false as const } : {}), trigger: copyTrigger(panel.watch.trigger) }
      }
    }
    return {
      ...base,
      kind: 'terminal' as const,
      // M49. Absent stays absent, mirrored from toPanels.
      ...(panel.fontSize === undefined ? {} : { fontSize: panel.fontSize }),
      cwd: panel.spec.cwd,
      ...(panel.spec.command === undefined ? {} : { command: panel.spec.command }),
      ...(panel.spec.agent === undefined ? {} : { agent: panel.spec.agent }),
      ...(panel.spec.agentOptions === undefined ? {} : { agentOptions: panel.spec.agentOptions }),
      ...(panel.spec.worktree === undefined ? {} : { worktree: panel.spec.worktree }),
      args: [...panel.spec.args]
    }
  })
}
