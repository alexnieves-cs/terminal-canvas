/* Planned redesign scenes for lane L-B.
   No `run` yet: scripts/shot.cjs paints a scene only once the lane supplies
   one, so verify:meta visual.1 does not demand a golden for this seam.
   reference paths are repo paths (critic.reference.1). */
module.exports = [
  { name: 'rd-workspace', reference: ['docs/redesign/mockups/04-main-workspace.png'], intent: 'The Work-tier canvas: a task region, a needs-you panel, a handoff and the inspector.' },
  { name: 'rd-arrange', reference: ['docs/redesign/mockups/05-create-arrange.png'], intent: 'Mid-drag with smart guides, the marquee toolbar up, and the connected spawn menu open.' },
]
