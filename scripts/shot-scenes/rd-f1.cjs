/* Planned redesign scenes for lane F1.
   No `run` yet: scripts/shot.cjs paints a scene only once the lane supplies
   one, so verify:meta visual.1 does not demand a golden for this seam.
   reference paths are repo paths (critic.reference.1). */
module.exports = [
  { name: 'rd-f1-tones', reference: ['docs/redesign/mockups/04-main-workspace.png'], intent: 'One panel of each tone (working, needs-you, done, exited, idle) plus selection on a working panel. The critic verdict is reads-as against 04-main-workspace.png for state colour: cyan working, amber the only glow, green finished, red failed, slate idle, and a lighter cyan ring on the selected working panel.' },
]
