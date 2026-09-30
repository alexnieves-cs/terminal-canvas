/**
 * M402 follow-up (the critic). WHO ASKED FOR A NEW OBJECT, for the placer.
 *
 * An agent's plan line and a workflow's action node (the executor's
 * `runAgentPlan`, origin 'door') make objects no person pressed for at that
 * moment. A camera that flew to each one took the view from the person who
 * was looking somewhere else, so a mint made under `quietly` is QUIET: no
 * reveal, and an anchored spot in view first (Canvas.tsx's `placer`).
 *
 * A depth, not a flag, and released in `finally`: a step awaits (a chooser, a
 * spawn), so the window spans the await; two steps in flight at once nest.
 * The cost, accepted: a person's own press that lands during an agent step's
 * await is quiet too — it still lands in view, only without a pan.
 */
let depth = 0

export function placementQuiet(): boolean {
  return depth > 0
}

export async function quietly<T>(run: () => Promise<T>): Promise<T> {
  depth++
  try {
    return await run()
  } finally {
    depth--
  }
}
