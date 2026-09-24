import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { GitRunner } from './review-engine'
import { buildBranchArgs, buildHeadArgs } from './git-args'
import { combineScratchPath, readLane } from './combine-runner'
import type { CheckOutputRead } from '../shared/check-output'
import type { LaneMergeRequest, LaneMergeResult } from '../shared/lane-merge'
import type { EventRow } from '../shared/run-ledger'
import { parseReceipt, type IntegrateRequest, type IntegrateResult, type IntegrationReceipt, type ReceiptLane } from '../shared/integration'

/**
 * M317. THE FINAL INTEGRATION STEP — the lanes land in the order that was
 * checked, and only the content that was checked.
 *
 * Every refusal comes BEFORE the first merge, and each re-reads rather than
 * trusts the renderer: the main tree's HEAD is still the base the lanes were
 * combined on; every lane's content fingerprint is the one the combined check
 * witnessed; the check's own output record (M306) says exit 0 and ran IN this
 * repository's combine scratch; every lane is committed (a merge carries
 * commits — `lane-merge.ts` refuses the rest); and a dry run of every lane is
 * `ready`. Then the lanes merge one by one through the same merger Accept
 * uses (`expectHead` from the dry run), stopping at the first that does not
 * land — the ones before it HAVE landed, and the receipt says exactly that.
 *
 * The receipt compares the landed tree to the checked one. Equal is the claim
 * "what landed is byte-for-byte what the check passed on"; different is said
 * in those words, never smoothed over.
 */
export interface IntegratorDeps {
  run: GitRunner
  commonRootOf: (path: string) => Promise<string>
  worktreesDir: string
  readOutput: (runId: string) => Promise<CheckOutputRead>
  merge: (req: LaneMergeRequest) => Promise<LaneMergeResult>
  receipts: ReceiptStore
  /**
   * The durable timeline (M300). Main writes each landed task's row itself:
   * it SAW the merge, so the renderer does not get to be the one that says so
   * (`verify:orchestration orch-timeline.6`'s rule).
   */
  record?: (row: EventRow) => Promise<void>
  now?: () => number
}

export interface ReceiptStore {
  list(root?: string): Promise<IntegrationReceipt[]>
  add(receipt: IntegrationReceipt): Promise<void>
}

const RECEIPTS_MAX = 50
const firstLine = (s: string): string => s.split('\n').map((l) => l.trim()).find((l) => l !== '') ?? ''

/** One JSON file of receipts, newest first, capped; a malformed entry costs itself. */
export function createReceiptStore(o: { file: string; max?: number }): ReceiptStore {
  const max = o.max ?? RECEIPTS_MAX
  let queue: Promise<void> = Promise.resolve()
  const readAll = async (): Promise<IntegrationReceipt[]> => {
    try {
      const raw: unknown = JSON.parse(await fs.readFile(o.file, 'utf8'))
      return Array.isArray(raw) ? raw.map(parseReceipt).filter((r): r is IntegrationReceipt => r !== null) : []
    } catch {
      return []
    }
  }
  return {
    list: async (root) => {
      await queue
      const all = await readAll()
      return root === undefined ? all : all.filter((r) => r.root === root)
    },
    add: (receipt) => {
      queue = queue.catch(() => undefined).then(async () => {
        const next = [receipt, ...(await readAll()).filter((r) => r.id !== receipt.id)].slice(0, max)
        const tmp = `${o.file}.tmp`
        await fs.mkdir(join(o.file, '..'), { recursive: true })
        await fs.writeFile(tmp, JSON.stringify(next, null, 1))
        await fs.rename(tmp, o.file)
      })
      return queue
    }
  }
}

export function createIntegrator(deps: IntegratorDeps): (req: IntegrateRequest) => Promise<IntegrateResult> {
  const git = deps.run
  const now = deps.now ?? Date.now
  return async (req) => {
    if (typeof req?.root !== 'string' || !Array.isArray(req.lanes) || req.lanes.length === 0) return { kind: 'refused', reason: 'an integration names a repository and its lanes' }
    if (typeof req.tree !== 'string' || req.tree === '' || typeof req.base !== 'string') return { kind: 'refused', reason: 'the combined result carries no tree — combine again' }
    const root = await deps.commonRootOf(req.root)

    const head = await git(buildHeadArgs(root))
    if (head.notFound) return { kind: 'refused', reason: 'git was not found on this Mac' }
    if (!head.ok) return { kind: 'refused', reason: `the main tree could not be read — ${firstLine(head.stderr)}` }
    const before = head.stdout.trim()

    // The witness: its own record, re-read — exit 0, and run in THIS repository's scratch.
    const out = await deps.readOutput(req.check?.outputId ?? '')
    if (out.kind !== 'ok') return { kind: 'refused', reason: 'the combined check\'s output record cannot be read — run the check on the combined tree again' }
    const scratch = combineScratchPath(deps.worktreesDir, root)
    if (out.record.cwd.replace(/\/+$/, '') !== scratch) return { kind: 'refused', reason: 'that check did not run on this repository\'s combined tree' }
    if (out.record.exitCode !== 0) return { kind: 'refused', reason: `the combined check did not pass (${out.record.exitCode === null ? 'no exit code' : `exit ${out.record.exitCode}`})` }

    // Nothing moved since the check: the base, then each lane's content.
    const changed: string[] = []
    const heads = new Map<string, string>()
    for (const l of req.lanes) {
      const read = await readLane(git, l.lane, req.base)
      if (!read.ok || read.fingerprint.digest !== l.digest) { changed.push(l.lane); continue }
      if (read.fingerprint.dirty) return { kind: 'refused', reason: `${l.label} has uncommitted changes — commit them in its review (the content is the same, so the check still holds), then integrate` }
      heads.set(l.lane, read.fingerprint.head)
    }
    if (changed.length > 0 || before !== req.base) return { kind: 'stale', changed, mainMoved: before !== req.base }

    // Every lane planned before any lands: a refusal on the third must not leave the first two merged.
    const plans = new Map<string, Extract<LaneMergeResult, { kind: 'ready' }>>()
    for (const l of req.lanes) {
      const plan = await deps.merge({ lane: l.lane, title: l.title ?? l.label, dryRun: true })
      if (plan.kind !== 'ready') return { kind: 'refused', reason: `${l.label}: ${plan.kind === 'refused' ? plan.reason : plan.kind === 'moved' ? 'the lane moved' : plan.kind === 'conflict' ? 'conflicts' : plan.kind === 'failed' ? plan.detail : 'not ready'}` }
      if (plan.head !== heads.get(l.lane)) return { kind: 'stale', changed: [l.lane], mainMoved: false }
      plans.set(l.lane, plan)
    }
    const into = [...plans.values()][0]?.into ?? ''

    const reviewed = new Set(Array.isArray(req.reviewed) ? req.reviewed : [])
    const lanes: ReceiptLane[] = req.lanes.map((l) => {
      const plan = plans.get(l.lane) as Extract<LaneMergeResult, { kind: 'ready' }>
      return {
        lane: l.lane, label: l.label, branch: plan.branch, digest: l.digest, head: plan.head, reviewed: reviewed.has(l.lane),
        outcome: 'not-reached', commits: plan.commits,
        ...(l.itemId === undefined ? {} : { itemId: l.itemId }), ...(l.title === undefined ? {} : { title: l.title })
      }
    })
    for (const lane of lanes) {
      const result = await deps.merge({ lane: lane.lane, title: lane.title ?? lane.label, expectHead: lane.head })
      if (result.kind === 'merged') { lane.outcome = 'merged'; lane.sha = result.sha; lane.commits = result.commits; continue }
      lane.outcome = result.kind === 'conflict' ? 'conflict' : result.kind === 'failed' ? 'failed' : 'refused'
      lane.detail = result.kind === 'conflict' ? `conflicted in ${result.files.join(', ') || 'some files'} (aborted; ${into} is as the lanes before left it)`
        : result.kind === 'failed' ? firstLine(result.detail) : result.kind === 'refused' ? result.reason : 'the lane moved'
      break
    }

    const after = await git(buildHeadArgs(root))
    const landedTree = await git(['-C', root, 'rev-parse', 'HEAD^{tree}'])
    const branch = await git(buildBranchArgs(root))
    const landed = landedTree.ok ? landedTree.stdout.trim() : ''
    const receipt: IntegrationReceipt = {
      v: 1,
      id: `int-${now().toString(36)}`,
      root,
      into: into || (branch.ok ? branch.stdout.trim() : ''),
      at: now(),
      base: req.base,
      before,
      after: after.ok ? after.stdout.trim() : '',
      tree: { checked: req.tree, landed, identical: landed !== '' && landed === req.tree },
      lanes,
      checks: [{ command: out.record.command, exitCode: out.record.exitCode, outputId: out.record.runId, at: out.record.endedAt, where: 'the combined tree' }],
      complete: lanes.every((l) => l.outcome === 'merged')
    }
    await deps.receipts.add(receipt)
    const witness = receipt.checks[0]
    for (const l of lanes) {
      if (l.outcome !== 'merged' || l.itemId === undefined) continue
      await deps.record?.({
        kind: 'event', runId: `integration:${receipt.id}`, at: receipt.at, event: 'check', source: 'app', itemId: l.itemId, key: `integration:${receipt.id}`,
        title: `Integrated into ${receipt.into} — ${l.commits} commit${l.commits === 1 ? '' : 's'} from ${l.branch}`,
        detail: `witnessed by \`${witness?.command ?? 'a check'}\` on the combined tree; the landed tree ${receipt.tree.identical ? 'is' : 'is NOT'} the checked one`
      }).catch(() => undefined)
    }
    return { kind: 'done', receipt }
  }
}
