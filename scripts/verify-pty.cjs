/* Verifies the PTY layer under Electron's exact ABI, headlessly.
   Run with: npm run verify:pty

   Covers everything about a panel except xterm's rendering of the bytes:
   login-shell PATH, spawn/IO, colour escapes, winsize, SIGWINCH on resize,
   agent CLIs resolving, and that the 16ms flush actually collapses IPC. */
const pty = require('node-pty')
const { execFileSync } = require('node:child_process')
const os = require('node:os')

const results = []
const ok = (n, pass, detail) => { results.push({ n, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${detail ? ' — ' + detail : ''}`) }

// Reproduce shell-env's probe exactly.
const DELIM = '__TERMINAL_CANVAS_ENV__'
const out = execFileSync(process.env.SHELL || '/bin/zsh', ['-ilc', `echo ${DELIM}; env; echo ${DELIM}`],
  { encoding: 'utf8', timeout: 5000, maxBuffer: 1024 * 1024, env: { ...process.env, TERM: 'dumb' } })
const block = out.slice(out.indexOf(DELIM) + DELIM.length, out.lastIndexOf(DELIM))
const loginEnv = {}
for (const line of block.split('\n')) { const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line); if (m) loginEnv[m[1]] = m[2] }
const env = { ...loginEnv, TERM: 'xterm-256color', COLORTERM: 'truecolor' }

ok('1 login-shell PATH resolved', !!env.PATH && env.PATH.split(':').length > 5, `${env.PATH.split(':').length} entries`)

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const cols = opts.cols || 120, rows = opts.rows || 30
    const p = pty.spawn(cmd, args, { name: 'xterm-256color', cols, rows, cwd: os.homedir(), env })
    let buf = ''
    let chunks = 0
    const t = setTimeout(() => { try { p.kill() } catch {} }, opts.timeout || 8000)
    p.onData((d) => { buf += d; chunks++; if (opts.onData) opts.onData(d, p) })
    p.onExit(({ exitCode }) => { clearTimeout(t); resolve({ buf, chunks, exitCode, pid: p.pid }) })
    if (opts.input) setTimeout(() => p.write(opts.input), opts.inputDelay || 400)
  })
}

;(async () => {
  // 2. spawn + input + output
  const r2 = await run('/bin/zsh', [], { input: "echo READY-$((6*7))\rexit\r", timeout: 8000 })
  ok('2 spawn, stdin write, stdout read', r2.buf.includes('READY-42'), `pid ${r2.pid}`)

  // 3. 256-color + truecolor escape sequences survive the PTY
  const r3 = await run('/bin/zsh', ['-lc',
    `printf '\\033[38;5;196mRED256\\033[0m\\n'; printf '\\033[38;2;255;100;0mTRUECOLOR\\033[0m\\n'; echo "TERM=$TERM COLORTERM=$COLORTERM"`])
  ok('3 256-color escapes', r3.buf.includes('\x1b[38;5;196m') && r3.buf.includes('RED256'))
  ok('4 truecolor escapes', r3.buf.includes('\x1b[38;2;255;100;0m'))
  ok('5 TERM/COLORTERM set', /TERM=xterm-256color COLORTERM=truecolor/.test(r3.buf), r3.buf.match(/TERM=\S+ COLORTERM=\S+/)?.[0])

  // 6. cols/rows reach the process as the real winsize (not 80x24)
  const r6 = await run('/bin/zsh', ['-lc', 'echo SIZE:$(tput cols)x$(tput lines)'], { cols: 153, rows: 39 })
  ok('6 winsize at spawn', r6.buf.includes('SIZE:153x39'), r6.buf.match(/SIZE:\d+x\d+/)?.[0])

  // 7. resize propagates SIGWINCH mid-run
  const r7 = await new Promise((resolve) => {
    const p = pty.spawn('/bin/zsh', [], { name: 'xterm-256color', cols: 80, rows: 24, cwd: os.homedir(), env })
    let buf = ''
    p.onData((d) => { buf += d })
    setTimeout(() => p.resize(171, 44), 500)
    setTimeout(() => p.write('echo AFTER:$(tput cols)x$(tput lines)\rexit\r'), 1000)
    p.onExit(() => resolve(buf))
    setTimeout(() => { try { p.kill() } catch {} }, 8000)
  })
  ok('7 resize propagates', r7.includes('AFTER:171x44'), r7.match(/AFTER:\d+x\d+/)?.[0])

  // 8 / 9. `claude` and `codex` resolve on the PTY's PATH and launch. These
  // are facts about the MACHINE, not the code — a runner with neither binary
  // is not a broken PTY layer — so a missing binary is the loud SKIP shape
  // verify:pty-manager 11-15 use for a missing tmux (a literal `true` with the
  // reason and the install line), and a present one is a REAL assertion: the
  // absolute path `which` printed and a version line, both from the PTY.
  //
  // M139. Before this, 8 asserted `.local/bin/claude` (this machine's install
  // path, red on every CI runner for three pushes) and 9 asserted /codex/ —
  // which `codex not found` also matches, so 9 was green on a runner with no
  // codex, a vacuous check standing beside a red one. Both were wrong in the
  // same direction: about the machine, not the layer.
  const agentOnPath = async (n, name, versionRe) => {
    const r = await run('/bin/zsh', ['-lc', `which ${name} && ${name} --version`], { timeout: 20000 })
    const lines = r.buf.trim().split('\n').map((l) => l.replace(/\r$/, ''))
    const which = lines.find((l) => l.startsWith('/') && l.endsWith('/' + name))
    if (which === undefined) {
      ok(`${n} ${name} on PTY PATH (SKIPPED — ${name} not found on the login shell's PATH)`, true, `install ${name} to cover this`)
      return
    }
    ok(`${n} ${name} on PTY PATH`, versionRe.test(r.buf), `${which} | ${lines.slice(1, 2).join(' ')}`)
  }
  await agentOnPath('8', 'claude', /\d+\.\d+\.\d+/)
  await agentOnPath('9', 'codex', /codex-cli \d+\.\d+\.\d+/)

  // 10. throughput: batching must collapse many reads into few flushes
  const FLUSH = 16
  let raw = 0, flushes = 0, pending = [], timer = null
  const r10 = await run('/bin/zsh', ['-lc', 'find /usr /System/Library -type f 2>/dev/null | head -120000'], {
    timeout: 30000,
    onData: (d) => {
      raw++
      pending.push(d)
      if (!timer) timer = setTimeout(() => { flushes++; pending = []; timer = null }, FLUSH)
    }
  })
  if (timer) { clearTimeout(timer); flushes++ }
  const bytes = r10.buf.length
  ok('10 output batching reduces IPC', flushes < raw,
    `${bytes.toLocaleString()} bytes, ${raw} pty reads -> ${flushes} flushes (${(raw / Math.max(flushes,1)).toFixed(1)}x reduction)`)

  console.log('\n' + '='.repeat(60))
  const failed = results.filter(r => !r.pass)
  console.log(`${results.length - failed.length}/${results.length} passed`)
  if (failed.length) { console.log('FAILED: ' + failed.map(f => f.n).join(', ')); process.exit(1) }
  process.exit(0)
})()
