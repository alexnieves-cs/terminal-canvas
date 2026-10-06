/* Planned redesign scenes for lane L-A.
   No `run` yet: scripts/shot.cjs paints a scene only once the lane supplies
   one, so verify:meta visual.1 does not demand a golden for this seam.
   reference paths are repo paths (critic.reference.1). */
module.exports = [
  { name: 'rd-splash', reference: ['docs/redesign/mockups/01-splash.png'], intent: 'Launch restore frozen at reattaching tmux 3 of 5, over the ghosted layout.' },
  { name: 'rd-onboarding', reference: ['docs/redesign/mockups/02-onboarding.png'], intent: 'Onboarding step 2, one agent found and one missing, with the state-colour preview.' },
  { name: 'rd-empty', reference: ['docs/redesign/mockups/03-empty-state.png'], intent: 'The empty canvas: one primary verb, quick spawns, three inert starter layouts.' },
]
