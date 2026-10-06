/* Planned redesign scenes for lane L-C.
   No `run` yet: scripts/shot.cjs paints a scene only once the lane supplies
   one, so verify:meta visual.1 does not demand a golden for this seam.
   reference paths are repo paths (critic.reference.1). */
module.exports = [
  { name: 'rd-plan-palette', reference: ['docs/redesign/mockups/06-navigate-palette.png'], intent: 'Plan tier at 34 percent with the palette open, grouped, on a task query.' },
  { name: 'rd-map', reference: ['docs/redesign/mockups/06-navigate-palette.png'], intent: 'Map tier: task territories and state dots. The same mockup, read for the tier not the palette.' },
]
