// CDP driver for the real Terminal Canvas app. usage: node d.cjs <port> <cmd> [args]
// Screenshots are 2x DPR: divide PNG pixels by 2 to get click coordinates. Resize the window with
// osascript (System Events, by the pid in /tmp/tcc-<slot>/pid) — CDP has no window bounds in Electron.
// A window covered by another window goes `hidden` and wheel events hang: keep yours frontmost.
// Pinch (wheel ... ctrl) can hang through CDP; use the HUD zoom buttons instead.
//  shot <file.png>             screenshot of the window
//  click <x> <y> [right|double]  real mouse click at CSS px
//  move <x> <y>                hover
//  drag <x1> <y1> <x2> <y2>    left-drag in steps
//  wheel <x> <y> <dx> <dy> [ctrl]  wheel (ctrl = pinch zoom)
//  key <combo>                 e.g. Meta+k, Escape, Enter, Shift+Tab, Meta+Shift+p, ArrowDown
//  type <text>                 insert text into focused element
//  eval <js>                   evaluate in the page, print JSON result
//  ui                          list visible interactive elements with rects + text (the map to click by)
//  text                        visible innerText of the body (trimmed)
const WS = require(require('path').join(__dirname, '../../../../node_modules/ws'))
const fs = require('fs')
const [port, cmd, ...a] = process.argv.slice(2)
;(async () => {
  const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
  const page = list.find((p) => p.type === 'page' && p.url.includes('out/renderer'))
  const ws = new WS(page.webSocketDebuggerUrl, { perMessageDeflate: false })
  await new Promise((r) => ws.on('open', r))
  let id = 0; const pend = new Map()
  ws.on('message', (m) => { const d = JSON.parse(m); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id) } })
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result?.exceptionDetails) return 'ERR ' + JSON.stringify(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text); return r.result?.result?.value }
  const mouse = (type, x, y, extra = {}) => send('Input.dispatchMouseEvent', { type, x: +x, y: +y, button: 'left', ...extra })
  const MOD = { Alt: 1, Control: 2, Ctrl: 2, Meta: 4, Cmd: 4, Shift: 8 }
  const CODES = { Enter: 13, Escape: 27, Tab: 9, Backspace: 8, Delete: 46, ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39, ' ': 32, Space: 32 }
  switch (cmd) {
    case 'shot': { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(a[0], Buffer.from(r.result.data, 'base64')); console.log('wrote', a[0]); break }
    case 'click': { const b = a[2] === 'right' ? 'right' : 'left'; const n = a[2] === 'double' ? 2 : 1; await mouse('mouseMoved', a[0], a[1]); for (let c = 1; c <= n; c++) { await mouse('mousePressed', a[0], a[1], { button: b, clickCount: c, buttons: b === 'left' ? 1 : 2 }); await sleep(30); await mouse('mouseReleased', a[0], a[1], { button: b, clickCount: c }) } console.log('clicked'); break }
    case 'move': await mouse('mouseMoved', a[0], a[1], { button: 'none' }); console.log('moved'); break
    case 'drag': { const [x1, y1, x2, y2] = a.map(Number); await mouse('mouseMoved', x1, y1); await mouse('mousePressed', x1, y1, { clickCount: 1, buttons: 1 }); for (let s = 1; s <= 12; s++) { await mouse('mouseMoved', x1 + (x2 - x1) * s / 12, y1 + (y2 - y1) * s / 12, { buttons: 1 }); await sleep(16) } await mouse('mouseReleased', x2, y2, { clickCount: 1 }); console.log('dragged'); break }
    case 'wheel': await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: +a[0], y: +a[1], deltaX: +a[2], deltaY: +a[3], modifiers: a[4] === 'ctrl' ? 2 : 0 }); console.log('wheeled'); break
    case 'key': { const parts = a[0].split('+'); const k = parts.pop(); const modifiers = parts.reduce((m, p) => m | (MOD[p] || 0), 0); const code = CODES[k] || (k.length === 1 ? k.toUpperCase().charCodeAt(0) : 0); const text = k.length === 1 && !(modifiers & 6) ? k : undefined; const base = { key: k, code: k.length === 1 ? 'Key' + k.toUpperCase() : k, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code, modifiers }; await send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', ...base, text }); await send('Input.dispatchKeyEvent', { type: 'keyUp', ...base }); console.log('key', a[0]); break }
    case 'type': await send('Input.insertText', { text: a.join(' ') }); console.log('typed'); break
    case 'eval': console.log(JSON.stringify(await ev(a.join(' ')), null, 1)); break
    case 'text': console.log(await ev(`document.body.innerText.replace(/\\n{3,}/g,'\\n\\n').slice(0, 6000)`)); break
    case 'ui': console.log(await ev(`(() => { const out = []; const sel = 'button,a,[role=button],[role=menuitem],[role=tab],[role=option],input,textarea,select,[tabindex]:not([tabindex="-1"]),.panel__title,[data-panel-id]'; for (const e of document.querySelectorAll(sel)) { const r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > innerHeight) continue; const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || +cs.opacity === 0) continue; const t = (e.getAttribute('aria-label') || e.innerText || e.value || e.placeholder || e.title || '').replace(/\\s+/g, ' ').trim().slice(0, 50); out.push(Math.round(r.x + r.width / 2) + ',' + Math.round(r.y + r.height / 2) + ' ' + e.tagName.toLowerCase() + (e.getAttribute('data-panel-id') ? '[panel=' + e.getAttribute('data-panel-id') + ']' : '') + (e.disabled ? '[disabled]' : '') + ' ' + (String(e.className).split(' ')[0] || '') + ' | ' + t) } return out.slice(0, 250).join('\\n') + '\\nviewport ' + innerWidth + 'x' + innerHeight })()`)); break
    default: console.log('unknown cmd')
  }
  ws.close(); process.exit(0)
})().catch((e) => { console.error('driver error', e.message); process.exit(1) })
