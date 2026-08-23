/* Probe: does an xterm Terminal survive having its host detached?
   Bundled by verify-xterm-detach.cjs and loaded in a hidden window. */
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'

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
  out.canvasCount = host.querySelectorAll('canvas').length

  return out
})()
