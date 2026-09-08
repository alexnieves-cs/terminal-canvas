import { execFile as execFileCallback } from 'node:child_process'
import { promisify } from 'node:util'
import type { MachineCostSnapshot, MachineCostTarget, PanelMachineCost } from '../shared/machine-cost'

const execFile = promisify(execFileCallback)

interface ProcessRow {
  pid: number
  ppid: number
  cpuPercent: number
  /** ps reports RSS in KiB on macOS and Linux. */
  rssKiB: number
}

type ProcessLister = () => Promise<string>

/**
 * Parse a deliberately headerless `ps` answer. Bad rows are dropped rather
 * than turning a transient process exit into a rejected IPC invocation.
 */
export function parseProcessList(stdout: string): ProcessRow[] {
  const rows: ProcessRow[] = []
  for (const line of stdout.split('\n')) {
    const fields = line.trim().split(/\s+/)
    if (fields.length !== 4) continue
    const [pid, ppid, cpuPercent, rssKiB] = fields.map(Number)
    if (![pid, ppid, cpuPercent, rssKiB].every(Number.isFinite)) continue
    if (!Number.isInteger(pid) || !Number.isInteger(ppid) || pid <= 0 || ppid < 0) continue
    if (cpuPercent < 0 || rssKiB < 0) continue
    rows.push({ pid, ppid, cpuPercent, rssKiB })
  }
  return rows
}

/**
 * M186 (M185's critic, finding 1). EXPORTED so the preview's discoverer asks
 * about the same processes the cost sampler measures. A panel's own pid is a
 * shell or a tmux CLIENT; `npm run dev` and the server holding the socket are
 * its DESCENDANTS, so `lsof -p <panel pid>` answers `none` for every real dev
 * server — the discoverer then told a person nothing was listening while
 * their site was up, and offered to start a second one on the taken port.
 */
export function descendantsOf(roots: readonly number[], rows: readonly { pid: number; ppid: number }[]): number[] {
  const children = new Map<number, number[]>()
  for (const row of rows) children.set(row.ppid, [...(children.get(row.ppid) ?? []), row.pid])
  const all = new Set<number>()
  for (const root of roots) for (const pid of treePids(root, children)) all.add(pid)
  return [...all]
}

function treePids(root: number, children: ReadonlyMap<number, readonly number[]>): Set<number> {
  const result = new Set<number>()
  const pending = [root]
  while (pending.length > 0) {
    const pid = pending.pop()
    if (pid === undefined || result.has(pid)) continue
    result.add(pid)
    for (const child of children.get(pid) ?? []) pending.push(child)
  }
  return result
}

/**
 * Aggregate every target's process tree from one system snapshot.
 *
 * The total folds the UNION of all trees, not the panel totals, so a malformed
 * or unusual nested target cannot make the canvas claim one process twice.
 */
export function aggregateMachineCosts(
  targets: readonly MachineCostTarget[],
  rows: readonly ProcessRow[]
): MachineCostSnapshot {
  const byPid = new Map(rows.map((row) => [row.pid, row]))
  const children = new Map<number, number[]>()
  for (const row of rows) {
    const siblings = children.get(row.ppid) ?? []
    siblings.push(row.pid)
    children.set(row.ppid, siblings)
  }

  const panels: PanelMachineCost[] = []
  const totalPids = new Set<number>()
  const seenPanels = new Set<string>()
  for (const target of targets) {
    if (seenPanels.has(target.panelId) || !byPid.has(target.pid)) continue
    seenPanels.add(target.panelId)
    const pids = treePids(target.pid, children)
    let cpuPercent = 0
    let memoryBytes = 0
    for (const pid of pids) {
      const row = byPid.get(pid)
      if (!row) continue
      cpuPercent += row.cpuPercent
      memoryBytes += row.rssKiB * 1024
      totalPids.add(pid)
    }
    panels.push({ panelId: target.panelId, cpuPercent, memoryBytes })
  }

  let cpuPercent = 0
  let memoryBytes = 0
  for (const pid of totalPids) {
    const row = byPid.get(pid)
    if (!row) continue
    cpuPercent += row.cpuPercent
    memoryBytes += row.rssKiB * 1024
  }
  return { panels, total: { cpuPercent, memoryBytes } }
}

async function listProcesses(): Promise<string> {
  const { stdout } = await execFile('ps', ['-axo', 'pid=,ppid=,%cpu=,rss='], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024
  })
  return stdout
}

/**
 * Read one process-table snapshot. A failed ps call is an unavailable reading,
 * not a canvas failure: the next slow poll gets another chance.
 */
export async function sampleMachineCosts(
  targets: readonly MachineCostTarget[],
  list: ProcessLister = listProcesses
): Promise<MachineCostSnapshot> {
  if (targets.length === 0) return { panels: [], total: { cpuPercent: 0, memoryBytes: 0 } }
  try {
    return aggregateMachineCosts(targets, parseProcessList(await list()))
  } catch {
    return { panels: [], total: { cpuPercent: 0, memoryBytes: 0 } }
  }
}
