import { outward } from './outward'
import type { StateTone } from './redesign-contracts'
import type { MorningItem } from './return-briefing'
import type { TimelineEntry } from './run-ledger'
import type { TonightStatus } from './tonight'

/**
 * M561 (lane L). THE NIGHT AS A FILM — the script.
 *
 * A night of work is hours of records nobody reads at 7am. This turns them
 * into a 60-second shot list on a fixed timeline: a title card, the night
 * itself (panels appearing, state changes, a check passing or failing, an
 * agent stopping on the person), then the morning queue and an end card.
 * `filmFrame` turns the script into what one frame shows; the renderer only
 * paints that (film-paint.ts) and encodes it (film-encode.ts).
 *
 * Three rules a reader relies on:
 * - **Every word in a frame passed `outward` HERE**, before anything is drawn.
 *   A film is pixels, and a scrubber matches token shapes in a string, so the
 *   only place a token can be caught is the text the frames are drawn FROM.
 *   This is why the film is drawn from the script rather than captured from
 *   the live canvas: a capture of a terminal is the PNG door's exception
 *   (docs/load-bearing.md), and that exception does not generalise to a
 *   second binary export. `redacted` is the gate's count across the script.
 * - **Scrub, then clip.** A caption is clipped to fit a frame only after the
 *   gate has seen the whole string; a clip first could cut a token below the
 *   length the scrubber's pattern needs and let its head through.
 * - **Nothing is invented.** A shot is a ledger row or a Tonight task's own
 *   state; a caption is that record's title. When the night held more than
 *   fits, the loudest rows win (failed, then needs-you, then passed) and the
 *   end card says how many were left out.
 *
 * Pure: no DOM, no clock of its own. `verify:film film.script.*`.
 */

export const FILM_MS = 60_000
export const FILM_FPS = 30
export const FILM_SIZE = { w: 1280, h: 720 } as const
/** The title card, then the night, then the morning queue, then the end card. */
export const FILM_TITLE_MS = 3_000
export const FILM_QUEUE_MS = 9_000
export const FILM_END_MS = 2_000
export const FILM_NIGHT_FROM = FILM_TITLE_MS
export const FILM_NIGHT_TO = FILM_MS - FILM_QUEUE_MS - FILM_END_MS
/** More than this and a shot is on screen too briefly to read. */
export const FILM_SHOTS_MAX = 24
/** The least film time between two shots' starts. */
export const FILM_SHOT_GAP_MS = 1_500
/** The longest a shot holds when the next is far away. */
export const FILM_SHOT_HOLD_MS = 4_000
export const FILM_CAPTION_MAX = 90
export const FILM_LABEL_MAX = 32
export const FILM_QUEUE_MAX = 6
/** Two starts on one panel closer than this are one moment. */
export const FILM_START_MERGE_MS = 20 * 60_000

export interface FilmRect { x: number; y: number; w: number; h: number }

export interface FilmPanelInput {
  id: string
  label: string
  kind: string
  rect: FilmRect
}

export interface FilmInput {
  /** The night's window, epoch ms. */
  from: number
  to: number
  /** The canvas as it stands: where each panel is and what it is called. */
  panels: readonly FilmPanelInput[]
  /** The durable record, any order. Rows outside the window are read only to learn which panels already existed. */
  timeline: readonly TimelineEntry[]
  tonight?: TonightStatus | null
  queue?: readonly MorningItem[]
  /** Wall clock → words. Injected so the suite is not at the mercy of a time zone. */
  clock?: (ms: number) => string
}

/** What a shot is about, which decides how loud it is. */
export type FilmShotKind = 'failed' | 'needs-you' | 'passed' | 'appear' | 'finished' | 'working'

export interface FilmShot {
  /** Film ms the shot starts at, and how long it holds. */
  at: number
  dur: number
  kind: FilmShotKind
  panelId?: string
  caption: string
  tone: StateTone
  /** Epoch ms of the record behind it. */
  wall: number
}

export interface FilmPanel extends FilmPanelInput {
  /** Film ms the panel fades in; 0 when it was on the canvas before the night began. */
  appearAt: number
}

export interface FilmToneChange { panelId: string; at: number; tone: StateTone }

export interface FilmQueueLine { kind: MorningItem['kind']; text: string }

export interface FilmScript {
  from: number
  to: number
  durationMs: number
  fps: number
  panels: FilmPanel[]
  /** By `at`, at most FILM_SHOTS_MAX, never closer than FILM_SHOT_GAP_MS. */
  shots: FilmShot[]
  /** By `at`. Every record moves a panel's tone, shown or not. */
  tones: FilmToneChange[]
  title: string
  subtitle: string
  queue: FilmQueueLine[]
  /** Queue items past FILM_QUEUE_MAX. */
  queueMore: number
  /** Records that happened but did not get a shot of their own. */
  dropped: number
  /** The outward gate's count across every word in the script. */
  redacted: number
  /** The clock words for the window's two ends. */
  fromWords: string
  toWords: string
}

interface Fact {
  wall: number
  kind: FilmShotKind
  panelId?: string
  caption: string
}

const LOUDNESS: Record<FilmShotKind, number> = { failed: 0, 'needs-you': 1, passed: 2, appear: 3, finished: 4, working: 5 }
const TONE_OF: Record<FilmShotKind, StateTone> = { failed: 'exited', 'needs-you': 'needs-you', passed: 'done', appear: 'working', finished: 'idle', working: 'working' }
const FAILED_WORDS = /\b(fail|failed|failing|error|refused|red)\b/i
const ENDED_WORDS = /\b(ended|exited|stopped|gone|interrupted|closed)\b/i

const clipped = (s: string, max: number): string => {
  const one = s.replace(/\s+/g, ' ').trim()
  return one.length > max ? `${one.slice(0, max - 1)}…` : one
}

const defaultClock = (ms: number): string => {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** What a timeline entry says on film, or null for a row that is not a moment (a tool call, a gap). */
function factOf(entry: TimelineEntry): Fact | null {
  if (entry.kind === 'gap') return null
  if (entry.kind === 'command') {
    const r = entry.row
    const cmd = r.command.trim() === '' ? 'a command' : `\`${r.command.trim()}\``
    if (r.exitCode === 0) return { wall: r.endedAt, kind: 'passed', panelId: r.panelId, caption: `${cmd} passed` }
    if (r.exitCode === null) return { wall: r.endedAt, kind: 'finished', panelId: r.panelId, caption: `${cmd} ended` }
    return { wall: r.endedAt, kind: 'failed', panelId: r.panelId, caption: `${cmd} failed (exit ${r.exitCode})` }
  }
  const r = entry.row
  const base = { wall: r.at, caption: r.title, ...(r.panelId === undefined ? {} : { panelId: r.panelId }) }
  switch (r.event) {
    // Tool rows are the texture of a turn, hundreds a night: a shot per tool
    // would be a film of noise, and the dispatch before them already says working.
    case 'tool': return null
    case 'dispatch': return { ...base, kind: 'working' }
    // A permission row is the person answering an agent that had stopped on them.
    case 'permission': return { ...base, kind: 'needs-you' }
    case 'check': return { ...base, kind: FAILED_WORDS.test(r.title) ? 'failed' : 'passed' }
    case 'session': return { ...base, kind: ENDED_WORDS.test(r.title) ? 'finished' : 'working' }
    case 'artifact':
    case 'handoff': return { ...base, kind: 'finished' }
  }
}

/** A Tonight task's start and end, as facts. */
function tonightFacts(tonight: TonightStatus | null | undefined): Fact[] {
  if (tonight === null || tonight === undefined) return []
  const out: Fact[] = []
  for (const t of tonight.tasks) {
    if (t.startedAt !== undefined) out.push({ wall: t.startedAt, kind: 'working', panelId: t.panelId, caption: `Started: ${t.title}` })
    if (t.endedAt === undefined) continue
    const end = ((): Fact | null => {
      switch (t.state) {
        case 'checked': return { wall: t.endedAt, kind: 'passed', panelId: t.panelId, caption: `Checked: ${t.title}${t.check === undefined ? '' : ` — \`${t.check}\` passed`}` }
        case 'claimed': return { wall: t.endedAt, kind: 'finished', panelId: t.panelId, caption: `Done, unchecked: ${t.title}` }
        case 'stuck': return { wall: t.endedAt, kind: 'failed', panelId: t.panelId, caption: `Stuck: ${t.title}${t.reason === undefined ? '' : ` — ${t.reason}`}` }
        case 'over-budget': return { wall: t.endedAt, kind: 'failed', panelId: t.panelId, caption: `Over budget: ${t.title}` }
        case 'stopped': return { wall: t.endedAt, kind: 'finished', panelId: t.panelId, caption: `Stopped: ${t.title}` }
        default: return null
      }
    })()
    if (end !== null) out.push(end)
  }
  return out
}

/** Linear: the window's ends land on the night section's ends. */
function filmTimeOf(wall: number, from: number, to: number): number {
  const span = Math.max(1, to - from)
  const f = Math.min(1, Math.max(0, (wall - from) / span))
  return FILM_NIGHT_FROM + f * (FILM_NIGHT_TO - FILM_NIGHT_FROM)
}

/**
 * Spreads shots so none starts within FILM_SHOT_GAP_MS of the one before:
 * forward first, then back from the night's end, so a cluster at 6am is not
 * pushed off the end of the night and into the morning queue.
 */
function spread(times: number[]): number[] {
  const out = [...times]
  for (let i = 1; i < out.length; i += 1) out[i] = Math.max(out[i]!, out[i - 1]! + FILM_SHOT_GAP_MS)
  const last = FILM_NIGHT_TO - FILM_SHOT_GAP_MS
  if (out.length > 0 && out[out.length - 1]! > last) {
    out[out.length - 1] = last
    for (let i = out.length - 2; i >= 0; i -= 1) out[i] = Math.min(out[i]!, out[i + 1]! - FILM_SHOT_GAP_MS)
  }
  return out.map((t) => Math.max(FILM_NIGHT_FROM, t))
}

const MORNING_WORDS: Record<MorningItem['kind'], string> = { failed: 'failed', decision: 'decide', checked: 'checked', review: 'review', claimed: 'unchecked' }

export function nightFilmScript(input: FilmInput): FilmScript {
  const { from, to } = input
  const clock = input.clock ?? defaultClock
  let redacted = 0
  const gate = (s: string, max: number): string => {
    const o = outward(s, 'night film')
    redacted += o.redacted
    return clipped(o.text, max)
  }

  const known = new Set(input.panels.map((p) => p.id))
  const inWindow = (wall: number): boolean => wall >= from && wall <= to
  const all = [...input.timeline.map(factOf).filter((f): f is Fact => f !== null), ...tonightFacts(input.tonight)]
  // A fact about a panel no longer on the canvas keeps its caption but has no
  // panel to fly to; an empty panel id is the same as none.
  const facts = all
    .filter((f) => inWindow(f.wall))
    .map((f) => (f.panelId !== undefined && known.has(f.panelId) ? f : { wall: f.wall, kind: f.kind, caption: f.caption }))
    .sort((a, b) => a.wall - b.wall)

  // A panel APPEARS at its first record in the window when nothing about it
  // was written before the window; otherwise it was already there.
  const seenBefore = new Set<string>()
  for (const e of input.timeline) {
    const at = e.kind === 'command' ? e.row.startedAt : e.kind === 'event' ? e.row.at : null
    const id = e.kind === 'gap' ? undefined : e.row.panelId
    if (at !== null && id !== undefined && at < from) seenBefore.add(id)
  }
  const firstAt = new Map<string, number>()
  for (const f of facts) if (f.panelId !== undefined && !firstAt.has(f.panelId) && !seenBefore.has(f.panelId)) firstAt.set(f.panelId, f.wall)

  // One start per panel, not three: a Tonight task's "Started", its dispatch
  // row and the panel appearing are one moment. A `working` fact that follows
  // another start on the same panel within FILM_START_MERGE_MS is folded into
  // it, and a panel that appears by starting work says what it started.
  const lastStart = new Map<string, number>()
  const merged: Fact[] = []
  const appears: Fact[] = []
  for (const f of facts) {
    const id = f.panelId
    if (id !== undefined && f.kind === 'working') {
      const prev = lastStart.get(id)
      lastStart.set(id, f.wall)
      if (prev !== undefined && f.wall - prev <= FILM_START_MERGE_MS) continue
      if (firstAt.get(id) === f.wall && !appears.some((a) => a.panelId === id)) { appears.push({ wall: f.wall, kind: 'appear', panelId: id, caption: f.caption }); continue }
    }
    if (id !== undefined && firstAt.get(id) === f.wall && !appears.some((a) => a.panelId === id)) {
      lastStart.set(id, f.wall)
      const p = input.panels.find((q) => q.id === id)!
      appears.push({ wall: f.wall, kind: 'appear', panelId: id, caption: `${p.label} joins` })
    }
    merged.push(f)
  }

  const candidates = [...appears, ...merged]
  // Loudest first, then earliest, so a long night keeps its failures.
  const ranked = candidates
    .map((f, i) => ({ f, i }))
    .sort((a, b) => LOUDNESS[a.f.kind] - LOUDNESS[b.f.kind] || a.f.wall - b.f.wall || a.i - b.i)
  const kept = new Set(ranked.slice(0, FILM_SHOTS_MAX).map((r) => r.i))
  const chosen = candidates.filter((_, i) => kept.has(i))
    // At one moment a panel appears BEFORE what it did, or it would be
    // shown failing while it is still invisible.
    .sort((a, b) => a.wall - b.wall || Number(b.kind === 'appear') - Number(a.kind === 'appear') || LOUDNESS[a.kind] - LOUDNESS[b.kind])
  const times = spread(chosen.map((f) => filmTimeOf(f.wall, from, to)))
  const shots: FilmShot[] = chosen.map((f, i) => {
    const next = i + 1 < times.length ? times[i + 1]! : FILM_NIGHT_TO
    return {
      at: times[i]!,
      dur: Math.min(FILM_SHOT_HOLD_MS, next - times[i]!),
      kind: f.kind,
      ...(f.panelId === undefined ? {} : { panelId: f.panelId }),
      caption: gate(f.caption, FILM_CAPTION_MAX),
      tone: TONE_OF[f.kind],
      wall: f.wall
    }
  })

  // Every fact moves its panel's tone — at its shot's time when it got one,
  // else at its own place on the line — so the canvas tells the whole night
  // even where the captions could not.
  const shotAt = new Map<Fact, number>(chosen.map((f, i) => [f, times[i]!]))
  const tones: FilmToneChange[] = candidates
    .filter((f) => f.panelId !== undefined)
    .map((f) => ({ panelId: f.panelId!, at: shotAt.get(f) ?? filmTimeOf(f.wall, from, to), tone: TONE_OF[f.kind] }))
    .sort((a, b) => a.at - b.at)

  const appearAt = new Map<string, number>()
  for (const [id, wall] of firstAt) appearAt.set(id, shots.find((s) => s.kind === 'appear' && s.panelId === id)?.at ?? filmTimeOf(wall, from, to))
  const panels: FilmPanel[] = input.panels.map((p) => ({ id: p.id, label: gate(p.label, FILM_LABEL_MAX), kind: gate(p.kind, FILM_LABEL_MAX), rect: { ...p.rect }, appearAt: appearAt.get(p.id) ?? 0 }))

  const queueAll = input.queue ?? []
  const queue = queueAll.slice(0, FILM_QUEUE_MAX).map((m) => ({ kind: m.kind, text: gate(`${MORNING_WORDS[m.kind]} · ${m.title} — ${m.text}`, FILM_CAPTION_MAX) }))

  const tasks = input.tonight?.tasks ?? []
  const checked = tasks.filter((t) => t.state === 'checked').length
  const fromWords = clock(from)
  const toWords = clock(to)
  const parts = [`${fromWords} – ${toWords}`]
  if (tasks.length > 0) parts.push(`${tasks.length} task${tasks.length === 1 ? '' : 's'}`, `${checked} checked`)
  else parts.push(`${facts.length} moment${facts.length === 1 ? '' : 's'}`)

  return {
    from, to,
    durationMs: FILM_MS,
    fps: FILM_FPS,
    panels,
    shots,
    tones,
    title: 'Last night',
    subtitle: parts.join(' · '),
    queue,
    queueMore: Math.max(0, queueAll.length - FILM_QUEUE_MAX),
    dropped: candidates.length - chosen.length,
    redacted,
    fromWords,
    toWords
  }
}

// ── The frame ─────────────────────────────────────────────────────────────

export type FilmScene = 'title' | 'night' | 'queue' | 'end'

export interface FilmCamera {
  /** World point at the frame's centre, and world → frame pixels. */
  cx: number
  cy: number
  scale: number
}

export interface FilmFramePanel {
  id: string
  label: string
  kind: string
  rect: FilmRect
  tone: StateTone
  /** 0 → 1 as it fades in. */
  opacity: number
  /** 0 → 1, the focused panel's ring. */
  focus: number
  /** The latest caption about this panel so far, shown in its body. */
  line?: string
}

export interface FilmFrame {
  t: number
  scene: FilmScene
  camera: FilmCamera
  panels: FilmFramePanel[]
  caption: { text: string; tone: StateTone; alpha: number } | null
  /** The wall clock the frame stands for. */
  clock: string
  /** 0 → 1 over the whole film. */
  progress: number
  /** 0 → 1, how far a title, queue or end card has faded in. */
  card: number
}

/** The band at the bottom of a frame the caption takes; the camera frames above it. */
export const FILM_CAPTION_BAND = 120
const FADE_MS = 400
const MOVE_MS = 700
const FOCUS_PAD = 1.7
const OVERVIEW_PAD = 80

const ease = (x: number): number => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x))
const lerp = (a: number, b: number, f: number): number => a + (b - a) * f

/** The camera that fits `box` into the frame above the caption band. */
function fit(box: FilmRect): FilmCamera {
  const w = FILM_SIZE.w - OVERVIEW_PAD * 2
  const h = FILM_SIZE.h - FILM_CAPTION_BAND - OVERVIEW_PAD
  const scale = Math.min(w / Math.max(1, box.w), h / Math.max(1, box.h), 2)
  return { cx: box.x + box.w / 2, cy: box.y + box.h / 2, scale }
}

function bounds(rects: readonly FilmRect[]): FilmRect {
  if (rects.length === 0) return { x: 0, y: 0, w: FILM_SIZE.w, h: FILM_SIZE.h }
  const x0 = Math.min(...rects.map((r) => r.x))
  const y0 = Math.min(...rects.map((r) => r.y))
  const x1 = Math.max(...rects.map((r) => r.x + r.w))
  const y1 = Math.max(...rects.map((r) => r.y + r.h))
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

/** Never closer than the overview's own scale times this: a push-in, not a jump cut. */
const FOCUS_ZOOM_MAX = 2.5

function cameraFor(script: FilmScript, shot: FilmShot | undefined, overview: FilmCamera): FilmCamera {
  const p = shot?.panelId === undefined ? undefined : script.panels.find((q) => q.id === shot.panelId)
  if (p === undefined) return overview
  const w = p.rect.w * FOCUS_PAD
  const h = p.rect.h * FOCUS_PAD
  const cam = fit({ x: p.rect.x + p.rect.w / 2 - w / 2, y: p.rect.y + p.rect.h / 2 - h / 2, w, h })
  return { ...cam, scale: Math.min(cam.scale, overview.scale * FOCUS_ZOOM_MAX) }
}

function wallAt(script: FilmScript, t: number): number {
  if (t <= FILM_NIGHT_FROM) return script.from
  if (t >= FILM_NIGHT_TO) return script.to
  return script.from + ((t - FILM_NIGHT_FROM) / (FILM_NIGHT_TO - FILM_NIGHT_FROM)) * (script.to - script.from)
}

/** What frame `t` (film ms) shows. Pure, so any frame can be drawn on its own and in any order. */
export function filmFrame(script: FilmScript, t: number, clock: (ms: number) => string = defaultClock): FilmFrame {
  const time = Math.min(Math.max(0, t), script.durationMs)
  const scene: FilmScene = time < FILM_NIGHT_FROM ? 'title' : time < FILM_NIGHT_TO ? 'night' : time < FILM_MS - FILM_END_MS ? 'queue' : 'end'
  const overview = fit(bounds(script.panels.map((p) => p.rect)))

  // The shot on screen, and the one before it, so the camera eases between them.
  let index = -1
  for (let i = 0; i < script.shots.length; i += 1) if (script.shots[i]!.at <= time) index = i
  const shot = scene === 'night' && index >= 0 && time < script.shots[index]!.at + script.shots[index]!.dur ? script.shots[index] : undefined
  const prevShot = index > 0 ? script.shots[index - 1] : undefined
  const prevHeld = prevShot !== undefined && script.shots[index]!.at <= prevShot.at + prevShot.dur
  const target = scene === 'night' ? cameraFor(script, shot, overview) : overview
  const start = index >= 0 ? script.shots[index]!.at : FILM_NIGHT_FROM
  const from = scene !== 'night' || index < 0
    ? overview
    : cameraFor(script, prevHeld ? prevShot : undefined, overview)
  // After a shot's hold ends the camera eases back out from it.
  const lastEnd = index >= 0 ? script.shots[index]!.at + script.shots[index]!.dur : 0
  const camera = ((): FilmCamera => {
    if (scene === 'queue') {
      const back = cameraFor(script, script.shots[script.shots.length - 1], overview)
      const f = ease((time - FILM_NIGHT_TO) / MOVE_MS)
      return { cx: lerp(back.cx, overview.cx, f), cy: lerp(back.cy, overview.cy, f), scale: lerp(back.scale, overview.scale, f) }
    }
    if (scene !== 'night') return overview
    if (shot === undefined && index >= 0) {
      const held = cameraFor(script, script.shots[index], overview)
      const f = ease((time - lastEnd) / MOVE_MS)
      return { cx: lerp(held.cx, overview.cx, f), cy: lerp(held.cy, overview.cy, f), scale: lerp(held.scale, overview.scale, f) }
    }
    const f = ease((time - start) / MOVE_MS)
    return { cx: lerp(from.cx, target.cx, f), cy: lerp(from.cy, target.cy, f), scale: lerp(from.scale, target.scale, f) }
  })()

  const toneOf = (id: string): StateTone => {
    let tone: StateTone = 'idle'
    for (const c of script.tones) {
      if (c.at > time) break
      if (c.panelId === id) tone = c.tone
    }
    return tone
  }
  const lineOf = new Map<string, string>()
  for (const s of script.shots) if (s.at <= time && s.panelId !== undefined) lineOf.set(s.panelId, s.caption)
  const panels: FilmFramePanel[] = script.panels.map((p) => ({
    id: p.id, label: p.label, kind: p.kind, rect: p.rect,
    ...(lineOf.has(p.id) ? { line: lineOf.get(p.id)! } : {}),
    tone: toneOf(p.id),
    opacity: p.appearAt === 0 ? 1 : ease((time - p.appearAt) / FADE_MS),
    focus: shot?.panelId === p.id ? ease((time - shot.at) / FADE_MS) * ease((shot.at + shot.dur - time) / FADE_MS) : 0
  }))

  const caption = shot === undefined ? null : {
    text: shot.caption,
    tone: shot.tone,
    alpha: ease((time - shot.at) / FADE_MS) * ease((shot.at + shot.dur - time) / FADE_MS)
  }
  const card = scene === 'title' ? 1 - ease((time - (FILM_TITLE_MS - FADE_MS)) / FADE_MS)
    : scene === 'queue' ? ease((time - FILM_NIGHT_TO - MOVE_MS) / FADE_MS)
      : scene === 'end' ? 1 : 0
  return { t: time, scene, camera, panels, caption, clock: clock(wallAt(script, time)), progress: time / script.durationMs, card }
}

/** How many frames the film has. */
export const filmFrameCount = (script: FilmScript): number => Math.round((script.durationMs / 1000) * script.fps)

/** Without a batch or an absence to go by, a "night" is the last twelve hours. */
export const FILM_DEFAULT_NIGHT_MS = 12 * 60 * 60_000
/** A window shorter than this has nothing to film; it is widened back from its end. */
export const FILM_MIN_NIGHT_MS = 30 * 60_000

/**
 * M564. Which window "Last night" covers: the Tonight batch when one ran (its
 * start to its end, or now while it still runs), else the person's absence,
 * else the last twelve hours. Never shorter than half an hour.
 */
export function nightWindow(tonight: TonightStatus | null | undefined, awaySince: number | null, now: number): { from: number; to: number } {
  const to = tonight?.endedAt ?? now
  const from = tonight?.startedAt ?? awaySince ?? now - FILM_DEFAULT_NIGHT_MS
  return { from: Math.min(from, to - FILM_MIN_NIGHT_MS), to }
}
