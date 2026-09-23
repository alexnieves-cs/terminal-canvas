/**
 * Brief #20. Recoverable problems found while restoring, before React mounts.
 *
 * `renderer/main.tsx`'s boot catches two failures and degrades safely — a
 * layout that would not load opens a fresh canvas, a session list that would
 * not answer restores every panel stopped — and until this module both were
 * told only to the console, which is to say to nobody. They are written here
 * in a person's words and read ONCE by the reopen notice, which keeps them on
 * screen until they are acknowledged. A toast would be the wrong shape: the
 * canvas stays different for the whole session (see shell/toast.ts's header).
 *
 * Module state rather than a prop, so no harness entry that mounts Canvas has
 * to learn a new argument; a harness that never writes here reads empty.
 */
const issues: string[] = []

export function noteBootIssue(sentence: string): void {
  if (!issues.includes(sentence)) issues.push(sentence)
}

export function bootIssues(): readonly string[] {
  return issues
}
