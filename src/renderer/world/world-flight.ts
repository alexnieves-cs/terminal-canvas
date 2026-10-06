/**
 * The attention flight (M453). Pure: no three.js, no React, no DOM.
 *
 * The arc is a bow on the floor between two points. Duration follows the
 * distance and is clamped, and reduced motion is a cut (duration 0) rather
 * than a shortened glide. The cursor rule is `nextAttentionId`'s, copied
 * here because `world.ctx.door.1` forbids a world file importing
 * `@renderer/canvas/`. `rd-w5.walk.1` fails if the two ever pick a different
 * next id. This module does not sort and does not build a census: it steps
 * the queue a caller published, which is `useAttentionQueue`'s order.
 */

export const FLIGHT_MIN_MS = 600
export const FLIGHT_MAX_MS = 1200

/** Floor metres that take the span from the minimum to the maximum. A desk is about 3.5. */
const MS_PER_METRE = 80

/** How far the bow stands off the chord, as a fraction of the distance. */
const BOW = 0.22

/** A shell prompt is answered in its terminal. The card says so, and offers no reply. */
export const SHELL_ROOM_SENTENCE = 'A shell prompt is answered in its terminal, never from the room.'

/** Ten minutes, the card's Snooze. The inbox's own snooze is R-093. */
export const SNOOZE_FOR_MS = 10 * 60 * 1000

export interface FloorPoint {
  x: number
  z: number
}

export type JumpDirection = 1 | -1

export type FlightKind = 'approval' | 'question' | 'shell-prompt' | 'failed' | 'recovery'

export interface ShellCard {
  agentId: string
  title: string
  place: string
  prompt: string
  command: string
}

export interface FlightItem {
  panelId: string
  kind: FlightKind
  label: string
  shell?: ShellCard
}

/** What review discard needs before Undo is honest. An empty field is not a revert. */
export interface DiscardOffer {
  root: string
  baseline: string
  subjectId: string
  paths: readonly string[]
}

export interface ApprovedEvent {
  agent: string
  file: string
  panelId: string
  discard: DiscardOffer | null
}

export interface ApprovalToast {
  sentence: string
  /** True only when `discard` can revert this panel. */
  undo: boolean
  /** The other arm. Never both, and never a hold that delays the send. */
  viewDiff: boolean
}

export interface FlightState {
  arc: readonly FloorPoint[]
  span: number
  /** The shot holds the path still. A live flight moves the camera. */
  held: boolean
  generation: number
}

export interface WalkStep {
  id: string
  from: string | null
}

export type ChipPlace = 'done' | 'current' | 'next'

export interface QueueStrip {
  index: number
  total: number
  headline: string
  chips: readonly ChipPlace[]
}

export function floorDistance(from: FloorPoint, to: FloorPoint): number {
  const dx = to.x - from.x
  const dz = to.z - from.z
  if (!Number.isFinite(dx) || !Number.isFinite(dz)) return 0
  return Math.hypot(dx, dz)
}

/**
 * Milliseconds the camera takes. Reduced motion is 0: the rig cuts, and the
 * dotted path is not drawn. Any other flight is at least `FLIGHT_MIN_MS`
 * and at most `FLIGHT_MAX_MS`.
 */
export function flightDuration(distance: number, reduced: boolean): number {
  if (reduced) return 0
  const metres = Number.isFinite(distance) && distance > 0 ? distance : 0
  const raw = metres * MS_PER_METRE
  return Math.round(Math.min(FLIGHT_MAX_MS, Math.max(FLIGHT_MIN_MS, raw)))
}

/** A quadratic bow from `from` to `to`, including both ends. `samples` is at least 2. */
export function flightArc(from: FloorPoint, to: FloorPoint, samples = 24): FloorPoint[] {
  const n = Math.max(2, Math.floor(samples))
  const dx = to.x - from.x
  const dz = to.z - from.z
  const len = Math.hypot(dx, dz)
  const basis = len === 0 ? 1 : len
  const px = -dz / basis
  const pz = dx / basis
  const bow = len * BOW
  const cx = (from.x + to.x) / 2 + px * bow
  const cz = (from.z + to.z) / 2 + pz * bow
  const out: FloorPoint[] = []
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1)
    const u = 1 - t
    out.push({
      x: u * u * from.x + 2 * u * t * cx + t * t * to.x,
      z: u * u * from.z + 2 * u * t * cz + t * t * to.z
    })
  }
  return out
}

/** The point `t` (0 to 1) along the polyline. */
export function flightPoint(arc: readonly FloorPoint[], t: number): FloorPoint {
  if (arc.length === 0) return { x: 0, z: 0 }
  const first = arc[0] ?? { x: 0, z: 0 }
  if (arc.length === 1) return first
  const u = Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 0
  const f = u * (arc.length - 1)
  const i = Math.min(arc.length - 2, Math.floor(f))
  const k = f - i
  const a = arc[i] ?? first
  const b = arc[i + 1] ?? a
  return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k }
}

/** Dots along the arc, about `spacing` metres apart, including the ends. */
export function flightDots(arc: readonly FloorPoint[], spacing: number): FloorPoint[] {
  if (arc.length === 0) return []
  const step = Number.isFinite(spacing) && spacing > 0 ? spacing : 0.45
  const dots: FloorPoint[] = []
  let carried = 0
  const first = arc[0] ?? { x: 0, z: 0 }
  dots.push(first)
  for (let i = 1; i < arc.length; i++) {
    const prev = arc[i - 1] ?? first
    const next = arc[i] ?? prev
    const seg = floorDistance(prev, next)
    if (seg === 0) continue
    carried += seg
    while (carried >= step) {
      const over = carried - step
      const k = (seg - over) / seg
      dots.push({ x: prev.x + (next.x - prev.x) * k, z: prev.z + (next.z - prev.z) * k })
      carried = over
    }
  }
  const last = arc[arc.length - 1] ?? first
  const tail = dots[dots.length - 1] ?? first
  if (floorDistance(tail, last) > step * 0.25) dots.push(last)
  return dots
}

/**
 * The same walk as `nextAttentionId`. Forward is the oldest waiting item
 * next; a stale cursor restarts from the end the direction implies.
 */
export function attentionStep(queue: readonly string[], current: string | null, direction: JumpDirection): string | null {
  if (queue.length === 0) return null
  const at = current === null ? -1 : queue.indexOf(current)
  if (at === -1) return direction === 1 ? (queue[0] ?? null) : (queue[queue.length - 1] ?? null)
  return queue[(at + direction + queue.length) % queue.length] ?? null
}

/** One chip per id. The current id is filled; earlier ids are done; the rest are next. */
export function queueStrip(ids: readonly string[], current: string | null): QueueStrip {
  const total = ids.length
  if (total === 0) return { index: 0, total: 0, headline: '', chips: [] }
  let at = current === null ? -1 : ids.indexOf(current)
  if (at < 0) at = 0
  const chips: ChipPlace[] = ids.map((_, i) => (i < at ? 'done' : i === at ? 'current' : 'next'))
  const index = at + 1
  return { index, total, headline: `NEEDS YOU · ${index} of ${total}`, chips }
}

export function shellCard(kind: FlightKind | string): boolean {
  return kind === 'shell-prompt'
}

export function shellFromItem(item: FlightItem, place: string): ShellCard {
  if (item.shell !== undefined) return item.shell
  return {
    agentId: item.panelId,
    title: item.label,
    place,
    prompt: item.label,
    command: ''
  }
}

/** A `Name — task` label keeps the name. The toast says Codex, not the whole panel title. */
export function agentShort(name: string): string {
  const cut = name.split(/\s+[—–]\s+/)[0]?.trim() ?? ''
  return cut !== '' ? cut : 'the agent'
}

/** The first filename in the question, else in the diff, else a plain word so the sentence still reads. */
export function fileOf(question: string, diff: string): string {
  return fileIn(question) ?? fileIn(diff) ?? 'the file'
}

function fileIn(text: string): string | null {
  const match = text.match(/\b[\w.-]+\.[A-Za-z][\w]*\b/)
  return match === null ? null : (match[0] ?? null)
}

export function discardReady(offer: DiscardOffer | null | undefined): offer is DiscardOffer {
  if (offer == null) return false
  if (offer.root.trim() === '' || offer.baseline.trim() === '' || offer.subjectId.trim() === '') return false
  return offer.paths.length > 0 && offer.paths.every((path) => path.trim() !== '')
}

/** D9 option B. The send has already happened. Undo exists only beside a real discard. */
export function approvalToast(input: { agent: string; file: string; discard: DiscardOffer | null }): ApprovalToast {
  const undo = discardReady(input.discard)
  const agent = input.agent.trim() || 'the agent'
  const file = input.file.trim() || 'the file'
  return {
    sentence: `Approved ${agent}'s edit to ${file}`,
    undo,
    viewDiff: !undo
  }
}

// ── the published queue ─────────────────────────────────────────────────────
// The pill writes this (R-090). The shot writes it too. Nothing here reorders.

export interface AttentionSnapshot {
  items: readonly FlightItem[]
  cursor: string | null
  shell: ShellCard | null
  flight: FlightState | null
  fullDiff: string | null
}

let queue: readonly FlightItem[] = []
let queueKey = ''
let cursor: string | null = null
let shell: ShellCard | null = null
let flight: FlightState | null = null
let fullDiff: string | null = null
const snoozes = new Map<string, number>()
let snapshot: AttentionSnapshot = { items: queue, cursor, shell, flight, fullDiff }

const listeners = new Set<() => void>()
const walkListeners = new Set<(step: WalkStep) => void>()
const approvedListeners = new Set<(event: ApprovedEvent) => void>()

function emit(): void {
  snapshot = { items: queue, cursor, shell, flight, fullDiff }
  for (const listener of listeners) listener()
}

export function attentionSnapshot(): AttentionSnapshot {
  return snapshot
}

export function subscribeFlight(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function flightQueue(): readonly FlightItem[] {
  return queue
}

export function attentionCursor(): string | null {
  return cursor
}

export function publishFlightQueue(items: readonly FlightItem[]): void {
  const key = items.map((item) => `${item.panelId}\0${item.kind}\0${item.label}`).join('\n')
  if (key === queueKey) return
  queueKey = key
  queue = items
  emit()
}

export function setAttentionCursor(id: string | null): void {
  if (id === cursor) return
  cursor = id
  emit()
}

export function showShell(next: ShellCard | null): void {
  shell = next
  emit()
}

export function isSnoozed(id: string, now: number): boolean {
  return (snoozes.get(id) ?? 0) > now
}

export function snoozePanel(id: string, now: number): void {
  snoozes.set(id, now + SNOOZE_FOR_MS)
  emit()
}

function openIds(now: number): string[] {
  return queue.filter((item) => !isSnoozed(item.panelId, now)).map((item) => item.panelId)
}

/** Step the published queue. Snoozed ids are skipped. The cursor moves only when there is a next. */
export function walkAttention(direction: JumpDirection, now = Date.now()): WalkStep | null {
  const open = openIds(now)
  const from = cursor
  const id = attentionStep(open, cursor, direction)
  if (id === null) return null
  cursor = id
  const step: WalkStep = { id, from }
  emit()
  for (const listener of walkListeners) listener(step)
  return step
}

export function subscribeWalk(listener: (step: WalkStep) => void): () => void {
  walkListeners.add(listener)
  return () => { walkListeners.delete(listener) }
}

export function beginFlight(from: FloorPoint, to: FloorPoint, reduced: boolean): FlightState {
  const span = flightDuration(floorDistance(from, to), reduced)
  const arc = span === 0 ? [to] : flightArc(from, to, 28)
  flight = { arc, span, held: false, generation: (flight?.generation ?? 0) + 1 }
  emit()
  return flight
}

/** The shot's path: drawn, not animated, so the capture is not mid-transition. */
export function holdFlight(from: FloorPoint, to: FloorPoint): FlightState {
  flight = {
    arc: flightArc(from, to, 28),
    span: flightDuration(floorDistance(from, to), false),
    held: true,
    generation: (flight?.generation ?? 0) + 1
  }
  emit()
  return flight
}

export function currentFlight(): FlightState | null {
  return flight
}

export function clearFlight(): void {
  if (flight === null) return
  flight = null
  emit()
}

export function requestFullDiff(panelId: string): void {
  fullDiff = panelId
  emit()
}

export function emitApproved(event: ApprovedEvent): void {
  for (const listener of approvedListeners) listener(event)
}

export function subscribeApproved(listener: (event: ApprovedEvent) => void): () => void {
  approvedListeners.add(listener)
  return () => { approvedListeners.delete(listener) }
}

/** Tests start from an empty room. The app does not call this. */
export function resetAttention(): void {
  queue = []
  queueKey = ''
  cursor = null
  shell = null
  flight = null
  fullDiff = null
  snoozes.clear()
  emit()
}
