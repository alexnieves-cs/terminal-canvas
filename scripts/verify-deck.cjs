/* M248 — verify:deck. The deck's split, its per-slide diff, the GENERIC draft
   review it keys on, the view record's three states, the portable strip, the
   slide grammar's option, and the PDF core over fake deps. Plain node.

   Written before the modules existed and watched failing: every lookup below is
   optional-chained so an absent export is a RED check rather than a throw (a
   throw aborts the run, and every check after it would never execute — see
   docs/verify-suites.md). */
const { buildSync } = require('esbuild')
const { existsSync, mkdirSync, mkdtempSync, writeFileSync, readFileSync, rmSync } = require('node:fs')
const { join } = require('node:path')
const { ok, results } = require('./lib/checks.cjs').createChecks()
const root = join(__dirname, '..')
let M = {}
try {
  if (existsSync(join(root, 'src/shared/deck.ts'))) {
    mkdirSync(join(root, 'out/verify'), { recursive: true })
    buildSync({ entryPoints: [join(__dirname, 'deck-entry.cjs')], outfile: join(root, 'out/verify/deck.cjs'), bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent',
      alias: { '@shared': join(root, 'src/shared'), '@renderer': join(root, 'src/renderer') } })
    M = require('../out/verify/deck.cjs')
  }
} catch (error) { console.log(`deck bundle did not build: ${error.message.split('\n')[0]}`) }
const D = M.deck ?? {}, R = M.draft ?? {}, S = M.session ?? {}, MD = M.md ?? {}, P = M.pdf ?? {}
const call = (fn, ...args) => { try { return typeof fn === 'function' ? fn(...args) : undefined } catch (e) { return { threw: String(e) } } }
const sources = (text) => call(D.splitDeck, text)?.slides?.map((s) => s.source)

// ---- split -----------------------------------------------------------------
const fm = '---\nmarp: true\ntheme: default\n---\n'
const fenced = '# One\n\n```md\n---\n```\n\n---\n\n## Two\n\n~~~\n---\n~~~\n\n---\n\n````\n```\n---\n```\n````\n'
const split = call(D.splitDeck, fm + fenced)
ok('deck.split.1 a --- inside a ``` fence, a ~~~ fence and a 4-backtick fence holding a 3-backtick one is not a break',
  split?.slides?.length === 3 && split.slides[2].source.includes('````'), JSON.stringify(split?.slides?.map((s) => s.source)))
ok('deck.split.2 front matter is kept verbatim and is not a slide',
  split?.frontMatter?.start === 0 && (fm + fenced).slice(split.frontMatter.start, split.frontMatter.end) === fm && !split.slides[0].source.includes('marp'))
ok('deck.split.3 *** and - - - are thematic breaks, not slide breaks; "--- " with text is not one either',
  sources('a\n\n***\n\nb\n\n- - -\n\nc\n--- x\n')?.length === 1 && sources('a\n---\nb\n')?.length === 2)
const crlf = '---\r\ntitle: x\r\n---\r\n# A\r\n\r\n---\r\n# B\r\n<!-- notes say hello -->\r\n---\r\n# C'
ok('deck.split.4 byte-exact round trip — CRLF, front matter, a last slide with no newline — through rebuildDeck of the unchanged sources',
  call(D.rebuildDeck, crlf, sources(crlf)) === crlf && call(D.rebuildDeck, fm + fenced, sources(fm + fenced)) === fm + fenced)
ok('deck.split.6 a deck opening with --- # Title --- keeps that slide (a heading is not YAML), as does --- Agenda: today --- (prose, no lowercase key)',
  sources('---\n# Title\n---\n# Two\n')?.length === 3 && sources('---\nAgenda: today\n---\n# Two\n')?.length === 3 && call(D.splitDeck, fm + '# A\n')?.frontMatter !== null)
ok('deck.split.7 a backtick "fence" with a backtick after it is inline code, not a fence that swallows the deck',
  sources('# A\n\n```js``` inline\n\n---\n\n# B\n')?.length === 2)
const notes = call(D.splitDeck, crlf)?.slides?.[1]
ok('deck.notes.1 <!-- notes … --> is pulled out of the rendered body and kept in the source',
  notes?.notes?.[0] === 'say hello' && !notes.body.includes('notes') && notes.source.includes('<!-- notes say hello -->'), JSON.stringify(notes))
ok('deck.split.5 every slide carries its source span into the file',
  split?.slides?.every((s) => (fm + fenced).slice(s.start, s.end) === s.source) === true)

// ---- generic draft review, on NON-slide items -----------------------------
{
  const before = new Map([['a1', 1], ['b2', 2], ['c3', 3]])
  const after = new Map([['a1', 1], ['b2', 20], ['d4', 4]])
  const items = call(R.diffItems, before, after)
  ok('draft.diff.1 diffItems over cells: one changed, one added, one removed — absent is null — and an unchanged key is no item',
    Array.isArray(items) && items.length === 3 && items.some((i) => i.id === 'b2' && i.old === 2 && i.new === 20) &&
      items.some((i) => i.id === 'd4' && i.old === null && i.new === 4) && items.some((i) => i.id === 'c3' && i.old === 3 && i.new === null), JSON.stringify(items))
  const draft = { baseHash: call(R.hashText, 'base'), by: 'ch1', at: 5, items: items ?? [] }
  const kept = call(R.keep, draft, ['b2'])
  ok('draft.keep.1 keep hands back exactly the kept items to apply and the rest as the remaining draft, base and author untouched',
    kept?.apply?.length === 1 && kept.apply[0].id === 'b2' && kept.remaining?.items?.length === 2 && kept.remaining.baseHash === draft.baseHash && kept.remaining.by === 'ch1')
  const dropped = call(R.discard, draft, ['b2', 'c3', 'd4'])
  ok('draft.discard.1 discard applies nothing, and discarding the last item leaves NO draft (null, never an empty one)',
    dropped?.apply?.length === 0 && dropped.remaining === null && call(R.keep, draft, 'all')?.remaining === null && call(R.keep, draft, 'all')?.apply?.length === 3)
  ok('draft.state.1 draftState is three-state: none without a draft, pending on its base, conflict once the disk moved',
    call(R.draftState, null, 'h') === 'none' && call(R.draftState, draft, draft.baseHash) === 'pending' && call(R.draftState, draft, call(R.hashText, 'moved')) === 'conflict')
  ok('draft.hash.1 hashText is stable and separates near texts', call(R.hashText, 'abc') === call(R.hashText, 'abc') && call(R.hashText, 'abc') !== call(R.hashText, 'abd') && call(R.hashText, 'a\r\n') !== call(R.hashText, 'a\n'))
  const src = existsSync(join(root, 'src/shared/draft-review.ts')) ? readFileSync(join(root, 'src/shared/draft-review.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '') : 'slide'
  ok('draft.generic.1 draft-review.ts names no slide or deck and imports nothing', !/slide|deck/i.test(src) && !/\bimport\b/.test(src))
}

// ---- per-slide diff and keep ----------------------------------------------
const five = ['# 1\n', '# 2\n', '# 3\n', '# 4\n', '# 5\n']
const deckOf = (slides) => fm + slides.join('---\n')
const base = deckOf(five)
{
  const inserted = deckOf([five[0], '# new\n', ...five.slice(1)])
  const d1 = call(D.diffSlides, base, inserted)
  ok('deck.diff.1 inserting slide 2 of 5 is exactly ONE added item (LCS on the slide hash), not four changed ones',
    Array.isArray(d1) && d1.length === 1 && d1[0].old === null && d1[0].new?.text === '# new\n' && d1[0].id === '2', JSON.stringify(d1))
  const edited = deckOf([...five.slice(0, 2), '# three!\n', ...five.slice(3)])
  const d2 = call(D.diffSlides, base, edited)
  ok('deck.diff.2 editing slide 3 is exactly one changed item carrying both sides',
    Array.isArray(d2) && d2.length === 1 && d2[0].old?.text === '# 3\n' && d2[0].new?.text === '# three!\n' && d2[0].id === '3', JSON.stringify(d2))
  const removed = call(D.diffSlides, base, deckOf([five[0], ...five.slice(2)]))
  ok('deck.diff.3 removing slide 2 is one removed item named r2', removed?.length === 1 && removed[0].id === 'r2' && removed[0].new === null)

  const proposal = deckOf([five[0], '# new\n', five[1], '# three!\n', five[3]])
  const draft = call(D.slideDraft, base, proposal, 'ch1', 7)
  const ids = draft?.items?.map((i) => i.id)
  ok('deck.draft.1 a proposal stages add + change + remove against the disk hash', JSON.stringify(ids) === JSON.stringify(['2', '4', 'r5']) && draft.baseHash === call(R.hashText, base), JSON.stringify(ids))
  const partial = call(D.applyKept, base, draft, ['4'])
  ok('deck.keep.1 a partial keep splices ONLY the kept slide into the disk text; the rest stays a draft',
    partial?.kind === 'applied' && partial.text === deckOf([five[0], five[1], '# three!\n', five[3], five[4]]) && JSON.stringify(partial.remaining?.items.map((i) => i.id)) === JSON.stringify(['2', 'r5']), JSON.stringify(partial))
  const all = call(D.applyKept, base, draft, 'all')
  ok('deck.keep.2 keeping everything reproduces the proposal byte for byte, and leaves no draft', all?.kind === 'applied' && all.text === proposal && all.remaining === null)
  const discarded = call(D.applyKept, base, draft, [])
  ok('deck.keep.3 a keep of nothing leaves the text Buffer-identical', discarded?.kind === 'applied' && Buffer.compare(Buffer.from(discarded.text), Buffer.from(base)) === 0)
  const conflict = call(D.applyKept, base.replace('# 4', '# four'), draft, ['4'])
  ok('deck.conflict.1 a disk that moved since the draft is a named conflict — never a merge', conflict?.kind === 'conflict' && /slide/.test(conflict.reason) && /4/.test(conflict.reason), JSON.stringify(conflict))
  ok('deck.keep.4 an unknown slide id is refused by name', call(D.applyKept, base, draft, ['9'])?.kind === 'refused')
  const rbase = deckOf(five), rprop = deckOf(['# one!\n', ...five.slice(1, 4)])
  const rdraft = call(D.slideDraft, rbase, rprop, 'ch1', 1)
  const rkept = call(D.applyKept, rbase, rdraft, ['1'])
  ok('deck.keep.5 a removal keeps its ORIGINAL id after a keep above it (r5 stays r5, never r6)',
    JSON.stringify(rdraft?.items?.map((i) => i.id)) === JSON.stringify(['1', 'r5']) && JSON.stringify(rkept?.remaining?.items?.map((i) => i.id)) === JSON.stringify(['r5']) &&
      call(D.applyKept, rkept?.text, rkept?.remaining, ['r5'])?.text === rprop, JSON.stringify(rkept?.remaining?.items))
  ok('deck.proposal.1 proposalText is the disk with every item applied', call(D.proposalText, base, draft) === proposal && call(D.proposalText, base, null) === base)
  ok('deck.summary.1 the header fact: slide N of M, and a change count only above zero',
    call(D.deckSummary, base, { slide: 1 }) === 'slide 2 of 5' && call(D.deckSummary, base, {}) === 'slide 1 of 5' &&
      call(D.deckChanges, { draft }) === '3 slide changes' && call(D.deckChanges, {}) === '' && call(D.deckChanges, { draft: { ...draft, items: draft.items.slice(0, 1) } }) === '1 slide change')
}

// ---- the record's three states and every copy site ------------------------
{
  const view = { slide: 2, draft: call(D.slideDraft, base, deckOf(five.slice(1)), 'ch1', 1) }
  ok('deck.record.1 parseDeckView: absent, malformed and a view with an unknown key stay distinct',
    call(D.parseDeckView, undefined)?.kind === 'absent' && call(D.parseDeckView, 'x')?.kind === 'malformed' && call(D.parseDeckView, { slide: -1 })?.kind === 'malformed' &&
      call(D.parseDeckView, { draft: { baseHash: 1 } })?.kind === 'malformed' && call(D.parseDeckView, { future: 1, ...view })?.kind === 'view' &&
      JSON.stringify(call(D.parseDeckView, view)?.view) === JSON.stringify(view))
  const persisted = { id: 'f1', kind: 'file', x: 0, y: 0, w: 400, h: 300, z: 1, source: { path: '/tmp/d.md', deck: view } }
  const warnings = []
  const parsedSrc = M.layout?.parseLayout ? null : null
  const panel = call(M.panels?.makeFilePanel, 'f1', { x: 0, y: 0 }, 1, { path: '/tmp/d.md', deck: view })
  const plain = call(M.panels?.makeFilePanel, 'f2', { x: 0, y: 0 }, 1, { path: '/tmp/e.md' })
  ok('deck.record.2 makeFilePanel carries the deck view and never introduces the key on an ordinary file',
    JSON.stringify(panel?.source?.deck) === JSON.stringify(view) && plain?.source !== undefined && !('deck' in plain.source))
  const round = call(M.adapt?.fromPanels, call(M.adapt?.toPanels, [persisted]) ?? [])
  ok('deck.record.3 toPanels/fromPanels keep the view; an ordinary file stays without the key',
    JSON.stringify(round?.[0]?.source?.deck) === JSON.stringify(view) && !('deck' in (call(M.adapt?.fromPanels, call(M.adapt?.toPanels, [{ ...persisted, source: { path: '/x.md' } }]) ?? [])?.[0]?.source ?? { deck: 1 })))
  const lay = call(M.layout?.parseLayout, JSON.stringify({ version: 1, activeWorkspaceId: 'w1', settings: { layout: true, camera: true, focus: true },
    workspaces: [{ id: 'w1', name: 'Canvas', camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null,
      panels: [persisted, { ...persisted, id: 'f3', source: { path: '/tmp/d.md', deck: 'bad' } }] }] }))
  const kept = lay?.snapshot?.workspaces?.[0]?.panels ?? []
  ok('deck.record.4 the layout parser keeps a valid view and drops a malformed one BY NAME, keeping the panel',
    JSON.stringify(kept.find((p) => p.id === 'f1')?.source?.deck) === JSON.stringify(view) && kept.some((p) => p.id === 'f3' && !('deck' in p.source)) &&
      (lay?.warnings ?? []).some((w) => /f3/.test(w) && /malformed deck view/.test(w)), JSON.stringify(lay?.warnings))
  void warnings; void parsedSrc
  const port = call(M.portable?.buildPortable, { workspaceName: 'w', panels: [persisted], templates: [], app: '5.0.0', now: 1 })
  const hostile = port && { ...port, workspace: { ...port.workspace, panels: [persisted] } }
  const remapped = call(M.portable?.remapPortable, hostile, (p) => p + 'n')
  ok('deck.portable.1 export carries deck: {} — no draft, no slide — and a hostile import is stripped the same way',
    JSON.stringify(port?.workspace?.panels?.[0]?.source?.deck) === '{}' && JSON.stringify(remapped?.workspace?.panels?.[0]?.source?.deck) === '{}' && !JSON.stringify(port).includes('baseHash'))
}

// ---- the slide grammar is an OPTION; chat's grammar is unchanged -----------
{
  const t = '![a cat](cat.png)\n\n| a | b |\n|---|:-:|\n| 1 | **2** |\n'
  const chat = call(MD.parseMarkdown, t)
  const slide = call(MD.parseMarkdown, t, { slides: true })
  ok('deck.md.1 without the option an image line is its alt text and a table is code (md.1\'s grammar, untouched)',
    chat?.map((b) => b.kind).join(',') === 'paragraph,code' && chat[0].children[0].text === 'a cat')
  ok('deck.md.2 with { slides: true } an image line is an image block and a table has a header row and body rows',
    slide?.map((b) => b.kind).join(',') === 'image,table' && slide[0].src === 'cat.png' && slide[0].alt === 'a cat' &&
      slide[1].header.length === 2 && slide[1].rows.length === 1 && slide[1].rows[0][1][0].kind === 'bold' && slide[1].align?.[1] === 'center', JSON.stringify(slide))
  const html = call(D.markdownHtml, '# T <b>\n\n![x](http://evil/x.png) ![y](y.png)\n\n![z](z.png)\n\n![w](https://w/w.png)', (src) => src === 'z.png' ? { kind: 'data', url: 'data:image/png;base64,AA' } : { kind: 'missing' })
  ok('deck.html.1 markdownHtml escapes text, inlines a resolved image, and never emits a remote src — a named placeholder instead',
    typeof html === 'string' && html.includes('&lt;b&gt;') && html.includes('src="data:image/png;base64,AA"') && !/src="https?:/.test(html) && html.includes('remote image not loaded'), html)
}

// ---- the ORIGIN plumbing, as source shape ---------------------------------
// deck.session.2 drives the session with 'door' directly; this pins the three
// places that decide which door a step came through. Dropping the second
// argument would turn every agent edit into a direct write with every other
// suite still green (the critic).
{
  const strip = (t) => t.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '')
  const pa = strip(readFileSync(join(root, 'src/renderer/canvas/usePaletteActions.ts'), 'utf8'))
  const node = existsSync(join(root, 'src/renderer/file/DeckNode.tsx')) ? strip(readFileSync(join(root, 'src/renderer/file/DeckNode.tsx'), 'utf8')) : ''
  ok('deck.origin.1 runAgentPlan runs steps as the door, the palette runPlan as a person, deck verbs pass origin, and a door keep and a door present are refused',
    pa.includes("runAgentPlan(line, facts(), (step) => execute(step, 'door'), caller)") && /runPlan\(built\.plan, execute, \{/.test(pa) &&
      /case 'deck-edit': return self\.editDeck\([^\n]*origin\)/.test(pa) && /case 'deck-write': [^\n]*origin\)/.test(pa) && /case 'deck-review': [^\n]*origin\)/.test(pa) && /case 'deck-present': [^\n]*origin\)/.test(pa) &&
      /action === 'keep' && origin === 'door'\) return \{ kind: 'refused'/.test(node) && /if \(origin === 'door'\) return \{ kind: 'refused', reason: `presenting/.test(node))
}

// ---- no new dependency -----------------------------------------------------
{
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const names = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })
  const imports = ['src/shared/deck.ts', 'src/shared/markdown.ts', 'src/main/deck-pdf.ts'].map((f) => existsSync(join(root, f)) ? readFileSync(join(root, f), 'utf8') : "import 'missing'")
  const bare = imports.flatMap((t) => [...t.matchAll(/from '([^'.@][^']*)'/g)].map((m) => m[1])).filter((n) => !n.startsWith('node:'))
  ok('deck.deps.1 no Markdown, slide or PDF dependency was added, and the deck modules import no package',
    !names.some((n) => /markdown|marked|remark|marp|mdx|pdf|slide|reveal|mammoth/i.test(n)) && bare.length === 0, JSON.stringify(bare))
}

;(async () => {
  // ---- the PDF core, over fake deps ---------------------------------------
  {
    const deck = fm + ['# One\n\n![pic](pic.png)\n', '# Two ghp_' + 'a'.repeat(36) + '\n', '# Three\n\n![r](https://x/y.png)\n', '# Four\n<!-- notes secret notes -->\n'].join('---\n')
    let html = '', wrote = null
    const exporter = call(P.createDeckPdf, {
      readText: async () => ({ kind: 'text', content: deck, bytes: deck.length, lines: 1, truncatedLines: 0, mtimeMs: 1 }),
      readImage: (p) => p === '/decks/pic.png' ? { kind: 'data', dataUrl: 'data:image/png;base64,QQ==', bytes: 1, mediaType: 'image/png' } : { kind: 'missing' },
      render: async (h) => { html = h; return Buffer.from('%PDF-fake') },
      askPath: async (s) => '/out/' + s,
      write: (path, data) => { wrote = { path, data } }
    })
    const result = exporter ? await exporter({ path: '/decks/talk.md' }).catch((e) => ({ threw: String(e) })) : undefined
    const sections = (html.match(/<section class="slide"/g) ?? []).length
    ok('deck.pdf.core.1 one page per slide, the image inlined, the remote one a placeholder, notes absent, a token scrubbed through outward, a JS-free page with a closed CSP, written where the dialog said',
      result?.kind === 'written' && result.pages === 4 && sections === 4 && html.includes('data:image/png;base64,QQ==') && html.includes('remote image not loaded') &&
        !html.includes('secret notes') && !html.includes('ghp_aaaa') && result.redacted >= 1 && !/<script/i.test(html) && /default-src 'none'/.test(html) &&
        /@page\s*\{[^}]*size:/.test(html) && wrote?.path === '/out/talk.pdf', JSON.stringify(result))
    const cancelled = await call(P.createDeckPdf, { readText: async () => ({ kind: 'text', content: deck, bytes: 1, lines: 1, truncatedLines: 0, mtimeMs: 1 }), readImage: () => ({ kind: 'missing' }), render: async () => Buffer.from(''), askPath: async () => null, write: () => { throw new Error('wrote') } })?.({ path: '/decks/talk.md' })
    const missing = await call(P.createDeckPdf, { readText: async () => ({ kind: 'missing' }), readImage: () => ({ kind: 'missing' }), render: async () => Buffer.from(''), askPath: async () => '/x', write: () => {} })?.({ path: '/decks/talk.md' })
    const relative = await call(P.createDeckPdf, { readText: async () => { throw new Error('read') }, readImage: () => ({ kind: 'missing' }), render: async () => Buffer.from(''), askPath: async () => '/x', write: () => {} })?.({ path: 'talk.md' })
    ok('deck.pdf.core.2 cancel writes nothing; a missing file and a relative path are named failures', cancelled?.kind === 'cancelled' && missing?.kind === 'failed' && /missing|not there/.test(missing.reason) && relative?.kind === 'failed')
  }

  // ---- the session over a REAL file: person writes, a door stages ---------
  // A SPACE in the fixture directory, this repo's costliest silent bug (verify:file's rule).
  mkdirSync(join(root, 'out/verify'), { recursive: true })
  const dir = mkdtempSync(join(root, 'out/verify/deck files ')), path = join(dir, 'talk.md')
  try {
    writeFileSync(path, base)
    let saved = null
    const io = { name: 'talk.md', read: async () => M.file.readFile(path), write: async (text, mtime) => M.file.writeFile(path, text, mtime), changed: (view) => { saved = view } }
    const session = call(S.createDeckSession, {}, io)
    await session?.refresh()
    const personOk = await session?.editSlide(3, '# three!\n', 'person')
    ok('deck.session.1 a person\'s slide edit writes the file through the CAS guard and stages nothing',
      personOk === true && readFileSync(path, 'utf8') === deckOf([...five.slice(0, 2), '# three!\n', ...five.slice(3)]) && saved?.draft === undefined)
    const onDisk = readFileSync(path, 'utf8')
    const staged = await session?.editSlide(1, '# agent one\n', 'door', 'ch1')
    const staged2 = await session?.editSlide(5, '# agent five\n', 'door', 'ch1')
    ok('deck.session.2 the agent/workflow door STAGES — the disk is Buffer-identical and the draft holds both slides by the agent',
      staged === true && staged2 === true && Buffer.compare(readFileSync(path), Buffer.from(onDisk)) === 0 && saved?.draft?.items?.length === 2 && saved.draft.by === 'ch1')
    const keptOk = await session?.review('keep', ['5'])
    ok('deck.session.3 keeping one slide writes only that slide; the other stays staged',
      keptOk === true && readFileSync(path, 'utf8') === onDisk.replace('# 5\n', '# agent five\n') && saved?.draft?.items?.length === 1)
    writeFileSync(path, readFileSync(path, 'utf8').replace('# 2', '# two (by hand)'))
    await session?.refresh()
    const conflicted = await session?.review('keep', ['1'])
    ok('deck.session.4 a keep after the file changed on disk is refused, naming the file and the slide; the disk is untouched',
      conflicted === false && /talk\.md/.test(session.snapshot().error ?? '') && /slide 1\b/.test(session.snapshot().error ?? '') && readFileSync(path, 'utf8').includes('# two (by hand)') && !readFileSync(path, 'utf8').includes('agent one'))
    const bytes = readFileSync(path)
    const discarded = await session?.review('discard', 'all')
    ok('deck.session.5 discard leaves the file Buffer-identical and no draft', discarded === true && Buffer.compare(readFileSync(path), bytes) === 0 && saved?.draft === undefined)
    const stale = await session?.save('# overwritten\n', base)
    ok('deck.session.6 a person\'s save from a stale base is refused as "changed on disk"', stale === false && /changed on disk/.test(session.snapshot().error ?? '') && Buffer.compare(readFileSync(path), bytes) === 0)
  } finally { rmSync(dir, { recursive: true, force: true }) }

  const failures = results.filter((r) => !r.pass)
  console.log(`\n${results.length - failures.length}/${results.length} checks passed`)
  process.exitCode = failures.length ? 1 : 0
})().catch((error) => { console.error(error); process.exitCode = 1 })
