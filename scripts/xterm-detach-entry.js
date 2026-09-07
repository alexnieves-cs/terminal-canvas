/* Probe: does an xterm Terminal survive having its host detached?
   Bundled by verify-xterm-detach.cjs and loaded in a hidden window. */
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
// The REAL factory, not a hand-built Terminal: unicode.1 asserts a property
// of what createTerminal returns, which is the one place a Terminal is built.
import { createTerminal, attachTerminal } from '../src/renderer/terminal/create-terminal'
// serialize.1/.2 (M112). The REAL SessionHandle, not a hand-built Terminal
// plus a raw addon: this is what usePaletteActions.ts actually calls, so a
// pass here is a pass on the production path, not a spike alongside it.
import { createSessionFactory } from '../src/renderer/terminal/session-factory'

const readRows = (term) => {
  const buf = term.buffer.active
  const lines = []
  for (let i = 0; i < buf.length; i++) {
    const line = buf.getLine(i)
    if (!line) continue
    const text = line.translateToString(true)
    if (text.trim()) lines.push(text.trim())
  }
  return lines
}

// Under the WebGL addon, xterm paints glyphs into a <canvas> and the
// `.xterm-rows` DOM layer is used for accessibility/selection text only — it
// can legitimately be empty even while the terminal renders perfectly. Read
// both surfaces so a later empty DOM read can be told apart from "genuinely
// did not repaint" vs. "this renderer never populates DOM text."
const readCanvasSignal = (host) => {
  const canvases = host.querySelectorAll('canvas')
  const first = canvases[0]
  return {
    count: canvases.length,
    width: first ? first.width : 0,
    height: first ? first.height : 0
  }
}

window.__probe = (async () => {
  const out = {}

  // 1. Open against an attached host, as a live panel would.
  const host = document.createElement('div')
  host.style.cssText = 'width: 640px; height: 400px;'
  document.body.appendChild(host)

  const term = new Terminal({ fontSize: 13, scrollback: 1000, allowProposedApi: true })
  const fit = new FitAddon()
  term.loadAddon(fit)
  term.open(host)
  let webgl = new WebglAddon()
  term.loadAddon(webgl)
  fit.fit()

  term.write('BEFORE-DETACH\r\n')
  await new Promise((r) => setTimeout(r, 200))
  out.colsWhileAttached = term.cols
  out.rowsWhileAttached = term.rows

  // Baseline: the SAME measurements check 4 takes after reattachment, but
  // taken here while attached and known-healthy. This is what tells apart
  // "reattach failed to repaint" from "this measurement is never populated
  // under WebGL, attached or not."
  out.domTextWhileAttached = (host.querySelector('.xterm-rows')?.textContent || '').trim()
  out.canvasesWhileAttached = readCanvasSignal(host)

  // 2. Evict: drop the WebGL context and take the host out of the document.
  webgl.dispose()
  webgl = null
  host.remove()
  await new Promise((r) => setTimeout(r, 100))

  // 3. Write while detached. This is the assertion that matters: output
  //    arriving for an off-screen panel must not be lost.
  try {
    term.write('WHILE-DETACHED\r\n')
    await new Promise((r) => setTimeout(r, 200))
    out.detachedWriteThrew = false
  } catch (error) {
    out.detachedWriteThrew = String(error)
  }
  out.bufferWhileDetached = readRows(term)

  // 4. Promote again: re-append the SAME host, take a fresh WebGL context,
  //    refit. term.open() is deliberately not called a second time.
  document.body.appendChild(host)
  try {
    const again = new WebglAddon()
    term.loadAddon(again)
    out.webglReloaded = true
  } catch (error) {
    out.webglReloaded = String(error)
  }
  fit.fit()
  term.refresh(0, term.rows - 1)
  await new Promise((r) => setTimeout(r, 300))

  out.bufferAfterReattach = readRows(term)
  out.colsAfterReattach = term.cols
  out.rowsAfterReattach = term.rows
  out.domTextAfterReattach = (host.querySelector('.xterm-rows')?.textContent || '').trim()
  out.canvasesAfterReattach = readCanvasSignal(host)

  // Control: the WebGL path can't prove repaint via DOM text (it's empty
  // even when healthy — see domTextWhileAttached above), and a WebGL canvas
  // readback would need `preserveDrawingBuffer`, which the addon does not
  // expose, so a readback would be blank-or-flaky rather than trustworthy.
  // Instead, run a second, independent Terminal through the identical
  // detach/write/reattach lifecycle with NO WebglAddon at all. Its DOM
  // renderer *does* paint into `.xterm-rows`, so this is the surface that
  // can actually prove or disprove "does the buffer repaint after reattach."
  out.control = {}
  const host2 = document.createElement('div')
  host2.style.cssText = 'width: 640px; height: 400px;'
  document.body.appendChild(host2)

  const term2 = new Terminal({ fontSize: 13, scrollback: 1000, allowProposedApi: true })
  const fit2 = new FitAddon()
  term2.loadAddon(fit2)
  term2.open(host2)
  fit2.fit()

  term2.write('BEFORE-DETACH\r\n')
  await new Promise((r) => setTimeout(r, 200))
  // Baseline: if this is empty, DOM text is not a valid signal even without
  // WebGL, and the control is inconclusive — the check reading this must
  // fail rather than pass on an empty/undefined value.
  out.control.domTextWhileAttached = (host2.querySelector('.xterm-rows')?.textContent || '').trim()

  host2.remove()
  await new Promise((r) => setTimeout(r, 100))
  term2.write('WHILE-DETACHED\r\n')
  await new Promise((r) => setTimeout(r, 200))

  document.body.appendChild(host2)
  fit2.fit()
  term2.refresh(0, term2.rows - 1)
  await new Promise((r) => setTimeout(r, 300))

  out.control.domTextAfterReattach = (host2.querySelector('.xterm-rows')?.textContent || '').trim()
  term2.dispose()

  // unicode.1's probe. A grinning face is width 1 in xterm's built-in
  // Unicode 6 table and width 2 under the Unicode 11 addon, so the cursor
  // column after writing it is the one observable that separates the two.
  out.unicode = {}
  try {
    const host3 = document.createElement('div')
    host3.style.cssText = 'width: 640px; height: 400px;'
    document.body.appendChild(host3)
    const handles = createTerminal()
    attachTerminal(handles, host3)
    handles.term.write('\u{1F600}')
    await new Promise((r) => setTimeout(r, 200))
    out.unicode.activeVersion = handles.term.unicode.activeVersion
    out.unicode.cursorX = handles.term.buffer.active.cursorX
    handles.term.dispose()
  } catch (error) {
    out.unicode.error = String(error)
  }

  // serialize.1 (M112). The REAL SessionHandle.serialize() (built off the
  // buffer's own `isWrapped`, not `@xterm/addon-serialize` — the addon
  // was tried and dropped; see session-factory.ts's comment above
  // `serialize()` for why) must answer the same rows before eviction,
  // while detached, and after re-attach — otherwise an export from a
  // carded panel silently differs from the same export a moment later.
  out.serialize = {}
  try {
    const factory = createSessionFactory()
    const handle = factory.create('probe-serialize-1')
    handle.host.style.cssText = 'width: 640px; height: 400px;'
    document.body.appendChild(handle.host)
    handle.attach()
    handle.write('SER-ONE\r\nSER-TWO\r\n')
    await new Promise((r) => setTimeout(r, 200))
    out.serialize.attached = handle.serialize()
    handle.detach()
    await new Promise((r) => setTimeout(r, 100))
    out.serialize.detached = handle.serialize()
    document.body.appendChild(handle.host)
    handle.attach()
    await new Promise((r) => setTimeout(r, 200))
    out.serialize.reattached = handle.serialize()
    handle.dispose()
  } catch (error) {
    out.serialize.error = String(error)
  }

  // card.rows.1 (M143, backlog #53's live-tier half, built in M63 and pinned
  // here at last). The card's `tail(n)` reads the buffer ROWS AS ROWS: the
  // last rows of the viewport with an INTERIOR blank row kept and only the
  // trailing blanks trimmed — a full-screen TUI's card shows the bottom of
  // its real screen with its layout, not six non-empty fragments gathered
  // from wherever they were. And the buffer survives detach, so a carded
  // panel's card reads the same rows it would attached.
  out.cardRows = {}
  try {
    const factory = createSessionFactory()
    const handle = factory.create('probe-card-rows-1')
    handle.host.style.cssText = 'width: 640px; height: 400px;'
    document.body.appendChild(handle.host)
    handle.attach()
    handle.write('+----+\r\n|  A |\r\n\r\n|  B |\r\n+----+\r\n')
    await new Promise((r) => setTimeout(r, 200))
    out.cardRows.attached = handle.tail(6)
    handle.detach()
    await new Promise((r) => setTimeout(r, 100))
    out.cardRows.detached = handle.tail(6)
    handle.dispose()
  } catch (error) {
    out.cardRows.error = String(error)
  }

  // serialize.2 (M112, review round 2, CRITICAL 1 — the actual `isWrapped`
  // proof). A single line written with NO `\r\n` of its own, long enough
  // that the terminal MUST auto-wrap it across several rows — the exact
  // shape a wrapped secret has. `isWrapped` is what tells serialize() each
  // of those continuation rows is not a real line, so the reunited output
  // must contain the whole run as ONE unbroken string with no interior
  // `\r\n` — proof against a REAL wrap in a REAL terminal, not a
  // hand-simulated one.
  out.serializeWrap = {}
  try {
    const factory2 = createSessionFactory()
    const handle2 = factory2.create('probe-serialize-2')
    // Narrow on purpose: a small host forces a small column count, so a
    // few hundred characters reliably spans many rows without needing to
    // know the exact fitted width.
    handle2.host.style.cssText = 'width: 320px; height: 200px;'
    document.body.appendChild(handle2.host)
    handle2.attach()
    const longRun = 'Q'.repeat(400)
    handle2.write(longRun)
    await new Promise((r) => setTimeout(r, 300))
    const serialized = handle2.serialize()
    out.serializeWrap.containsWholeRun = typeof serialized === 'string' && serialized.includes(longRun)
    out.serializeWrap.cols = handle2.size().cols
    out.serializeWrap.len = typeof serialized === 'string' ? serialized.length : null
    handle2.dispose()
  } catch (error) {
    out.serializeWrap.error = String(error)
  }

  return out
})()
