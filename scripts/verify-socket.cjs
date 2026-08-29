/* One knob for every verify suite's tmux socket.

   THE PROBLEM THIS SOLVES IS #49 ONE LAYER DOWN. CLAUDE.md records that two
   copies of the app destroy each other's agents because "TMUX_SOCKET being a
   module constant is what makes both true", and main/index.ts now takes a
   single-instance lock so that cannot happen. The HARNESSES kept the same
   shape: VERIFY_SOCKET and PANELS_SOCKET were module constants with no
   override, and both suites call shutdown() — kill-server — on them. So two
   checkouts running `npm run verify` at the same moment (two git worktrees on
   one machine, a CI matrix, a rebase running beside a feature branch) kill
   each other's tmux sessions mid-run.

   The failure is worse than a conflict, because nothing collides visibly: the
   loser gets a red check in whichever suite happened to be mid-run, in a
   branch that is fine, pointing at code that is correct. Re-running makes it
   go away, which is the response this repo's culture is explicitly against.
   Until worktrees, two simultaneous runs were implausible — the same reason
   M4c could not see the app-level version of this bug.

   A SUFFIX rather than a full socket name, deliberately. Every suite that
   needs a socket owns a DIFFERENT one on purpose — verify-panels.cjs's own
   comment says "verify:pty-manager owns 'terminal-canvas-verify'" — and a
   single full-name override would collapse them onto one socket the moment
   somebody set it for the whole run, reintroducing between two suites exactly
   the collision it was set to prevent between two checkouts. A suffix cannot
   do that: it moves every base name by the same amount and keeps them
   distinct.

   Unset is the production default, so `npm run verify` on one checkout
   behaves exactly as it did before this file existed. */

/** The characters a socket name may contain. tmux puts the socket in a
    directory it derives itself, so the name is a FILENAME: a suffix
    containing a slash would escape that directory, and one containing a NUL
    or a space is a different kind of surprise. Anything outside this set is
    dropped rather than rejected, because a mangled suffix that still runs on
    an isolated socket is strictly better than a suite that refuses to start.*/
const ALLOWED = /[^A-Za-z0-9_-]/g

/**
 * `base` unchanged when TC_VERIFY_SUFFIX is unset, blank, whitespace, or
 * entirely illegal characters; `base-suffix` otherwise.
 *
 * The blank case is not hypothetical and is the reason for the trim: a shell
 * with `TC_VERIFY_SUFFIX=` in it exports an empty string, not undefined —
 * exactly the trap resolveSocket() documents for TC_TMUX_SOCKET, where an
 * empty -L makes tmux fall back to the USER'S OWN default socket, which
 * shutdown() would then kill-server.
 */
function verifySocket(base) {
  const suffix = (process.env.TC_VERIFY_SUFFIX || '').trim().replace(ALLOWED, '')
  return suffix ? `${base}-${suffix}` : base
}

module.exports = { verifySocket }
