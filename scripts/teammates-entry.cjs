/* M100. Bundle entry for the teammate record and Places — pure shared modules
   (no node, no DOM) plus main/places.ts, which takes its realpath as a
   dependency so the traversal cases run under plain node against a fake
   filesystem. */
module.exports = {
  teammates: require('../src/shared/teammates'),
  places: require('../src/shared/places'),
  gate: require('../src/main/places')
}
