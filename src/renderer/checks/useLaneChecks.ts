import { useEffect, useMemo, useState } from 'react'
import type { RunRow } from '@shared/run-ledger'
import type { ReviewIdentity } from '@shared/review-identity'
import { bindCheckFreshness, checksFromLedger, checksFromWatchers, type CheckRecord } from '@shared/check-evidence'
import { getWatch, subscribeWatch } from '@renderer/watcher/watcher-store'

/**
 * M307. A lane's WITNESSED checks, freshness bound — for the review node's
 * verification line and its failing-check follow-up.
 *
 * The same three steps as Orchestrate's `useChecks` (`OrchWorkbench.tsx`),
 * over rows the caller already read: ledger rows and watcher runs inside the
 * lane become `CheckRecord`s, the identity NOW is asked of main once per
 * (cwd, base) — keyed by BOTH, the M288 critic's fix, since two lanes forked
 * from one commit share a base sha — and `bindCheckFreshness` decides which
 * results still describe the content. A watcher with a panel is read from the
 * watcher store and its ledger rows are dropped, so a run is never counted twice.
 *
 * Null while the caller's rows are unread: "no checks" and "not looked yet"
 * are different sentences.
 */
export interface LaneWatcher { id: string; cwd: string; command: string; args: readonly string[] }

export function useLaneChecks(rows: readonly RunRow[] | null, lanePath: string | undefined, watchers: readonly LaneWatcher[], refresh: number): CheckRecord[] | null {
  const watcherKey = watchers.map((w) => w.id).join(' ')
  // A run ENDING re-binds, and so does its `tested` stamp, which main
  // publishes SEPARATELY after the exit (M286); a tail chunk does not — a
  // streaming run notifies many times a second.
  const [runsSeen, setRunsSeen] = useState(0)
  useEffect(() => {
    const keyOf = (id: string): string => { const w = getWatch(id); return `${w.status}:${w.endedAt ?? 0}:${w.tested?.content ?? ''}` }
    const last = new Map(watchers.map((w) => [w.id, keyOf(w.id)]))
    const offs = watchers.map((w) => subscribeWatch(w.id, () => {
      const now = keyOf(w.id)
      if (last.get(w.id) === now) return
      last.set(w.id, now)
      setRunsSeen((n) => n + 1)
    }))
    return () => { for (const off of offs) off() }
  }, [watcherKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const raw = useMemo<CheckRecord[] | null>(() => {
    if (rows === null || lanePath === undefined) return null
    const ids = new Set(watchers.map((w) => w.id))
    const ledger = checksFromLedger(rows, lanePath).filter((c) => !ids.has(c.panelId))
    const fromWatchers = checksFromWatchers(watchers.map((w) => {
      const s = getWatch(w.id)
      return { id: w.id, cwd: w.cwd, command: w.command, args: w.args, status: s.status, exitCode: s.exitCode, signal: s.signal, startedAt: s.startedAt, endedAt: s.endedAt, tested: s.tested, outputId: s.outputId }
    }), lanePath)
    return [...ledger, ...fromWatchers]
  }, [rows, lanePath, watcherKey, refresh, runsSeen]) // eslint-disable-line react-hooks/exhaustive-deps

  const bases = useMemo(() => [...new Set((raw ?? []).filter((c) => c.tested !== undefined).map((c) => `${c.context.cwd}\0${c.tested?.base ?? ''}`))], [raw])
  const basesKey = bases.join('\n')
  const [identities, setIdentities] = useState<Map<string, ReviewIdentity | undefined>>(() => new Map())
  useEffect(() => {
    if (bases.length === 0 || typeof window.canvas?.review?.identity !== 'function') { setIdentities(new Map()); return }
    let live = true
    void Promise.all(bases.map(async (b) => {
      const [cwd, base] = b.split('\0') as [string, string]
      try { return [b, (await window.canvas.review.identity({ root: cwd, base })) ?? undefined] as const } catch { return [b, undefined] as const }
    })).then((pairs) => { if (live) setIdentities(new Map(pairs)) })
    return () => { live = false }
  }, [basesKey, refresh]) // eslint-disable-line react-hooks/exhaustive-deps

  return useMemo(() => (raw === null ? null : bindCheckFreshness(raw, (base, cwd) => {
    const k = `${cwd}\0${base}`
    return identities.has(k) ? identities.get(k) : null
  })), [raw, identities])
}
