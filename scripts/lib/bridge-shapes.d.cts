/** Types for bridge-shapes.cjs, for vite.web.config.ts (lane N). */
declare const bridgeShapes: {
  bridgeShapes(root: string): Record<string, string>
  classify(type: string, shared: string): string
}
export = bridgeShapes
