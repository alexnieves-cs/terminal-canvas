/* Lane W0 (M448). rd-w0.0 stays the seam. parity.1, identity.1 and night.1
   were watched red against the candy shells and the pale ground
   (world-palette.ts:#a6f6ff, three tints inside ΔE 20, night wiring absent)
   before NIGHT, SHELL and stateHexForAgent landed. */
'use strict'
const { readFileSync, readdirSync, statSync } = require('node:fs')
const { join } = require('node:path')
const { buildSync } = require('esbuild')
const { ok, results } = require('./lib/checks.cjs').createChecks()

const ROOT = join(__dirname, '..')
const css = readFileSync(join(ROOT, 'src', 'renderer', 'styles.css'), 'utf8')
const contracts = readFileSync(join(ROOT, 'src', 'shared', 'redesign-contracts.ts'), 'utf8')
const own = JSON.parse(readFileSync(join(ROOT, 'docs', 'redesign', 'ownership.json'), 'utf8'))
const open = '/* ── rd:W0 ── */'
const close = '/* ── /rd:W0 ── */'
ok('rd-w0.0 seam present',
  css.includes(open) && css.indexOf(close) > css.indexOf(open) &&
  /export type StateTone/.test(contracts) &&
  Array.isArray(own.lanes['W0']) && own.lanes['W0'].some((g) => g.endsWith('verify-rd-w0.cjs')),
  'styles.css markers, redesign-contracts StateTone, ownership entry')

const OUT = join(ROOT, 'out', 'verify', 'rd-w0.cjs')
buildSync({
  stdin: {
    contents: `
      import { NIGHT, ROBOT_TINTS, SHELL, stateHexForAgent } from '../src/renderer/world/world-palette'
      import { STATE_PALETTE, stateHexes } from '../src/shared/state-palette'
      export { NIGHT, ROBOT_TINTS, SHELL, stateHexForAgent, STATE_PALETTE, stateHexes }
    `,
    resolveDir: __dirname,
    sourcefile: 'rd-w0-entry.ts',
    loader: 'ts'
  },
  outfile: OUT,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  logLevel: 'silent',
  alias: {
    '@shared': join(ROOT, 'src/shared'),
    '@renderer': join(ROOT, 'src/renderer')
  }
})
const M = require(OUT)

function srgbToLinear(channel) {
  const c = channel / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}
function lab(hex) {
  const n = parseInt(hex.slice(1), 16)
  const r = srgbToLinear((n >> 16) & 255)
  const g = srgbToLinear((n >> 8) & 255)
  const b = srgbToLinear(n & 255)
  const x = r * 0.4124564 + g * 0.3575761 + b * 0.1804375
  const y = r * 0.2126729 + g * 0.7151522 + b * 0.0721750
  const z = r * 0.0193339 + g * 0.1191920 + b * 0.9503041
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  const fx = f(x / 0.95047)
  const fy = f(y / 1)
  const fz = f(z / 1.08883)
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}
function deltaE(a, b) {
  const A = lab(a)
  const B = lab(b)
  return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2])
}

const STATE = [
  M.STATE_PALETTE.dark['--state-working'],
  M.STATE_PALETTE.dark['--state-needs'],
  M.STATE_PALETTE.dark['--state-done'],
  M.STATE_PALETTE.dark['--state-failed'],
  M.STATE_PALETTE.dark['--state-idle']
]

{
  const hexes = new Set(M.stateHexes())
  const walk = (dir) => readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
  const offenders = []
  for (const file of walk(join(ROOT, 'src', 'renderer', 'world'))) {
    if (!/\.tsx?$/.test(file)) continue
    const text = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
    for (const m of text.matchAll(/#[0-9a-fA-F]{6}\b/g)) {
      if (hexes.has(m[0].toLowerCase())) offenders.push(`${file.slice(ROOT.length + 1)}:${m[0]}`)
    }
  }
  ok('rd-world.parity.1 every state colour in world/ is read from state-palette; a literal state hex fails',
    offenders.length === 0 &&
      M.stateHexForAgent('waiting_approval') === M.STATE_PALETTE.dark['--state-needs'] &&
      M.stateHexForAgent('error') === M.STATE_PALETTE.dark['--state-failed'] &&
      M.stateHexForAgent('idle') === M.STATE_PALETTE.dark['--state-idle'] &&
      M.stateHexForAgent('thinking') === M.STATE_PALETTE.dark['--state-working'] &&
      M.NIGHT.amber === M.STATE_PALETTE.dark['--state-needs'] &&
      M.NIGHT.ground === '#0b0d12',
    offenders.slice(0, 6).join(', ') || 'clean')
}

{
  const near = M.ROBOT_TINTS.map((hex) => {
    const hit = STATE.map((s) => deltaE(hex, s))
    return { hex, min: Math.min(...hit) }
  }).filter((row) => row.min < 20)
  ok('rd-world.identity.1 no chest-light hue is within Delta-E 20 of a state colour',
    M.ROBOT_TINTS.length >= 2 && near.length === 0 && deltaE(M.SHELL, M.STATE_PALETTE.dark['--state-idle']) >= 20,
    near.map((row) => `${row.hex}:${row.min.toFixed(1)}`).join(', ') || 'clear')
}

{
  const span = css.slice(css.indexOf(open), css.indexOf(close))
  const robot = readFileSync(join(ROOT, 'src', 'renderer', 'world', 'WorldRobot.tsx'), 'utf8')
  const roster = readFileSync(join(ROOT, 'src', 'renderer', 'world', 'world-roster.ts'), 'utf8')
  ok('rd-world.night.1 the room is the night palette, shells are the neutral, state rides the eyes and the floor ring, and a failed or idle agent stays',
    /new THREE\.Color\(NIGHT\.ground\)/.test(readFileSync(join(ROOT, 'src', 'renderer', 'world', 'WorldView.tsx'), 'utf8')) &&
      /new THREE\.Color\(SHELL\)/.test(robot) &&
      /stateHexForAgent\(/.test(robot) &&
      /geometry=\{k\.antenna\}/.test(robot) &&
      /here\.home \?\? here\.seat/.test(robot) &&
      !/goal === 'table'/.test(robot) &&
      /!isLiveStatus\(record\.status\)/.test(roster) &&
      /--state-working/.test(span) &&
      /data-badge="quiet"/.test(span) &&
      /--state-idle/.test(span) &&
      /--state-done/.test(span),
    'night wiring')
}

const passed = results.filter((r) => r.pass).length
console.log('\n' + passed + '/' + results.length + ' passed')
if (results.some((r) => !r.pass)) process.exitCode = 1
