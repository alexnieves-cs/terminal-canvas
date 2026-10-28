/**
 * Lane Q (M591). The menu's accelerators, matched in a tab. Pure, so
 * verify:host runs it without a browser; host-chrome.ts binds it to keydown.
 */

export interface Combo { cmd: boolean; ctrl: boolean; alt: boolean; shift: boolean; key: string }

const CODE_KEYS: Record<string, string> = {
  Comma: ',', Period: '.', Slash: '/', Backslash: '\\', BracketLeft: '[', BracketRight: ']',
  Equal: '=', Minus: '-', Backquote: '`', Semicolon: ';', Quote: "'", Space: 'space', Enter: 'enter',
  Escape: 'escape', Backspace: 'backspace', Delete: 'delete', Tab: 'tab',
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right'
}

const NAMED: Record<string, string> = {
  plus: '=', space: 'space', return: 'enter', enter: 'enter', esc: 'escape', escape: 'escape',
  backspace: 'backspace', delete: 'delete', tab: 'tab', up: 'up', down: 'down', left: 'left', right: 'right'
}

/** Electron's accelerator grammar, the part the app's menu uses. Null for one this page cannot match. */
export function parseAccelerator(accelerator: string, mac: boolean): Combo | null {
  if (accelerator.trim() === '') return null
  const combo: Combo = { cmd: false, ctrl: false, alt: false, shift: false, key: '' }
  for (const raw of accelerator.split('+')) {
    const part = raw.trim().toLowerCase()
    if (part === '') { combo.key = '+'; continue }
    if (part === 'cmdorctrl' || part === 'commandorcontrol') { if (mac) combo.cmd = true; else combo.ctrl = true }
    else if (part === 'cmd' || part === 'command' || part === 'super' || part === 'meta') combo.cmd = true
    else if (part === 'ctrl' || part === 'control') combo.ctrl = true
    else if (part === 'alt' || part === 'option' || part === 'altgr') combo.alt = true
    else if (part === 'shift') combo.shift = true
    else combo.key = NAMED[part] ?? part
  }
  if (combo.key === '+') { combo.key = '='; combo.shift = true }
  return combo.key === '' ? null : combo
}

/** The key a KeyboardEvent names, by its physical code, so Option and Shift do not change it. */
export function keyOf(event: Pick<KeyboardEvent, 'code' | 'key'>): string {
  if (event.code.startsWith('Key')) return event.code.slice(3).toLowerCase()
  if (event.code.startsWith('Digit')) return event.code.slice(5)
  if (/^F\d+$/.test(event.code)) return event.code.toLowerCase()
  return CODE_KEYS[event.code] ?? event.key.toLowerCase()
}
