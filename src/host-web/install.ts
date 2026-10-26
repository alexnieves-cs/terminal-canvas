import { hostInfo } from './os'

/**
 * Lane Q (M591). The two globals the preload reads that a page does not have:
 * `process.argv` and `process.platform`. vite.host.config.ts rewrites those
 * two expressions to the names below, rather than putting a fake `process`
 * on window, because libraries probe `typeof process` to decide they are in
 * Node and would take their Node paths in a tab.
 */
const info = hostInfo()
const g = globalThis as unknown as { __TC_HOST_ARGV__: string[]; __TC_HOST_PLATFORM__: string }
g.__TC_HOST_ARGV__ = [`--tc-version=${info.version}`]
g.__TC_HOST_PLATFORM__ = info.platform
