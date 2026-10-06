/* Planned redesign scenes for lane L-F.
   No `run` yet: scripts/shot.cjs paints a scene only once the lane supplies
   one, so verify:meta visual.1 does not demand a golden for this seam.
   reference paths are repo paths (critic.reference.1). */
module.exports = [
  { name: 'rd-recovery', reference: ['docs/redesign/mockups/09-error-disconnected.png'], intent: 'Host loss paused-not-lost, a crashed session with one fix, and reattaching skeletons.' },
]
