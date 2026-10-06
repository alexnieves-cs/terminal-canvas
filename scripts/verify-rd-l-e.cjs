/* Lane L-E (M446). Settings › Keyboard. rd-l-e.0 stays the seam check.

   Watched red first: before shortcut-overrides.ts, recorder.ts and panes.ts
   existed, this suite was 1/15 (rd-l-e.0 only). The bundle helper returns null
   for a missing entry, and every later check requires the export. */
'use strict'
const { buildSync } = require('esbuild')
const { existsSync, mkdirSync, readFileSync } = require('node:fs')
const { join } = require('node:path')
const { ok, results } = require('./lib/checks.cjs').createChecks()

const ROOT = join(__dirname, '..')
const read = (rel) => {
  const p = join(ROOT, rel)
  return existsSync(p) ? readFileSync(p, 'utf8') : ''
}

const css = read('src/renderer/styles.css')
const contracts = read('src/shared/redesign-contracts.ts')
const own = JSON.parse(read('docs/redesign/ownership.json') || '{}')
const open = '/* ── rd:L-E ── */'
const close = '/* ── /rd:L-E ── */'
ok('rd-l-e.0 seam present',
  css.includes(open) && css.indexOf(close) > css.indexOf(open) &&
  /export type StateTone/.test(contracts) &&
  Array.isArray(own.lanes?.['L-E']) && own.lanes['L-E'].some((g) => g.endsWith('verify-rd-l-e.cjs')),
  'styles.css markers, redesign-contracts StateTone, ownership entry')

const outDir = join(ROOT, 'out', 'verify')
mkdirSync(outDir, { recursive: true })
const alias = { '@shared': join(ROOT, 'src', 'shared'), '@renderer': join(ROOT, 'src', 'renderer') }
function bundle(entryRel, outfile) {
  const entry = join(ROOT, entryRel)
  if (!existsSync(entry)) return null
  try {
    buildSync({ entryPoints: [entry], outfile, bundle: true, platform: 'node', format: 'cjs', alias })
    delete require.cache[outfile]
    return require(outfile)
  } catch (err) {
    console.log(`bundle ${entryRel} failed: ${err && err.message}`)
    return null
  }
}

const O = bundle('src/shared/shortcut-overrides.ts', join(outDir, 'rd-l-e-overrides.cjs')) || {}
const R = bundle('src/renderer/settings/recorder.ts', join(outDir, 'rd-l-e-recorder.cjs')) || {}
const P = bundle('src/renderer/settings/panes.ts', join(outDir, 'rd-l-e-panes.cjs')) || {}
const S = bundle('src/shared/shortcuts.ts', join(outDir, 'rd-l-e-shortcuts.cjs')) || {}

const SHORTCUTS = Array.isArray(S.SHORTCUTS) ? S.SHORTCUTS : []
const byId = (id) => SHORTCUTS.find((row) => row.id === id)

const HEADER = 'Canvas shortcuts always use ⌘ — every bare key belongs to the terminal you\'re typing in.'
const BANNER = '⌘K is also used by claude to clear the screen. The canvas takes it unless a panel is in focus lock (⌘⇧L).'
const RECORDING = 'Recording — press the new shortcut, or Esc to cancel.'

{
  const tidy = typeof O.effectiveShortcuts === 'function' ? O.effectiveShortcuts([]) : []
  const moved = typeof O.proposeOverride === 'function' ? O.proposeOverride('tidy', '⌘⇧Y', []) : null
  const after = moved && moved.ok && typeof O.effectiveShortcuts === 'function' ? O.effectiveShortcuts(moved.overrides) : []
  const tidyAfter = after.find((row) => row.id === 'tidy')
  const aliasAfter = after.find((row) => row.id === 'tidy-alias')
  const others = SHORTCUTS.filter((row) => row.id !== 'tidy').every((row) => after.find((n) => n.id === row.id)?.chord === row.chord)
  ok('rd-keys.merge.1 an override replaces that id\'s chord and leaves every other registry chord',
    tidy.find((row) => row.id === 'tidy')?.chord === '⌘⇧T' &&
    moved?.ok === true && tidyAfter?.chord === '⌘⇧Y' && aliasAfter?.chord === '⌘⌥T' && others,
    JSON.stringify({ tidy: tidyAfter?.chord ?? null, alias: aliasAfter?.chord ?? null, ok: moved?.ok ?? null }))
}

{
  const bare = typeof O.proposeOverride === 'function' ? O.proposeOverride('new-agent', 'N', []) : null
  const kept = bare && bare.ok === false && typeof O.effectiveShortcuts === 'function'
    ? O.effectiveShortcuts([]).find((row) => row.id === 'new-agent')?.chord
    : null
  ok('rd-keys.cmd.1 a canvas chord without ⌘ is refused by the shortcut\'s name and is not stored',
    bare?.ok === false && typeof bare?.reason === 'string' && bare.reason.includes('New agent') && bare.reason.includes('⌘') && kept === '⌘N',
    JSON.stringify(bare))
}

{
  const clash = typeof O.proposeOverride === 'function' ? O.proposeOverride('new-shell', '⌘N', []) : null
  const stored = clash && clash.ok === false ? clash.overrides : 'applied'
  ok('rd-keys.dup.1 a duplicate within a scope names the clashing row and does not apply',
    clash?.ok === false && clash?.clashId === 'new-agent' && typeof clash?.reason === 'string' && clash.reason.includes('New agent') && stored === undefined,
    JSON.stringify(clash))
}

{
  const alias = typeof O.proposeOverride === 'function' ? O.proposeOverride('tidy', '⌘⌥T', []) : null
  const retarget = typeof O.proposeOverride === 'function' ? O.proposeOverride('tidy-alias', '⌘⇧Y', []) : null
  const rows = retarget && retarget.ok && typeof O.effectiveShortcuts === 'function' ? O.effectiveShortcuts(retarget.overrides) : []
  ok('rd-keys.alias.1 tidy-alias keeps ⌘⌥T until it is overridden, and moving Tidy onto that chord clashes with it',
    byId('tidy-alias')?.chord === '⌘⌥T' && byId('tidy-alias')?.aliasOf === 'tidy' &&
    alias?.ok === false && alias?.clashId === 'tidy-alias' &&
    retarget?.ok === true && rows.find((row) => row.id === 'tidy')?.chord === '⌘⇧T' && rows.find((row) => row.id === 'tidy-alias')?.chord === '⌘⇧Y',
    JSON.stringify({ alias, tidy: rows.find((row) => row.id === 'tidy')?.chord ?? null }))
}

{
  const round = typeof O.encodeOverrideList === 'function' && typeof O.parseOverrideList === 'function'
    ? O.parseOverrideList(O.encodeOverrideList([{ id: 'palette', chord: '⌘⇧F' }, { id: 'nope', chord: '⌘N' }, { id: 'tidy', chord: 'not a chord' }]))
    : null
  const back = typeof O.proposeOverride === 'function' ? O.proposeOverride('palette', '⌘K', [{ id: 'palette', chord: '⌘⇧F' }]) : null
  ok('rd-keys.persist.1 a stored override round-trips, an unknown id is dropped, and restoring the registry chord clears it',
    Array.isArray(round) && round.length === 1 && round[0].id === 'palette' && round[0].chord === '⌘⇧F' &&
    back?.ok === true && Array.isArray(back.overrides) && back.overrides.length === 0,
    JSON.stringify({ round, back }))
}

{
  const menuIds = ['spawn-sheet', 'undo', 'redo', 'copy', 'paste', 'tidy-alias', 'flip']
  const fallback = typeof O.acceleratorFor === 'function' && typeof S.electronAccelerator === 'function'
    ? menuIds.filter((id) => O.acceleratorFor(id, []) !== S.electronAccelerator(id))
    : menuIds
  const moved = typeof O.acceleratorFor === 'function' ? O.acceleratorFor('tidy-alias', [{ id: 'tidy-alias', chord: '⌘⇧Y' }]) : null
  ok('rd-keys.accel.1 an empty override list keeps the menu\'s historical accelerators, and a stored chord replaces tidy-alias',
    fallback.length === 0 && S.electronAccelerator?.('tidy-alias') === 'CmdOrCtrl+Alt+T' && moved === 'Shift+CmdOrCtrl+Y',
    JSON.stringify({ fallback, moved }))
}

{
  const event = { metaKey: true, ctrlKey: false, altKey: false, shiftKey: false, code: 'KeyK' }
  const base = typeof O.matchEffective === 'function' && typeof S.matchShortcut === 'function'
    ? O.matchEffective(event, [])?.id === S.matchShortcut(event)?.id
    : false
  const moved = typeof O.matchEffective === 'function'
    ? O.matchEffective(event, [{ id: 'palette', chord: '⌘⇧F' }])?.id
    : null
  const next = typeof O.matchEffective === 'function'
    ? O.matchEffective({ metaKey: true, ctrlKey: false, altKey: false, shiftKey: true, code: 'KeyF' }, [{ id: 'palette', chord: '⌘⇧F' }])?.id
    : null
  ok('rd-keys.match.1 with no overrides the merge matches the registry, and a stored chord is the one that matches',
    base === true && moved !== 'palette' && next === 'palette',
    JSON.stringify({ base, moved, next }))
}

{
  const sections = typeof O.keyboardSections === 'function' ? O.keyboardSections([]) : []
  const rendered = []
  for (const section of sections) {
    for (const row of section.rows || []) {
      rendered.push(row.id)
      if (row.alias) rendered.push(row.alias.id)
    }
  }
  const expectedGroups = []
  for (const row of SHORTCUTS) {
    if (row.aliasOf) continue
    if (!expectedGroups.includes(row.group)) expectedGroups.push(row.group)
  }
  const labelDrift = []
  for (const section of sections) {
    for (const row of section.rows || []) {
      const def = byId(row.id)
      if (!def || def.label !== row.label || def.chord !== row.chord || def.group !== row.group) labelDrift.push(row.id)
    }
  }
  const pane = read('src/renderer/settings/KeyboardPane.tsx')
  const leaked = SHORTCUTS.filter((row) => pane.includes(`'${row.label}'`) || pane.includes(`"${row.label}"`))
  const handGroups = /['"]create['"]\s*,\s*['"]sessions['"]/.test(pane)
  ok('rd-keys.settings.1 rendered rows are the registry: same ids, same labels, group order from the non-alias walk, and the pane does not restate them',
    SHORTCUTS.length > 0 && rendered.length === SHORTCUTS.length && SHORTCUTS.every((row) => rendered.includes(row.id)) &&
    sections.map((section) => section.group).join(',') === expectedGroups.join(',') &&
    labelDrift.length === 0 && pane.includes('keyboardSections') && leaked.length === 0 && !handGroups,
    JSON.stringify({ rendered: rendered.length, registry: SHORTCUTS.length, groups: sections.map((section) => section.group), labelDrift, leaked: leaked.map((row) => row.id), handGroups, pane: pane.length > 0 }))
}

{
  const banner = typeof O.conflictBanner === 'function' ? O.conflictBanner() : null
  const bannerPane = read('src/renderer/settings/KeyboardPane.tsx')
  ok('rd-keys.banner.1 the ⌘K conflict names claude and focus lock, and Change retargets the palette chord',
    banner?.text === BANNER && banner?.changeId === 'palette' && byId('palette')?.chord === '⌘K' && byId('focus-lock')?.chord === '⌘⇧L' &&
    bannerPane.includes('conflictBanner'),
    JSON.stringify(banner))
}

{
  const cancel = typeof R.stepFromKey === 'function' ? R.stepFromKey({ key: 'Escape', code: 'Escape', metaKey: false, altKey: false, shiftKey: false, ctrlKey: false }) : null
  const chord = typeof R.stepFromKey === 'function' ? R.stepFromKey({ key: 'k', code: 'KeyK', metaKey: true, altKey: false, shiftKey: false, ctrlKey: false }) : null
  const bare = typeof R.stepFromKey === 'function' ? R.stepFromKey({ key: 'k', code: 'KeyK', metaKey: false, altKey: false, shiftKey: false, ctrlKey: false }) : null
  const out = typeof R.stepFromKey === 'function' ? R.stepFromKey({ key: 'Escape', code: 'Escape', metaKey: true, altKey: false, shiftKey: false, ctrlKey: false }) : null
  const held = typeof R.stepFromKey === 'function' ? R.stepFromKey({ key: 'Shift', code: 'ShiftLeft', metaKey: false, altKey: false, shiftKey: true, ctrlKey: false }) : null
  const refused = bare?.kind === 'chord' && typeof O.proposeOverride === 'function' ? O.proposeOverride('new-agent', bare.chord, []) : null
  const recordPane = read('src/renderer/settings/KeyboardPane.tsx')
  ok('rd-keys.record.1 Escape cancels, ⌘K records, a modifier alone waits, and a bare key is the chord the canvas rule then refuses',
    R.RECORDING_HINT === RECORDING && recordPane.includes('RECORDING_HINT') &&
    cancel?.kind === 'cancel' && chord?.chord === '⌘K' && bare?.chord === 'K' &&
    out?.chord === '⌘Esc' && held?.kind === 'pending' && refused?.ok === false && refused?.reason?.includes('New agent'),
    JSON.stringify({ cancel, chord, bare, out, held, refused }))
}

{
  const schema = read('src/shared/settings-schema.ts')
  const start = schema.indexOf("id: 'keyboard.overrides'")
  const entry = start === -1 ? '' : schema.slice(schema.lastIndexOf('{', start), schema.indexOf('\n  }', start))
  ok('rd-keys.schema.1 keyboard.overrides is a list, default empty, and not planWritable',
    /type: 'list'/.test(entry) && /default: \[\]/.test(entry) && !/planWritable/.test(entry),
    entry.slice(0, 240))
}

{
  const labels = ['General', 'Appearance', 'Agents', 'Sessions & persistence', 'Keyboard', 'Integrations', 'Privacy & export']
  const panes = typeof P.SETTINGS_PANES === 'object' && P.SETTINGS_PANES ? P.SETTINGS_PANES : []
  const keyboard = panes.find((pane) => pane.id === 'keyboard')
  const hosts = panes.filter((pane) => pane.id !== 'keyboard')
  const emptyHost = hosts.filter((pane) => typeof P.rowsForPane === 'function' && P.rowsForPane(pane.id).length === 0)
  const purposes = panes.filter((pane) => typeof pane.purpose !== 'string' || pane.purpose.trim() === '')
  ok('rd-keys.panes.1 the seven pages are the nav, each says what it is for, and every page except Keyboard hosts schema rows',
    panes.map((pane) => pane.label).join('|') === labels.join('|') && keyboard?.purpose === HEADER &&
    emptyHost.length === 0 && purposes.length === 0 && (keyboard?.categories || []).length === 0,
    JSON.stringify({ labels: panes.map((pane) => pane.label), emptyHost: emptyHost.map((pane) => pane.id), purposes: purposes.map((pane) => pane.id) }))
}

{
  const actions = read('src/renderer/canvas/palette-actions/settings.ts')
  ok('rd-keys.row.1 Open Settings is a row in the settings actions and it opens the page',
    /title:\s*'Open Settings'/.test(actions) && /openSettingsPage\(/.test(actions) && /OPEN_SETTINGS_ROW/.test(actions),
    actions.includes('Open Settings') ? 'row present' : 'row missing')
}

{
  const span = css.slice(css.indexOf(open), css.indexOf(close) + close.length)
  const hex = span.match(/#[0-9a-fA-F]{3,8}/)
  const monoOnPage = /\.rd-settings\s*\{[^}]*font-family:\s*var\(\s*--font-mono/.test(span)
  const kbdMono = /\.rd-settings__kbd\s*\{[^}]*--font-mono/.test(span)
  ok('rd-keys.css.1 the lane span has no hex and mono is only the chord keycap',
    span.includes('.rd-settings') && !hex && !monoOnPage && kbdMono,
    JSON.stringify({ hex: hex && hex[0], monoOnPage, kbdMono }))
}

const passed = results.filter((r) => r.pass).length
console.log('\n' + passed + '/' + results.length + ' passed')
if (results.some((r) => !r.pass)) process.exitCode = 1
