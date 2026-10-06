/* Lane F3 (M438). Title bar and attention pill.
   `run` is what makes the harness paint these, and what makes visual.1
   demand a golden. Goldens are the lead's, after a person has looked —
   never UPDATE_GOLDENS here. The steward fixture is not on the harness
   (requests.md R-008), so a capture is the live shell, not mockup 04's copy. */
module.exports = [
  { name: 'rd-f3-titlebar', reference: ['docs/redesign/mockups/04-main-workspace.png'], intent: 'The title bar: Canvas, Sessions and Review, the session count, and Find or run anything.',
    run: async (kit) => { await kit.loadMain(); await kit.shot('rd-f3-titlebar') } },
  { name: 'rd-f3-pill', reference: ['docs/redesign/mockups/04-main-workspace.png'], intent: 'The attention pill at rest, naming who needs you and the Go chord.',
    run: async (kit) => { await kit.loadMain(); await kit.shot('rd-f3-pill') } }
]
