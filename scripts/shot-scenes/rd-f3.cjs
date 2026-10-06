/* Lane F3 (M438). Title bar and attention pill.
   These scenes name a reference and an intent and are not painted. A paint
   key is what makes visual.1 demand a golden, and the goldens do not exist
   yet — they are the lead's, after a person has looked, on macOS.
   UPDATE_GOLDENS is not set here. The steward fixture is not on the harness
   (requests.md R-014). */
module.exports = [
  { name: 'rd-f3-titlebar', reference: ['docs/redesign/mockups/04-main-workspace.png'], intent: 'The title bar: Canvas, Sessions and Review, the session count, and Find or run anything.' },
  { name: 'rd-f3-pill', reference: ['docs/redesign/mockups/04-main-workspace.png'], intent: 'The attention pill at rest, naming who needs you and the Go chord.' }
]
