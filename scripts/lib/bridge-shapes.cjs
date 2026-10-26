/* Lane N (M565). What each `window.canvas` door returns, read off the
   CanvasBridge text in src/shared/ipc-contract.ts, so the browser demo's
   stubbed doors answer in the declared SHAPE rather than by guessing from
   the method's name. A `[]` where the renderer expects `{ hits }` throws
   inside a render, and the page goes blank with a green build (the critic
   found `scrollback.search` doing exactly that from the palette).

   Read as text, not with the TypeScript compiler: vite.web.config.ts runs
   this at build time and verify:demo runs it in plain node, and neither
   should load a compiler for ~260 one-line signatures. A signature this
   cannot classify falls to `record`, the shape the demo must answer by hand,
   so a parse miss is a red verify:demo (demo.shapes.1), never a silent stub.

   Shapes:
     subscribe  on*(listener): returns its unsubscribe
     sync       any other non-Promise member (must be answered by hand)
     list       Promise<X[]>
     nullable   Promise<X | null>
     void       Promise<void>
     boolean | number | string
     refusal    a union with a `kind` or `ok` discriminant: the demo answers
                its "not here" member
     record     a plain object (an interface, an inline `{}`, a Record):
                no safe default exists, so the demo answers it by hand */
'use strict'
const { readFileSync, readdirSync, statSync } = require('node:fs')
const { join } = require('node:path')

function sharedSources(root) {
  const out = []
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) walk(p)
      else if (name.endsWith('.ts')) out.push(readFileSync(p, 'utf8'))
    }
  }
  walk(join(root, 'src/shared'))
  return out.join('\n')
}

/* The type inside the LAST `Promise<…>` of a signature, balanced. */
function promised(sig) {
  const p = sig.lastIndexOf('Promise<')
  if (p < 0) return null
  let depth = 0
  let k = p + 8
  for (; k < sig.length; k++) {
    const c = sig[k]
    if ('<{(['.includes(c)) depth++
    else if ('>})]'.includes(c)) { if (depth === 0) break; depth-- }
  }
  return sig.slice(p + 8, k).trim()
}

/* Top-level `|` members of a type, ignoring those nested in braces or generics. */
function members(type) {
  const out = []
  let depth = 0
  let cur = ''
  for (const c of type) {
    if ('<{(['.includes(c)) depth++
    else if ('>})]'.includes(c)) depth--
    if (c === '|' && depth === 0) { out.push(cur.trim()); cur = '' } else cur += c
  }
  out.push(cur.trim())
  return out.filter((m) => m !== '')
}

function classify(type, shared) {
  const parts = members(type)
  if (parts.includes('null')) return 'nullable'
  if (parts.length === 1) {
    const t = parts[0]
    if (t === 'void' || t === 'undefined') return 'void'
    if (t === 'boolean' || t === 'number' || t === 'string') return t
    if (/\[\]$/.test(t)) return 'list'
  }
  if (parts.length > 1 && parts.every((p) => p.startsWith('{')) && parts.some((p) => /\b(kind|ok)\??:/.test(p))) return 'refusal'
  if (parts.length === 1 && parts[0].startsWith('{')) return 'record'
  if (parts.length === 1) {
    const name = /^(?:import\([^)]*\)\.)?([A-Z][A-Za-z0-9]*)$/.exec(parts[0])
    if (name !== null) {
      if (new RegExp(`export interface ${name[1]}\\b`).test(shared)) return 'record'
      const def = new RegExp(`export type ${name[1]}\\s*=([\\s\\S]*?)(?:\\n\\n|\\nexport |\\n/\\*\\*|\\n//)`).exec(shared)
      if (def !== null) return classify(def[1].replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, ' ').replace(/\s+/g, ' ').trim(), shared)
    }
  }
  return 'record'
}

/* Every door of CanvasBridge as `ns.method` → shape. Top-level scalars
   (`platform`, `appVersion`…) are not doors and are left out. */
function bridgeShapes(root) {
  const src = readFileSync(join(root, 'src/shared/ipc-contract.ts'), 'utf8')
  const shared = sharedSources(root)
  const start = src.indexOf('export interface CanvasBridge {')
  const text = src.slice(start, src.indexOf('\n}\n', start))
  const lines = text.split('\n')
  const shapes = {}
  let ns = null
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const open = /^ {2}([a-zA-Z]+)\??: \{$/.exec(line)
    if (open) { ns = open[1]; continue }
    if (/^ {2}\}/.test(line)) { ns = null; continue }
    if (ns === null) continue
    const method = /^ {4}([a-zA-Z]+)\??(\(|: \()/.exec(line)
    if (!method) continue
    const path = `${ns}.${method[1]}`
    if (/^on[A-Z]/.test(method[1])) { shapes[path] = 'subscribe'; continue }
    // The signature may span lines (a parameter list broken over several);
    // it ends at the first line whose brackets balance and that names a return.
    let sig = ''
    let depth = 0
    for (let j = i; j < lines.length; j++) {
      const l = lines[j]
      sig += ` ${l.trim()}`
      for (const c of l) { if ('<{(['.includes(c)) depth++; else if ('>})]'.includes(c)) depth-- }
      if (depth <= 0 && /\)\s*(?:=>|:)\s*\S/.test(sig)) break
    }
    const type = promised(sig)
    shapes[path] = type === null ? 'sync' : classify(type, shared)
  }
  return shapes
}

module.exports = { bridgeShapes, classify }
