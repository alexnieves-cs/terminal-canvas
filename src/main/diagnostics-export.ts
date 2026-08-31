import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { DiagnosticsExportResult, DiagnosticsSnapshot } from '../shared/ipc-contract'

/**
 * Backlog #75's export half. The renderer has already assembled and scrubbed
 * the whole bundle (diagnostics-model.ts's own comment states what it leaves
 * out and why); this module's only job is writing it to disk, the same split
 * credential-store.ts draws between "who decides what's safe" and "who writes
 * the file" — main never re-reads session state to build the export, so
 * there is exactly one place a maintainer bundle's shape is decided.
 *
 * `dir` and `now` are injected, the same trade layout-store.ts's `filePath`
 * and credential-store.ts's `filePath`/`crypto` make, so this is drivable
 * under plain node with no Electron and no real userData directory in
 * earshot.
 */
export interface DiagnosticsExportDeps {
  dir: string
  now?: () => Date
}

function timestampFor(date: Date): string {
  // Colon-free and millisecond-free: a filename, not an ISO string a shell
  // would need to quote — the same care `main/tmux-args.ts`'s `pane-died`
  // hook and `main/file-write.ts`'s temp names both take with paths this app
  // writes itself.
  return date.toISOString().replace(/[:.]/g, '-')
}

/**
 * Atomic write: a temp file in the SAME directory, then `renameSync` over the
 * final name — the identical mechanics credential-store.ts's `flush()` and
 * layout-store.ts's coalesced write both use, so a reader (or another export)
 * never observes a half-written bundle.
 */
export function writeDiagnosticsBundle(
  deps: DiagnosticsExportDeps,
  snapshot: DiagnosticsSnapshot
): DiagnosticsExportResult {
  try {
    mkdirSync(deps.dir, { recursive: true })
    const name = `diagnostics-${timestampFor((deps.now ?? (() => new Date()))())}.json`
    const path = join(deps.dir, name)
    const tmp = `${path}.tmp`
    writeFileSync(tmp, JSON.stringify(snapshot, null, 2), { mode: 0o600 })
    renameSync(tmp, path)
    return { ok: true, path }
  } catch (error) {
    // Unlike credential-store.ts's refusal, the payload here carries no
    // secret by construction (see diagnostics-model.ts), so a filesystem
    // error's own message — a path, a permission denial — is safe to surface
    // verbatim rather than withheld.
    const message = error instanceof Error ? error.message : 'could not write the diagnostics file'
    return { ok: false, reason: message }
  }
}
