import type { Lesson } from './lessons'
import type { LessonCluster, Proposal } from './lesson-proposal'
import type { LearnedRule } from './lesson-library'

/**
 * M570 (lane O). What the `learn:*` doors answer, named once for main, the
 * bridge and the page. The model lives beside it (`lessons.ts`,
 * `lesson-proposal.ts`); this file is only the wire.
 */

export interface LearnRepo {
  /** The main tree. */
  root: string
  /** Newest first. */
  lessons: Lesson[]
  /** Stored lines that could not be read. */
  skipped: number
  /** M571. The lessons, grouped by the mistake they share — what a proposal is drafted from. */
  clusters: LessonCluster[]
  /** M571. The drafted rules, newest first. */
  proposals: Proposal[]
  /** M576. The library: accepted rules, active and retired, oldest first. */
  rules: LearnedRule[]
}

export interface LearnRead {
  repos: LearnRepo[]
  /** M571. Whether `learn.agents` is on: off, no agent is ever run for a lesson. */
  agents: boolean
}

export type LearnRecordResult = { ok: true; id: string } | { ok: false; reason: string }

/** M571. Draft one rule from these lessons of one repository. */
export interface LearnProposeRequest {
  root: string
  lessonIds: string[]
}

export type LearnProposeResult = { ok: true; proposal: Proposal } | { ok: false; reason: string }

/**
 * M572. A person's answer to a proposal: dismiss it, or (M576) accept a
 * proved draft into the library. M577: `retire` names a library RULE by its
 * id, with an optional reason the library keeps.
 */
export interface LearnDecideRequest {
  root: string
  id: string
  verdict: 'dismiss' | 'accept' | 'retire'
  why?: string
}

export type LearnDecideResult =
  | { ok: true; proposal?: Proposal; rule?: LearnedRule; /** What was deliberately left alone, in a sentence. */ note?: string }
  | { ok: false; reason: string }

/**
 * M573. Replay the task with a draft applied. `brief` and `check` are what the
 * person confirmed on the page (prefilled from the lessons' task); the
 * answer comes back at once with the proposal `proving`, and the verdict
 * lands on it when the replay ends — the page reads again until then.
 */
export interface LearnProveRequest {
  root: string
  id: string
  brief: string
  check: string
}

export type LearnProveResult = { ok: true; proposal: Proposal } | { ok: false; reason: string }
