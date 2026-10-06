/* Planned redesign scenes for lane F1.
   No `run` yet: scripts/shot.cjs paints a scene only once the lane supplies
   one, so verify:meta visual.1 does not demand a golden for this seam.
   reference paths are repo paths (critic.reference.1). */
module.exports = [
  { name: 'rd-f1-tones', reference: ['docs/redesign/mockups/04-main-workspace.png'], intent: 'One panel of each tone, with selection on a working panel, so state colour can be judged against the main workspace.' },
]
