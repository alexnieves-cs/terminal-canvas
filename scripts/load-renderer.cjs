/* One renderer load, three outcomes, for every real-Electron harness.

   THE FAILURE THIS FILE EXISTS FOR. Three harnesses each opened the built
   renderer the same way:

     await win.loadFile(join(__dirname, '..', 'out', 'renderer', 'index.html'))
       .catch(() => {})

   The `.catch(() => {})` discards the only error that names the cause. The
   window then has no document, and the failure resurfaces at the NEXT
   `executeJavaScript` as Electron's `Script failed to execute, this normally
   means an error was thrown. Check the renderer console for the error.` —
   a message that names neither the file nor the reason, and points the reader
   at a renderer console that was never reached. `shot.cjs`'s own M148 comment
   already fought that sentence one layer too late, by printing renderer
   console output; the load is where the why actually lives.

   Measured, not hypothesised: a full-chain run of `npm run verify` failed in
   `verify:panels:shell` with

     electron: Failed to load URL: file:///…/out/renderer/index.html
               with error: ERR_FILE_NOT_FOUND
     FAIL infrastructure error: Script failed to execute…

   at a moment when that file demonstrably existed — the chain's own
   `npm run build` had written it minutes earlier, and the same suite passed
   96/96 when re-run alone. Only the second line was reported, so the run read
   as "the shell suite is broken" when the truth was "the load flaked". The
   suite's printed total silently went 96 -> 78, and per docs/verify-suites.md
   a total that drops proves nothing about WHICH checks were lost.

   So the two diagnoses are separated and neither is swallowed:

     - ABSENT build      -> throw naming the path and `npm run build`. A person
                            forgot a step; retrying cannot help and would only
                            delay the message.
     - TRANSIENT failure -> retry, with the file's existence already proven.
                            If every attempt fails it throws carrying EVERY
                            attempt's error, so the next occurrence arrives
                            with evidence instead of a shrug.
     - loaded            -> return. A load that needed a retry SAYS so on
                            stdout; a silent recovery is how a flake stays
                            invisible long enough to be rediscovered.

   Retrying is safe here in a way it would not be for a check: this is opening
   a static file into a window that has rendered nothing yet, so an attempt
   that failed left no state behind to confuse the next one. */
'use strict'
const { join } = require('node:path')
const { existsSync, statSync } = require('node:fs')

const RENDERER_HTML = join(__dirname, '..', 'out', 'renderer', 'index.html')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* Loads the built renderer into `win`, or throws with the reason.
   `attempts` is 3 rather than a larger number on purpose: the observed flake
   cleared immediately, and a harness that grinds through ten retries before
   reporting a genuinely broken build has turned a fast red into a slow one. */
const loadRenderer = async (win, { attempts = 3, log = console.log } = {}) => {
  if (!existsSync(RENDERER_HTML)) {
    throw new Error(
      `renderer build absent at ${RENDERER_HTML} — run \`npm run build\` before this suite`)
  }
  const bytes = statSync(RENDERER_HTML).size
  const failures = []
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await win.loadFile(RENDERER_HTML)
      if (failures.length) {
        log(`[harness] renderer loaded on attempt ${attempt} after ${failures.join('; ')}`)
      }
      return
    } catch (error) {
      failures.push(`attempt ${attempt}: ${String((error && error.message) || error)}`)
      // Linear backoff. The flake cleared on its own, so the point of waiting
      // is to not spend all three attempts inside the same bad millisecond.
      if (attempt < attempts) await sleep(250 * attempt)
    }
  }
  throw new Error(
    `renderer failed to load after ${attempts} attempts, though ${RENDERER_HTML} ` +
    `exists and is ${bytes} bytes — ${failures.join('; ')}`)
}

module.exports = { loadRenderer, RENDERER_HTML }
