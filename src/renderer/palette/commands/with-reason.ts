import type { Command } from '../palette-model'

/** Present-means-unrunnable, so an undefined reason must not become a key. */
export const withReason = (command: Command, reason: string | undefined): Command =>
  reason === undefined ? command : { ...command, disabledReason: reason }
/**
 * M409 (C5). A row whose SUBJECT does not exist yet — no focused panel, no
 * selection, no folder, no CLI on the PATH — leaves the RESTING list and
 * stays in search. A fresh profile opened ⌘K on 183 rows, 83 of them
 * refused, and the first runnable row sat nineteenth; the list was a list of
 * reasons. Decided ROW BY ROW at the call site (the argument names
 * the missing subject), never by `filterCommands` dropping every disabled
 * row: a row refused for a STATE of a subject that exists ("already locked",
 * "not started") still teaches that state at rest, and `verify:palette` 31
 * pins Rename visible with its reason on purpose. Searching still finds every
 * one, with its reason — hiding them from search would be the bug (check 39).
 * No FOCUS is not no subject (the M409 critic): with panels on the canvas and
 * none clicked into, Open review, Link, Toolbox, Lock/Pin and Export output
 * stay at rest saying "click into a panel first" — the subject is one click
 * away, and that sentence is how a person learns the verb exists. They hide
 * only on a canvas with no panel at all.
 */
export const hiddenAtRestIf = (missing: boolean): { hiddenAtRest?: true } =>
  missing ? { hiddenAtRest: true } : {}
