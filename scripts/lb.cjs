/* `npm run lb -- <term> [<term>...]` — the load-bearing entries that name a module.

   WHY THIS EXISTS. docs/load-bearing.md and its -recovered sibling are far too
   large to read whole, and CLAUDE.md says to grep them by module. But an entry
   is a PARAGRAPH, often 700+ characters on one line, followed by continuation
   paragraphs, lists and code blocks — so a grep hit is one enormous line with
   no boundary, and the continuation that carries the actual rule is not in it.
   This prints entries as units, with a file:line an editor or a Read offset
   can land on.

   WHAT AN ENTRY IS. A paragraph whose first characters are `**` (the bold
   lead), plus every following paragraph that does NOT start with `**`, up to
   the next bold-led paragraph or a heading. The files' own "how to read" note
   says sub-points inside an entry are bold too, so a bold sub-point parses as
   its own entry — it is still printed with its location, and the entry above
   it is one `--full` away. Nothing is dropped: verify:meta lb.1 pins that
   every line after the preamble belongs to exactly one entry.

   OUTPUT. Brief by default — location plus the lead sentence — because a
   module like `pty-manager` names dozens of entries and the point is a cheap
   look-up. `--full` prints the bodies. Entries whose LEAD names the term sort
   first: those are about the module; body-only hits merely mention it.

   Terms AND together and match case-insensitively. `--modules` prints the
   backticked file names the leads cite, with counts — the keyword index the
   file's own note lists by hand. */
'use strict'
const { readFileSync } = require('node:fs')
const { join, relative } = require('node:path')

const ROOT = join(__dirname, '..')
const FILES = ['docs/load-bearing.md', 'docs/load-bearing-recovered.md']

/* Splits one file into its preamble and its entries. A line belongs to the
   entry opened by the nearest bold-led paragraph or heading above it — a
   heading opens a SECTION entry whose lead is the heading text, so a list
   under a heading with no bold paragraph (the -recovered file's closing
   list of entries whose symbols are gone) is still searchable, not orphaned.
   The preamble is everything before the first bold-led paragraph.

   Fenced code blocks are opaque — a `**` inside one opens nothing — but only
   a fence that CLOSES counts. load-bearing.md carried a single unmatched
   ``` for a long time; toggling on it flipped the rest of the file into
   "code", and the parser found zero entries in 4,000 lines without a
   complaint. An unmatched final fence is therefore ignored. */
const parseEntries = (text, file) => {
  const lines = text.split('\n')
  const fenceLines = lines.map((l, i) => (/^\s*```/.test(l) ? i : -1)).filter((i) => i >= 0)
  const honoured = new Set(fenceLines.length % 2 ? fenceLines.slice(0, -1) : fenceLines)
  const entries = []
  let current = null
  let prevBlank = true
  let fenced = false
  let preambleEnd = null
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (honoured.has(i)) fenced = !fenced
    const opens = !fenced && prevBlank && line.startsWith('**')
    const heading = !fenced && /^#{1,6} /.test(line)
    if (opens && preambleEnd === null) preambleEnd = i
    if ((heading && preambleEnd !== null) || opens) {
      if (current) entries.push(current)
      current = { file, line: i + 1, lines: [line], section: heading }
    } else if (current) {
      current.lines.push(line)
    }
    prevBlank = line.trim() === ''
  }
  if (current) entries.push(current)
  for (const e of entries) {
    while (e.lines.length && e.lines[e.lines.length - 1].trim() === '') e.lines.pop()
    e.text = e.lines.join('\n')
    e.lead = e.section ? e.lines[0].replace(/^#+\s*/, '').trim() : leadOf(e.text)
  }
  // A heading with nothing under it is structure, not an entry.
  const kept = entries.filter((e) => !(e.section && e.lines.length === 1))
  return { entries: kept, preambleEnd: preambleEnd ?? lines.length, lineCount: lines.length }
}

/* The bold lead: the text between the opening `**` and its closing `**`,
   whitespace collapsed (a lead can wrap across lines). */
const leadOf = (text) => {
  const m = /^\*\*([\s\S]*?)\*\*/.exec(text)
  return (m ? m[1] : text.split('\n')[0]).replace(/\s+/g, ' ').trim()
}

/* Line numbers after the preamble that belong to no entry (blank lines and
   headings aside). Empty on a healthy file; verify:meta lb.1 pins that, so a
   format change that silently orphans text — the unmatched fence did exactly
   this to 4,000 lines — goes red instead of shrinking every search. */
const unowned = (text, file) => {
  const { entries, preambleEnd } = parseEntries(text, file)
  const lines = text.split('\n')
  const owned = new Set()
  for (const e of entries) for (let i = 0; i < e.lines.length; i++) owned.add(e.line - 1 + i)
  const lost = []
  for (let i = preambleEnd; i < lines.length; i++) {
    if (!owned.has(i) && lines[i].trim() !== '' && !/^#{1,6} /.test(lines[i])) lost.push(i + 1)
  }
  return lost
}

const loadAll = (root = ROOT) => FILES.flatMap((f) => parseEntries(readFileSync(join(root, f), 'utf8'), f).entries)

/* Entries matching every term, lead matches first, then file order. */
const search = (entries, terms) => {
  const needles = terms.map((t) => t.toLowerCase())
  return entries
    .filter((e) => needles.every((n) => e.text.toLowerCase().includes(n)))
    .map((e) => ({ e, inLead: needles.every((n) => e.lead.toLowerCase().includes(n)) }))
    .sort((a, b) => Number(b.inLead) - Number(a.inLead))
}

/* Backticked names in leads that look like a module: a file with an
   extension, or a path. Prose in backticks (`Cmd+N`, `tc status`) is not a
   module and would bury the index. */
const moduleIndex = (entries) => {
  const counts = new Map()
  for (const e of entries) {
    for (const m of e.lead.matchAll(/`([^`]+)`/g)) {
      const name = m[1]
      if (!/^[\w@./-]+\.(tsx?|cjs|js|css|html|json)$/.test(name) && !/^[\w@-]+\/[\w./-]+$/.test(name)) continue
      counts.set(name, (counts.get(name) ?? 0) + 1)
    }
  }
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
}

const main = (argv) => {
  const full = argv.includes('--full')
  const terms = argv.filter((a) => !a.startsWith('--'))
  const entries = loadAll()
  if (argv.includes('--modules')) {
    for (const [name, n] of moduleIndex(entries)) console.log(`${String(n).padStart(4)}  ${name}`)
    return 0
  }
  if (!terms.length) {
    console.log('usage: npm run lb -- <term> [<term>...] [--full]    entries naming every term')
    console.log('       npm run lb -- --modules                       the modules the leads cite, by count')
    return 2
  }
  const hits = search(entries, terms)
  // Three states, not two: no hits is said in words, so an empty result is
  // never mistaken for a command that printed nothing because it broke.
  if (!hits.length) {
    console.log(`no load-bearing entry names ${terms.map((t) => JSON.stringify(t)).join(' and ')} — ` +
      'entries are written from the CAUSE, so try the module or file name rather than the symptom')
    return 1
  }
  const leadCount = hits.filter((h) => h.inLead).length
  console.log(`${hits.length} entries (${leadCount} about it in the lead, ${hits.length - leadCount} mentioning it in the body)\n`)
  for (const { e, inLead } of hits) {
    const where = `${e.file}:${e.line}`
    if (full) {
      console.log(`── ${where}${inLead ? '' : '  (body mention)'}\n${e.text}\n`)
    } else {
      const lead = e.lead.length > 160 ? e.lead.slice(0, 157) + '…' : e.lead
      console.log(`${inLead ? '*' : ' '} ${where.padEnd(38)} ${lead}`)
    }
  }
  if (!full) console.log('\n* = named in the lead. Add --full for the bodies, or Read the file at the line shown.')
  return 0
}

module.exports = { parseEntries, unowned, loadAll, search, moduleIndex, FILES }

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2))
}
