/* The one ok() every suite used to carry its own copy of, and TC_ONLY.

   WHY A SHARED MODULE. Thirty suites defined the same four-line ok() by
   hand. The copies were byte-identical, which is exactly why nobody could
   add a filter: it would have been thirty edits, and the thirty-first suite
   would have copied whichever version it happened to open.

   WHAT TC_ONLY DOES, AND WHAT IT DOES NOT. `TC_ONLY=chromeless.paint.1 npm
   run verify:panels:core` REPORTS only the checks whose id it names, and the
   suite's exit code is decided by those checks alone. Every check still RUNS.
   Checks in a suite share state in-process — a panel spawned by 12 is the
   panel 13 reads — so skipping work would change what the remaining checks
   observe, and a check that passes only when run alone is a lie told in
   green. What you get is the one line you care about, with nothing else's
   red masking it, not a faster run.

   A FILTER THAT MATCHES NOTHING IS RED. A typo'd id reporting `0/0 passed`
   would read as a green gate for a check that never ran — the three-state
   rule (nothing / unanswered / an answer), applied to the harness itself. So
   a sentinel failure sits in `results` from the start and is removed by the
   first check that matches. Every suite's own summary counts `results`, so
   this needs no change to any of them. Pinned by verify:meta only.1. */
'use strict'

/* Whether a check id answers one TC_ONLY pattern. Exactly; or as a prefix
   followed by a non-alphanumeric (`chromeless` runs `chromeless.paint.1`);
   or a number followed by a letter — this repo's lettered sub-checks (`12`
   runs `12b`). Never a longer number: `12` must not run `120`, nor
   `broadcast.1` run `broadcast.10`. And never a longer word: `chrome` does
   not run `chromeless`. */
const answers = (id, pattern) => {
  if (id === pattern) return true
  if (!id.startsWith(pattern)) return false
  const next = id[pattern.length]
  if (!/[A-Za-z0-9]/.test(next)) return true
  return /[0-9]$/.test(pattern) && /[A-Za-z]/.test(next)
}

/* Absent or blank means no filter, which is every invocation that existed
   before this file. Otherwise comma-separated patterns, blanks dropped. */
const parseOnly = (raw) => {
  const patterns = String(raw ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  return patterns.length ? patterns : null
}

function createChecks(env = process.env) {
  const patterns = parseOnly(env.TC_ONLY)
  const results = []
  const sentinel = patterns
    ? { n: 'TC_ONLY', pass: false, detail: `TC_ONLY=${patterns.join(',')} matched no check in this suite` }
    : null
  if (sentinel) {
    results.push(sentinel)
    console.log(`TC_ONLY=${patterns.join(',')} — reporting only the checks it names; every check still runs`)
  }
  const ok = (n, pass, detail) => {
    if (patterns) {
      const id = String(n).trim().split(/\s+/)[0]
      if (!patterns.some((p) => answers(id, p))) return
      const at = results.indexOf(sentinel)
      if (at !== -1) results.splice(at, 1)
    }
    results.push({ n, pass, detail })
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${detail ? ' — ' + detail : ''}`)
  }
  return { ok, results }
}

module.exports = { createChecks, answers, parseOnly }
