import { carryChatMarks } from '@shared/chat-panel'
import { carryBackend } from '@shared/agent-backends'
import type { WatchTrigger } from '@shared/watch-trigger'
import type { PersistedPanel } from '@shared/layout-schema'
import type { ChatSource } from '@shared/chat-panel'
import { isNotePanel, isImagePanel, isSkillPanel, isWorkflowPanel, isWorkPanel, isMemoryPanel, isFilePanel, isJiraPanel, isGithubPanel,
  isToolboxPanel, isChatPanel, isWatcherPanel, isReviewPanel, isBrowserPanel, type Panel } from './panels'

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
  return { cwd: chat.cwd, sessionId: chat.sessionId, ...(chat.supervisor === true ? { supervisor: true } : {}), ...(chat.teammateId === undefined ? {} : { teammateId: chat.teammateId }), ...carryBackend(chat), ...carryChatMarks(chat), ...(chat.agentOptions === undefined ? {} : { agentOptions: { ...chat.agentOptions } }) }
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
      // M130. The fourth mark; absent stays absent like the three above.
      ...(p.skillTrail === 'collapsed' ? { skillTrail: 'collapsed' as const } : {}),
      // M182. The binding, copied by name.
      ...(p.templateBinding === undefined ? {} : { templateBinding: { templateId: p.templateBinding.templateId, key: p.templateBinding.key } }),
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
        source: { path: p.source.path, ...(p.source.prose === true ? { prose: true as const } : {}), ...(p.source.checklist === undefined ? {} : { checklist: p.source.checklist }), ...(p.source.sheet === undefined ? {} : { sheet: p.source.sheet }) }
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
        watch: { cwd: p.watch.cwd, command: p.watch.command, args: [...p.watch.args], ...(p.watch.armed === false ? { armed: false as const } : {}), ...(p.watch.templateId === undefined ? {} : { templateId: p.watch.templateId }), trigger: copyTrigger(p.watch.trigger) }
      }
    }
    // M103. The browser pane: one field, copied by name.
    // M185/M195. An ABSENT device and an ABSENT preview binding stay absent through both copy sites — a spread writing `device: undefined` survives IPC and reads as present.
    if (p.kind === 'browser') return { ...base, kind: 'browser' as const, url: p.url, ...(p.device === undefined ? {} : { device: p.device }), ...(p.preview === undefined ? {} : { preview: p.preview }) }
    // M116. The work card: one field, copied by name.
    if (p.kind === 'work') return { ...base, kind: 'work' as const, work: { itemId: p.work.itemId } }
    // M181. The image panel: one field, copied by name.
    // M187. The sixteenth kind, both copy sites: an absent tint stays absent.
    if (p.kind === 'note') return { ...base, kind: 'note' as const, note: { form: p.note.form, text: p.note.text, ...(p.note.tint === undefined ? {} : { tint: p.note.tint }) } }
    // M186. An absent asset id stays absent through both copy sites.
    if (p.kind === 'image') return { ...base, kind: 'image' as const, image: { path: p.image.path, ...(p.image.asset === undefined ? {} : { asset: p.image.asset }) } }
    // M128. The skill panel: two fields, copied BY NAME. A spread of
    // `p.skill` would share the persisted object with the live panel.
    if (p.kind === 'skill') return { ...base, kind: 'skill' as const, skill: { scope: p.skill.scope, name: p.skill.name } }
    // M133. The template id alone, field by field like every sibling.
    if (p.kind === 'workflow') return { ...base, kind: 'workflow' as const, workflow: { templateId: p.workflow.templateId } }
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
        // M147. The overrides, absent when absent.
        ...(p.env === undefined ? {} : { env: { ...p.env } }),
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
      ...(panel.skillTrail === 'collapsed' ? { skillTrail: 'collapsed' as const } : {}),
      ...(panel.templateBinding === undefined ? {} : { templateBinding: { templateId: panel.templateBinding.templateId, key: panel.templateBinding.key } }),
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
        source: { path: panel.source.path, ...(panel.source.prose === true ? { prose: true as const } : {}), ...(panel.source.checklist === undefined ? {} : { checklist: panel.source.checklist }), ...(panel.source.sheet === undefined ? {} : { sheet: panel.source.sheet }) }
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
        watch: { cwd: panel.watch.cwd, command: panel.watch.command, args: [...panel.watch.args], ...(panel.watch.armed === false ? { armed: false as const } : {}), ...(panel.watch.templateId === undefined ? {} : { templateId: panel.watch.templateId }), trigger: copyTrigger(panel.watch.trigger) }
      }
    }
    // M103. Same no-cwd/no-args rule as every branch above.
    if (isBrowserPanel(panel)) return { ...base, kind: 'browser' as const, url: panel.url, ...(panel.device === undefined ? {} : { device: panel.device }), ...(panel.preview === undefined ? {} : { preview: panel.preview }) }
    // M116. Same rule; the id is the record's whole identity.
    if (isWorkPanel(panel)) return { ...base, kind: 'work' as const, work: { itemId: panel.work.itemId } }
    // M181. Same rule; the path is the record's whole identity.
    if (isNotePanel(panel)) return { ...base, kind: 'note' as const, note: { form: panel.note.form, text: panel.note.text, ...(panel.note.tint === undefined ? {} : { tint: panel.note.tint }) } }
    if (isImagePanel(panel)) return { ...base, kind: 'image' as const, image: { path: panel.image.path, ...(panel.image.asset === undefined ? {} : { asset: panel.image.asset }) } }
    // M128. Same rule; the pair is the record's whole identity.
    if (isSkillPanel(panel)) return { ...base, kind: 'skill' as const, skill: { scope: panel.skill.scope, name: panel.skill.name } }
    // M133. The template id alone, field by field like every sibling.
    if (isWorkflowPanel(panel)) return { ...base, kind: 'workflow' as const, workflow: { templateId: panel.workflow.templateId } }
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
      ...(panel.spec.env === undefined ? {} : { env: { ...panel.spec.env } }),
      args: [...panel.spec.args]
    }
  })
}
