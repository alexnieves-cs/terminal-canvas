/* Lane L-B (M442, M443). A `run` makes verify:meta visual.1 demand a golden.
   Those goldens are the lead's, after a person has looked. This file does
   not set UPDATE_GOLDENS and does not write under verify/visual/goldens.
   The harness paints the steward fixture only when TC_FIXTURE=rd-steward. */
module.exports = [
  { name: 'rd-workspace', reference: ['docs/redesign/mockups/04-main-workspace.png'], intent: 'The Work-tier canvas: a task region, a needs-you panel, a handoff and the inspector.',
    run: async (kit) => {
      // A filtered shot has no earlier scene to load the layout. The steward
      // cast is what this picture is of, and loadMain writes it only when
      // TC_FIXTURE is rd-steward. The harness preference is light; the mockup
      // is the dark concept.
      await kit.loadMain()
      await kit.theme('dark')
      await kit.context(true)
      await kit.shot('rd-workspace')
    } },
  { name: 'rd-arrange', reference: ['docs/redesign/mockups/05-create-arrange.png'], intent: 'Mid-drag with smart guides, the marquee toolbar up, and the connected spawn menu open.',
    run: async (kit) => {
      await kit.loadMain()
      await kit.theme('dark')
      // The drag, the guides and the marquee toolbar are not driven here.
      // The capture is the dark steward canvas until that gesture is scripted.
      await kit.shot('rd-arrange')
    } }
]
