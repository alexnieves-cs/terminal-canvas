/* Measures the distribution of gaps between PTY reads for a real agent CLI,
   so M6c's idleness threshold is a measured number rather than a guess.

   Run with:
     ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/Electron.app/Contents/MacOS/Electron \
       scripts/measure-idleness.cjs claude

   Under Electron-as-node, not plain node, for the same reason verify:pty is:
   node-pty is a native module rebuilt against Electron's ABI by postinstall.

   Drive a REAL session: ask a question that makes the agent think, wait for it
   to finish, ask another. Ctrl+D (or the agent's own exit) prints the table.
   The gaps that matter are the ones DURING a turn — the threshold has to sit
   above them, or a pause mid-thought paints the panel idle. */
const pty = require('node-pty')
const os = require('node:os')

const command = process.argv[2] || process.env.SHELL || '/bin/zsh'
const gaps = []
let last = Date.now()

const proc = pty.spawn(command, process.argv.slice(3), {
  name: 'xterm-256color',
  cols: process.stdout.columns || 120,
  rows: process.stdout.rows || 40,
  cwd: process.cwd(),
  env: process.env
})

proc.onData((data) => {
  const now = Date.now()
  gaps.push(now - last)
  last = now
  process.stdout.write(data)
})

// Raw mode, so keystrokes reach the agent rather than being line-buffered by
// this process — without it you cannot drive an interactive TUI at all.
if (process.stdin.isTTY) process.stdin.setRawMode(true)
process.stdin.on('data', (d) => proc.write(d.toString()))

function percentile(sorted, p) {
  if (sorted.length === 0) return 0
  const i = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
  return sorted[i]
}

function report() {
  const sorted = [...gaps].sort((a, b) => a - b)
  console.log('\n\n--- inter-chunk gaps (ms), %d reads on %s ---', gaps.length, os.platform())
  for (const p of [50, 75, 90, 95, 99, 99.9]) {
    console.log('  p%s\t%d', String(p).padEnd(5), percentile(sorted, p))
  }
  console.log('  max  \t%d', sorted[sorted.length - 1] ?? 0)
  console.log('\nGaps over 1s (these are the turn boundaries, not within-turn pauses):')
  console.log('  ' + sorted.filter((g) => g > 1000).join(', '))
  console.log(
    '\nPick agent.idleAfterMs comfortably ABOVE p99 of the within-turn gaps\n' +
      'and BELOW the smallest turn-boundary gap you care about noticing.'
  )
}

proc.onExit(() => { report(); process.exit(0) })
process.on('SIGINT', () => { report(); process.exit(0) })
