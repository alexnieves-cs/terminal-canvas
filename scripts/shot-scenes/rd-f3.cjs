/* Planned redesign scenes for lane F3.
   No `run` yet: scripts/shot.cjs paints a scene only once the lane supplies
   one, so verify:meta visual.1 does not demand a golden for this seam.
   reference paths are repo paths (critic.reference.1). */
module.exports = [
  { name: 'rd-f3-titlebar', reference: ['docs/redesign/mockups/04-main-workspace.png'], intent: 'The title bar: Canvas, Sessions and Review, the session count, and Find or run anything.' },
  { name: 'rd-f3-pill', reference: ['docs/redesign/mockups/04-main-workspace.png'], intent: 'The attention pill at rest, naming who needs you and the Go chord.' },
]
