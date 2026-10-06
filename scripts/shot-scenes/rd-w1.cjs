/* Planned redesign scenes for lane W1.
   No `run` yet: scripts/shot.cjs paints a scene only once the lane supplies
   one, so verify:meta visual.1 does not demand a golden for this seam.
   reference paths are repo paths (critic.reference.1). */
module.exports = [
  { name: 'rd-world-transition', reference: ['docs/redesign/mockups/10-world-transition.png'], intent: 'Canvas to World, frozen mid-move, with the cancel chip and the 2D | World lens.' },
  { name: 'rd-world-transition-rm', reference: ['docs/redesign/mockups/10-world-transition.png'], intent: 'The same move under reduced motion: a cross-fade, no dolly.' },
]
