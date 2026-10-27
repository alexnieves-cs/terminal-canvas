/**
 * Lane Q (M590). `@sentry/electron/main` on a host: telemetry-init imports it
 * only when telemetry is on, and the real package requires Electron at load.
 * A host never reports to Sentry, so the import fails loudly into
 * telemetry-init's own catch, which degrades to off — its documented path.
 */
export function init(): never {
  throw new Error('telemetry is off on a hosted install')
}
export const IPCMode = {}
export const onUncaughtExceptionIntegration = init
export const onUnhandledRejectionIntegration = init
export const electronMinidumpIntegration = init
export const linkedErrorsIntegration = init
export const functionToStringIntegration = init
