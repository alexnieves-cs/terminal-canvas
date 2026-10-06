/**
 * M443. The menu a port drag onto empty canvas opens. The rows are the
 * spawn sheet's agents and presets; the foot is the handoff this gesture
 * arms (on exit, the source's summary is the input). Pure: the component
 * only renders this.
 */

export interface ConnectedAgentRow { id: 'claude' | 'codex' | 'shell'; label: string; chord: string }

export interface ConnectedSpawnMenuModel {
  title: string
  agents: ConnectedAgentRow[]
  presets: { id: string; name: string }[]
  foot: string
  handoff: { kind: 'handoff'; enabled: true; trigger: 'exit' }
}

export function connectedSpawnMenu(
  sourceName: string,
  presets: readonly { id: string; name: string }[]
): ConnectedSpawnMenuModel {
  return {
    title: `New object connected to ${sourceName}`,
    agents: [
      { id: 'claude', label: 'Claude Code', chord: '⌘N' },
      { id: 'codex', label: 'Codex', chord: '' },
      { id: 'shell', label: 'Shell', chord: '⌘T' }
    ],
    presets: presets.map((preset) => ({ id: preset.id, name: preset.name })),
    foot: `Starts when ${sourceName} finishes, with its summary as input`,
    handoff: { kind: 'handoff', enabled: true, trigger: 'exit' }
  }
}
