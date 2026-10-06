/* Planned redesign scenes for lane F2.
   No `run`: the shared model has no chrome of its own, and scripts/shot.cjs
   paints a scene only once a later lane supplies `run`. verify:meta visual.1
   does not demand a golden for a seam. reference paths are repo paths
   (critic.reference.1). */
module.exports = [
  {
    name: 'rd-steward-work',
    reference: ['docs/redesign/mockups/04-main-workspace.png'],
    intent: 'The Steward fixture at the Work tier: the Ledger CSV export region, Claude working, Codex waiting on an edit, the watcher and the changes card. F2 does not paint this; L-B and L-C do, from task-regions and the attention queue.'
  },
  {
    name: 'rd-steward-plan',
    reference: ['docs/redesign/mockups/06-navigate-palette.png'],
    intent: 'The same fixture at the Plan tier (scale 0.34): five task regions and status cards. The tier comes from zoom-tier.ts. F2 does not paint this.'
  },
  {
    name: 'rd-steward-world',
    reference: ['docs/redesign/mockups/11-world-main.png'],
    intent: 'The world-sim feed at the Plan pitch: three waiting, one failed, four working, terraces from the same regions. F2 does not paint this; W2 does.'
  }
]
