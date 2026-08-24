import type { PersistedPanel } from '@shared/layout-schema'
import type { Panel } from './panels'

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

export function toPanels(persisted: PersistedPanel[]): Panel[] {
  return persisted.map((p) => ({
    rect: { id: p.id, x: p.x, y: p.y, w: p.w, h: p.h },
    spec: {
      panelId: p.id,
      cwd: p.cwd,
      // Spread rather than `command: p.command`, so an absent command stays
      // ABSENT rather than becoming an explicit undefined. Only main can name
      // the login shell; a renderer-side default would silently give a bash or
      // fish user zsh.
      ...(p.command === undefined ? {} : { command: p.command }),
      args: [...p.args]
    },
    z: p.z
  }))
}

export function fromPanels(panels: Panel[]): PersistedPanel[] {
  return panels.map((panel) => ({
    id: panel.rect.id,
    x: panel.rect.x,
    y: panel.rect.y,
    w: panel.rect.w,
    h: panel.rect.h,
    z: panel.z,
    cwd: panel.spec.cwd,
    ...(panel.spec.command === undefined ? {} : { command: panel.spec.command }),
    args: [...panel.spec.args]
  }))
}
