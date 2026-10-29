import type { CanvasState } from '@shared/layout-schema'
import { parseLayout } from '@shared/layout-schema/workspaces'

/**
 * Lane N (M565). The demo's canvas: the rd-steward cast (the mockups' five
 * tasks), turned into a layout the way `scripts/fixtures/rd-steward/load.cjs`
 * does for `TC_FIXTURE=rd-steward npm run dev`.
 *
 * A port, not an import: load.cjs reads the cast with `node:fs`, which a
 * browser bundle cannot. `verify:demo demo.layout.1` holds the two equal on
 * the same cast, so a change to the loader that this file misses is red
 * rather than a demo that quietly shows a different canvas from the app.
 *
 * The result is then read back through `parseLayout`, the same parser
 * main's store uses, so the demo's canvas is one the app would accept.
 */

export interface CastPanel {
  id: string
  name: string
  agent?: boolean
  engine?: string
  folder?: string
  line?: string
  world?: string
  rect?: { x: number; y: number; w: number; h: number }
}

export interface CastTask {
  id: string
  ticket?: string
  title: string
  panels: CastPanel[]
}

export interface Cast {
  workspace?: string
  tasks: CastTask[]
}

const AGENT_OF: Record<string, string> = { claude: 'claude-code', codex: 'codex', copilot: 'copilot' }

/** load.cjs's `stewardLayout`, line for line. `cwd` joins with '/', as node:path does on a Mac. */
export function stewardLayout(workspace: Cast, cwd: string): Record<string, unknown> {
  const now = 1_700_000_000_000
  let z = 1
  const panels: Record<string, unknown>[] = []
  const workItems: Record<string, unknown>[] = []
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
      const agent = panel.engine === undefined ? undefined : AGENT_OF[panel.engine]
      const links = panel.id === first?.id
        ? ids.filter((id) => id !== panel.id).map((to) => ({ to }))
        : []
      panels.push({
        id: panel.id,
        x: rect.x, y: rect.y, w: rect.w, h: rect.h, z: z++,
        cwd: folder === '' ? cwd : `${cwd}/${folder}`,
        command: '/bin/sh',
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

/** What `layout.load` answers: the active workspace, as main's `initial()` hands it over. */
export function demoCanvas(cast: Cast, cwd: string): { canvas: CanvasState; name: string } {
  const { snapshot } = parseLayout(JSON.stringify(stewardLayout(cast, cwd)))
  const active = snapshot.workspaces.find((w) => w.id === snapshot.activeWorkspaceId) ?? snapshot.workspaces[0]
  const { id: _id, name, share: _share, ...canvas } = active
  return { canvas: canvas as CanvasState, name }
}
