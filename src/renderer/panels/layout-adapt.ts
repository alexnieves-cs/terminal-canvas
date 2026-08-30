import type { PersistedPanel } from '@shared/layout-schema'
import { isReviewPanel, type Panel } from './panels'

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
  return persisted.map((p) => {
    const base = {
      rect: { id: p.id, x: p.x, y: p.y, w: p.w, h: p.h },
      z: p.z,
      ...(p.title === undefined ? {} : { title: p.title }),
      // Absent stays absent, the rule `title` above and `command` below obey.
      // Copied element-wise rather than by reference so a parsed record and
      // the live Panel cannot share a mutable array.
      ...(p.links === undefined ? {} : { links: p.links.map((l) => ({ ...l })) })
    }
    // The disk rule stated once, in the one place it converts: only 'review'
    // is tested positively, so an absent kind — every pre-M9b file — becomes
    // a terminal panel here rather than anywhere further downstream.
    if (p.kind === 'review') return { ...base, kind: 'review' as const, subject: { ...p.subject } }
    return {
      ...base,
      kind: 'terminal' as const,
      spec: {
        panelId: p.id,
        cwd: p.cwd,
        // Spread rather than `command: p.command`, so an absent command stays
        // ABSENT rather than becoming an explicit undefined. Only main can name
        // the login shell; a renderer-side default would silently give a bash or
        // fish user zsh.
        ...(p.command === undefined ? {} : { command: p.command }),
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
      ...(panel.links === undefined ? {} : { links: panel.links.map((l) => ({ ...l })) })
    }
    // No cwd and no args keys AT ALL on this branch — not `cwd: undefined`.
    // A review record carrying an explicit undefined cwd fails its own parse
    // on the next launch (the terminal branch's cwd check), which is a canvas
    // that loses every review node on every relaunch, silently.
    if (isReviewPanel(panel)) return { ...base, kind: 'review' as const, subject: { ...panel.subject } }
    return {
      ...base,
      kind: 'terminal' as const,
      cwd: panel.spec.cwd,
      ...(panel.spec.command === undefined ? {} : { command: panel.spec.command }),
      args: [...panel.spec.args]
    }
  })
}
