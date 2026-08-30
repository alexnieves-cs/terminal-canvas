/**
 * Re-export, so main-side callers and scripts/usage-entry.cjs keep their
 * import path. The table lives in shared because the INSPECTOR prices its own
 * totals, and the renderer must never import from src/main.
 */
export { costOf, MODEL_RATES, type ModelRates } from '../shared/pricing'
