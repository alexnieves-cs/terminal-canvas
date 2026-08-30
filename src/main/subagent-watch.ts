/**
 * The stateful half of subagent detection: a claimed session directory per
 * panel, a byte offset into its parent transcript, and the records built
 * from both. Task 1's `subagent-scan.ts` is pure and knows nothing about a
 * filesystem or about time; this is where the dirty per-tick reads and the
 * per-panel memory that ties polls together actually live.
 *
 * Every read comes through `WatchDeps` rather than `node:fs` directly, for
 * the reason `review-engine.ts` takes its `GitRunner` as a constructor
 * argument: it is what lets the whole state machine be driven against a fake
 * filesystem with no real `~/.claude` anywhere in earshot. Real fs wiring —
 * `readdir`, `readFile`, `stat` — is Task 4's job, not this file's.
 *
 * `poll` runs on a 2s tick, per panel, for the life of the app, so the rule
 * throughout is the same one `subagent-scan.ts` states for itself: a
 * surprise costs a `continue`, never a throw. Every `WatchDeps` call may
 * answer null, and null is an ORDINARY state — no Claude Code installed, no
 * session yet, no `subagents/` directory, an unreadable transcript — not an
 * error.
 */

import {
  attributable,
  chooseSession,
  cwdOf,
  parseMeta,
  scanForResults,
  slugFor
} from './subagent-scan'

export interface SubagentRecordInternal {
  id: string
  agentType: string
  description: string
  model: string
  spawnDepth: number
  toolUseId: string
  state: 'running' | 'done'
  startedAt: number
}

export interface WatchDeps {
  /** Directory entries with creation times, or null if the directory is absent. */
  listDirs(path: string): Array<{ name: string; createdAt: number }> | null
  /** File names in a directory, or null if absent. */
  listFiles(path: string): string[] | null
  /** Whole-file read, or null on any failure. */
  readText(path: string): string | null
  /** Bytes [from..EOF] plus the new EOF offset, or null on any failure. */
  readFrom(path: string, from: number): { text: string; end: number } | null
  /** File size in bytes, or null if absent. */
  sizeOf(path: string): number | null
  projectsRoot: string
  now(): number
}

/**
 * How far back a first claim reads before settling onto its live offset, so
 * a subagent that finished before this app ever noticed the panel is
 * reported `done` rather than stuck `running` forever. 256KiB is comfortably
 * more than one session's worth of subagent tool_use/tool_result pairs, and
 * small enough that paying it once, on claim, is not itself a cost worth
 * noticing next to the 2s recurring tick.
 */
export const BACK_SCAN_BYTES = 262144

/** The one filename shape this module reads out of a `subagents/` listing. */
const META_SUFFIX = '.meta.json'

/**
 * The dedupe key reported for an ambiguous panel. A sentinel string rather
 * than `JSON.stringify([])` — the empty array a genuinely CLAIMED panel with
 * no subagents yet would also serialise to — because the two are different
 * facts wearing the same "no records" shape, and colliding their keys would
 * suppress the real transition from "claimed, nothing running yet" straight
 * into "ambiguous" the instant they happened to be adjacent. Any string that
 * cannot come out of `JSON.stringify` on an array (which always starts with
 * `[`) is safe; this one is chosen to read as intent if it ever surfaces in
 * a log.
 */
const AMBIGUOUS_KEY = 'ambiguous'

/**
 * Per-panel claim state. `records` is keyed by the file's own id (its
 * basename without `.meta.json`) rather than by `toolUseId` — the two happen
 * to be distinct values in practice (Claude Code mints its own file ids),
 * and the id is what a `listFiles` result actually hands back, so keying on
 * it is what lets "not already known" be answered by a single map lookup
 * instead of re-reading and re-parsing a file just to learn the key it would
 * be stored under.
 *
 * Deliberately does NOT carry the dedupe key — see `lastKeys` on the class
 * below for why that lives in a separate, longer-lived map.
 */
interface PanelState {
  sessionDir: string
  parentPath: string
  subagentsDir: string
  offset: number
  records: Map<string, SubagentRecordInternal>
}

export class SubagentWatch {
  private readonly deps: WatchDeps
  private readonly panels = new Map<string, PanelState>()
  /**
   * The last dedupe key reported per panel, kept in a map SEPARATE from
   * `panels` and with a different lifetime. Ambiguity is a steady state, not
   * a transient one — two panels sharing one repository is an ordinary,
   * long-lived configuration — so re-announcing it every tick for the life
   * of the app is exactly the failure the dedupe exists to prevent, and it
   * is invisible on screen: it shows up as heat, never a wrong pixel, the
   * same argument check 16 makes for a claimed panel's unchanged records.
   * `panels` is cleared the moment a panel goes ambiguous (see `poll`), but
   * `lastKeys` is not, which is what lets a run of ambiguous ticks dedupe
   * against ITSELF while an ambiguous -> unambiguous -> ambiguous round trip
   * still reports on the second arrival: the middle, unambiguous state
   * writes a real records key in between, so the second ambiguous report
   * differs from what came immediately before it and is not suppressed.
   */
  private readonly lastKeys = new Map<string, string>()

  constructor(deps: WatchDeps) {
    this.deps = deps
  }

  /** One tick. Returns only panels whose record list CHANGED. */
  poll(
    panels: ReadonlyArray<{ panelId: string; cwd: string; spawnedAt: number }>
  ): Array<{ panelId: string; records: SubagentRecordInternal[]; ambiguous: boolean }> {
    // A fact about the whole CANVAS, not about any one panel — see
    // attributable's own comment in subagent-scan.ts. Recomputed every tick
    // because which panels collide can change as panels open and close.
    const slugs = new Map<string, string | null>()
    for (const panel of panels) slugs.set(panel.panelId, slugFor(panel.cwd))
    const allowed = attributable(slugs)

    const out: Array<{ panelId: string; records: SubagentRecordInternal[]; ambiguous: boolean }> = []

    for (const panel of panels) {
      if (!allowed.has(panel.panelId)) {
        // Refused by attributable — most often two panels sharing one
        // repository. The claim itself — session dir, offset, records — is
        // dropped rather than merely left stale: an ambiguous panel has
        // nothing this tick can vouch for, and leaving the old claim in
        // place would let it silently resume the instant the colliding
        // neighbour closed, on a claim that was never re-confirmed for this
        // tick. If the ambiguity later clears, the panel re-claims from
        // scratch and re-scans from a fresh offset rather than resuming a
        // stale one.
        this.panels.delete(panel.panelId)
        // The dedupe key, by contrast, is NOT dropped here — see `lastKeys`'
        // own comment for why ambiguity is a steady state that must dedupe
        // like any other, rather than re-announcing itself every 2s tick
        // forever.
        if (this.lastKeys.get(panel.panelId) === AMBIGUOUS_KEY) continue
        this.lastKeys.set(panel.panelId, AMBIGUOUS_KEY)
        out.push({ panelId: panel.panelId, records: [], ambiguous: true })
        continue
      }

      let state = this.panels.get(panel.panelId)
      if (!state) {
        const claimed = this.claim(panel)
        if (!claimed) continue // no session yet, or the confirmation failed
        state = claimed
        this.panels.set(panel.panelId, state)
      }

      this.ingestMeta(state)
      this.ingestResults(state)

      // THE DEDUPE. JSON.stringify over the records, never a string join:
      // `description` is model-authored text that may contain any separator
      // a join would pick, the same reason railSignature in the renderer
      // uses JSON.stringify rather than concatenation. Object field order is
      // fixed by construction (ingestMeta always builds the same shape), so
      // two calls over an unchanged records map serialise identically.
      const records = [...state.records.values()]
      const key = JSON.stringify(records)
      if (key === this.lastKeys.get(panel.panelId)) continue
      this.lastKeys.set(panel.panelId, key)
      out.push({ panelId: panel.panelId, records, ambiguous: false })
    }

    return out
  }

  /** A panel is gone: drop its offset, its claimed dir, its records and its dedupe key. */
  drop(panelId: string): void {
    this.panels.delete(panelId)
    this.lastKeys.delete(panelId)
  }

  /** Every panel is gone (a reload). */
  clear(): void {
    this.panels.clear()
    this.lastKeys.clear()
  }

  /**
   * Every panel's DEDUPE forgotten; every panel's CLAIM (its session dir,
   * byte offset and records map) kept. For detachAll()'s reload path, which
   * is a re-send trigger and not a teardown: main's PtyManager and the tmux
   * sessions it holds both survive a Cmd+R, only the renderer is new, so its
   * empty store has to be told every fact again rather than have them
   * deduped away against a memory the fresh renderer never had — the
   * identical reason PtyManager's own lastLive.clear() exists.
   *
   * clear() (above) would satisfy that alone and is the wrong choice: it
   * also drops the claimed session directory, so the next poll would
   * re-derive it from the REATTACHING create() call's new, later spawnedAt —
   * and chooseSession only accepts a directory created ON OR AFTER
   * spawnedAt, which the real one, predating the reload, no longer is. A
   * panel's subagents would vanish at the first Cmd+R and never come back
   * for the life of that panel, with nothing in any log. See
   * pty-manager.ts's detachAll() for where this is called.
   */
  clearDedupe(): void {
    this.lastKeys.clear()
  }

  /**
   * Claims a session directory for a panel that holds no state yet, or
   * returns null having claimed nothing. Every step below can fail on an
   * ordinary state — no Claude Code, no session created yet, an unreadable
   * transcript — and a failure anywhere in the chain means "try again next
   * tick", never a throw and never a partial claim.
   */
  private claim(panel: { panelId: string; cwd: string; spawnedAt: number }): PanelState | null {
    const slug = slugFor(panel.cwd)
    const dirs = this.deps.listDirs(`${this.deps.projectsRoot}/${slug}`)
    if (dirs === null) return null
    const sessionDir = chooseSession(dirs, panel.spawnedAt)
    if (sessionDir === null) return null

    const parentPath = `${this.deps.projectsRoot}/${slug}/${sessionDir}.jsonl`
    // THE CONFIRMATION. slugFor's mapping is inferred from 31 observed
    // directory names, not documented anywhere — see its own comment — so it
    // is never trusted on its own. A session whose own first transcript line
    // records a DIFFERENT cwd is not this panel's, however well the
    // directory name matched, which is what makes slugFor safe to be wrong
    // about.
    const wholeText = this.deps.readText(parentPath)
    if (wholeText === null) return null
    const newline = wholeText.indexOf('\n')
    const firstLine = newline === -1 ? wholeText : wholeText.slice(0, newline)
    const recordedCwd = cwdOf(firstLine)
    if (recordedCwd === null || recordedCwd !== panel.cwd) return null

    const size = this.deps.sizeOf(parentPath)
    if (size === null) return null
    // The bounded back-scan: a subagent that finished before this app ever
    // attached to the session is reported settled rather than left stuck
    // `running` forever, without re-reading a transcript that can run to
    // megabytes on every claim.
    const offset = Math.max(0, size - BACK_SCAN_BYTES)

    return {
      sessionDir,
      parentPath,
      subagentsDir: `${this.deps.projectsRoot}/${slug}/${sessionDir}/subagents`,
      offset,
      records: new Map()
    }
  }

  /** Picks up any `*.meta.json` sidecar this panel has not already read. */
  private ingestMeta(state: PanelState): void {
    const files = this.deps.listFiles(state.subagentsDir)
    if (files === null) return // no subagents/ yet — ordinary for a fresh session
    for (const file of files) {
      if (!file.endsWith(META_SUFFIX)) continue
      const id = file.slice(0, -META_SUFFIX.length)
      if (state.records.has(id)) continue
      const text = this.deps.readText(`${state.subagentsDir}/${file}`)
      if (text === null) continue
      const meta = parseMeta(text)
      if (meta === null) continue
      state.records.set(id, {
        id,
        agentType: meta.agentType,
        description: meta.description,
        model: meta.model,
        spawnDepth: meta.spawnDepth,
        toolUseId: meta.toolUseId,
        state: 'running',
        startedAt: this.deps.now()
      })
    }
  }

  /**
   * Scans the newly-appended tail of the parent transcript for completions.
   * Always reads from the last offset forward — even when nothing is
   * currently `running` — because the offset itself is the cost worth
   * keeping small: deferring the advance would only trade this tick's small
   * read for a larger one the next time a subagent starts, never eliminate
   * it, while unconditionally advancing keeps every read a bounded delta.
   */
  private ingestResults(state: PanelState): void {
    const chunk = this.deps.readFrom(state.parentPath, state.offset)
    if (chunk === null) return
    state.offset = chunk.end

    const running = new Set<string>()
    for (const record of state.records.values()) {
      if (record.state === 'running') running.add(record.toolUseId)
    }
    const done = scanForResults(chunk.text, running)
    if (done.size === 0) return
    for (const record of state.records.values()) {
      if (done.has(record.toolUseId)) record.state = 'done'
    }
  }
}
