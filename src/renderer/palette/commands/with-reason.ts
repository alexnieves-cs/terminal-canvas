import type { Command } from '../palette-model'

/** Present-means-unrunnable, so an undefined reason must not become a key. */
export const withReason = (command: Command, reason: string | undefined): Command =>
  reason === undefined ? command : { ...command, disabledReason: reason }