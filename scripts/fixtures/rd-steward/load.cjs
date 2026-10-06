'use strict'
/**
 * TC_FIXTURE=rd-steward. One loader for `npm run dev` and `scripts/shot.cjs`.
 *
 * The cast in workspace.json is not a layout file. This turns it into one
 * the store can read: a terminal per panel, titled with the cast's name,
 * sleeping rather than launching an agent. A demo switch that spawned
 * claude would start work nobody asked for. Dev points userData at a
 * throwaway directory before this writes, so the person's layout.json
 * is not the file that changes.
 */
const { readFileSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')

const FIXTURE_ID = 'rd-steward'

/** Layout `agent` is an AgentKind. A shell or a review stays a shell. */
const AGENT_OF = { claude: 'claude-code', codex: 'codex', copilot: 'copilot' }

function readWorkspace(root) {
  return JSON.parse(readFileSync(join(root, 'scripts/fixtures/rd-steward/workspace.json'), 'utf8'))
}

function stewardLayout(workspace, cwd) {
  const now = 1_700_000_000_000
  let z = 1
  const panels = []
  const workItems = []
  for (const task of workspace.tasks || []) {
    const first = (task.panels || [])[0]
    workItems.push({
      id: task.id,
      source: 'typed',
      title: task.title,
      state: 'todo',
      createdAt: now,
      updatedAt: now,
      ...(typeof task.ticket === 'string' && task.ticket !== '' ? { key: task.ticket } : {}),
      ...(first ? { panelId: first.id } : {})
    })
    const ids = (task.panels || []).map((panel) => panel.id).filter((id) => typeof id === 'string')
    for (const panel of task.panels || []) {
      const rect = panel.rect || { x: 0, y: 0, w: 480, h: 288 }
      const line = typeof panel.line === 'string' && panel.line !== '' ? panel.line : panel.name
      const folder = typeof panel.folder === 'string' ? panel.folder : ''
      const agent = AGENT_OF[panel.engine]
      // The first panel is the work item's conversation. One hop of links
      // names the rest, which is how taskMemberships groups the cast.
      const links = panel.id === first?.id
        ? ids.filter((id) => id !== panel.id).map((to) => ({ to }))
        : []
      panels.push({
        id: panel.id,
        x: rect.x, y: rect.y, w: rect.w, h: rect.h, z: z++,
        cwd: folder === '' ? cwd : join(cwd, folder),
        command: '/bin/sh',
        // $1 is the cast's line. The shell sleeps so the panel is a picture
        // of the fixture, not a process doing the fixture's work.
        args: ['-c', 'printf %s\\n "$1"; sleep 600', 'sh', String(line || '')],
        title: panel.name,
        ...(agent !== undefined ? { agent } : {}),
        ...(links.length > 0 ? { links } : {})
      })
    }
  }
  return {
    version: 1,
    activeWorkspaceId: 'w1',
    workspaces: [{
      id: 'w1',
      name: typeof workspace.workspace === 'string' && workspace.workspace !== '' ? workspace.workspace : 'Steward',
      camera: { x: 0, y: 0, scale: 1 },
      selectedId: panels[0] ? panels[0].id : null,
      focusedId: null,
      panels,
      groups: [],
      bookmarks: [],
      workItems
    }],
    presets: [],
    defaultPresetId: 'shell'
  }
}

function writeStewardLayout(layoutPath, cwd, root) {
  const workspace = readWorkspace(root || cwd)
  writeFileSync(layoutPath, JSON.stringify(stewardLayout(workspace, cwd)))
}

module.exports = { FIXTURE_ID, readWorkspace, stewardLayout, writeStewardLayout }
