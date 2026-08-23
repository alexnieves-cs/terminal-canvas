import type { WorldRect } from './viewport'

/**
 * Stand-ins for the real terminal panels of M3. Deliberately spread far wider
 * than one screen so that panning somewhere and finding something is testable
 * by hand, and so culling has something to cull in M3.
 */
export const PLACEHOLDER_PANELS: WorldRect[] = [
  { id: 'p01', x: 0, y: 0, w: 520, h: 340 },
  { id: 'p02', x: 600, y: 0, w: 520, h: 340 },
  { id: 'p03', x: 1200, y: 0, w: 520, h: 340 },
  { id: 'p04', x: 0, y: 420, w: 520, h: 340 },
  { id: 'p05', x: 600, y: 420, w: 520, h: 340 },
  { id: 'p06', x: 1200, y: 420, w: 520, h: 340 },
  { id: 'p07', x: -700, y: 200, w: 520, h: 340 },
  { id: 'p08', x: -700, y: 620, w: 520, h: 340 },
  { id: 'p09', x: 1900, y: 200, w: 520, h: 340 },
  { id: 'p10', x: 1900, y: 620, w: 520, h: 340 },
  { id: 'p11', x: 300, y: 900, w: 520, h: 340 },
  { id: 'p12', x: 900, y: 900, w: 520, h: 340 },
  { id: 'p13', x: -400, y: -500, w: 520, h: 340 },
  { id: 'p14', x: 200, y: -500, w: 520, h: 340 },
  { id: 'p15', x: 800, y: -500, w: 520, h: 340 },
  { id: 'p16', x: 2600, y: 0, w: 520, h: 340 },
  { id: 'p17', x: 2600, y: 420, w: 520, h: 340 },
  { id: 'p18', x: -1400, y: 0, w: 520, h: 340 },
  { id: 'p19', x: -1400, y: 420, w: 520, h: 340 },
  { id: 'p20', x: 600, y: 1380, w: 520, h: 340 }
]
