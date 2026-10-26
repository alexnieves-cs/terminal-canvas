import { IPC_EVENTS } from '@shared/ipc-contract'
import type { MenuKey } from '../host/wire'
import type { HostLink } from './ipc-renderer'
import { keyOf, parseAccelerator, type Combo } from './keys'
import './host.css'

/**
 * Lane Q (M591, M593). What the browser has to do that the Mac's window
 * chrome did: answer main's dialogs, open its links, match its menu keys,
 * and say so when the host connection is gone.
 *
 * Plain DOM outside #root, like lane N's strip: the renderer tree stays
 * exactly the app's, so what a person sees in the tab is what the app draws.
 */

const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)

// ── dialogs ────────────────────────────────────────────────────────────────

interface MessagePayload {
  type: string
  title: string
  message: string
  detail: string
  buttons: string[]
  defaultId: number
  cancelId: number
  checkboxLabel: string
  checkboxChecked: boolean
}

interface PathPayload { title: string; defaultPath: string; directory?: boolean }

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

/** One modal at a time, in order: main awaits each answer before it asks the next. */
let chain: Promise<unknown> = Promise.resolve()

function modal<T>(build: (box: HTMLElement, done: (value: T) => void) => void, onEscape: () => T): Promise<T> {
  const run = (): Promise<T> => new Promise((resolve) => {
    const scrim = el('div', 'tc-host-scrim')
    const box = el('div', 'tc-host-dialog')
    box.setAttribute('role', 'dialog')
    box.setAttribute('aria-modal', 'true')
    scrim.append(box)
    const previous = document.activeElement as HTMLElement | null
    const done = (value: T): void => {
      document.removeEventListener('keydown', onKey, true)
      scrim.remove()
      previous?.focus?.()
      resolve(value)
    }
    const onKey = (event: KeyboardEvent): void => {
      // The dialog owns the keyboard while it is up: nothing reaches a terminal behind it.
      event.stopPropagation()
      if (event.key === 'Escape') { event.preventDefault(); done(onEscape()) }
    }
    document.addEventListener('keydown', onKey, true)
    build(box, done)
    document.body.append(scrim)
    ;(box.querySelector('[data-autofocus]') as HTMLElement | null)?.focus()
  })
  const next = chain.then(run, run)
  chain = next
  return next
}

function messageBox(p: MessagePayload): Promise<{ response: number; checkboxChecked: boolean }> {
  let checked = p.checkboxChecked
  return modal((box, done) => {
    box.setAttribute('aria-label', p.title || p.message)
    box.append(el('p', 'tc-host-dialog__message', p.message))
    if (p.detail !== '') box.append(el('p', 'tc-host-dialog__detail', p.detail))
    if (p.checkboxLabel !== '') {
      const label = el('label', 'tc-host-dialog__check')
      const input = document.createElement('input')
      input.type = 'checkbox'
      input.checked = checked
      input.addEventListener('change', () => { checked = input.checked })
      label.append(input, document.createTextNode(` ${p.checkboxLabel}`))
      box.append(label)
    }
    const row = el('div', 'tc-host-dialog__buttons')
    p.buttons.forEach((text, index) => {
      const button = el('button', index === p.defaultId ? 'tc-host-dialog__button is-default' : 'tc-host-dialog__button', text)
      button.type = 'button'
      if (index === p.defaultId) button.dataset['autofocus'] = ''
      button.addEventListener('click', () => done({ response: index, checkboxChecked: checked }))
      row.append(button)
    })
    box.append(row)
  }, () => ({ response: p.cancelId, checkboxChecked: checked }))
}

/**
 * Open and save sheets, as a path field. The files are on the HOST, so the
 * browser's own file picker (which picks from this computer) would answer a
 * different question; the field is prefilled with main's suggestion.
 */
function pathBox(p: PathPayload, save: boolean): Promise<{ canceled: boolean; filePath?: string; filePaths: string[] }> {
  const cancel: { canceled: boolean; filePath?: string; filePaths: string[] } = { canceled: true, filePaths: [] }
  return modal((box, done) => {
    box.setAttribute('aria-label', p.title)
    box.append(el('p', 'tc-host-dialog__message', p.title))
    box.append(el('p', 'tc-host-dialog__detail', save
      ? 'Saved on the host. Type a path there.'
      : p.directory === true ? 'A folder on the host.' : 'A file on the host.'))
    const input = el('input', 'tc-host-dialog__field')
    input.value = p.defaultPath
    input.spellcheck = false
    input.dataset['autofocus'] = ''
    const submit = (): void => {
      const value = input.value.trim()
      if (value === '') { done(cancel); return }
      done({ canceled: false, filePath: value, filePaths: [value] })
    }
    input.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); submit() } })
    box.append(input)
    const row = el('div', 'tc-host-dialog__buttons')
    const no = el('button', 'tc-host-dialog__button', 'Cancel')
    no.type = 'button'
    no.addEventListener('click', () => done(cancel))
    const yes = el('button', 'tc-host-dialog__button is-default', save ? 'Save' : 'Open')
    yes.type = 'button'
    yes.addEventListener('click', submit)
    row.append(no, yes)
    box.append(row)
  }, () => cancel)
}

export function answerAsks(link: HostLink): void {
  link.onAsk(async (kind, payload) => {
    switch (kind) {
      case 'message': return messageBox(payload as MessagePayload)
      case 'open': return pathBox(payload as PathPayload, false)
      case 'save': return pathBox(payload as PathPayload, true)
      case 'open-url': {
        const { url } = payload as { url: string }
        // The host checked the scheme; the tab checks it again, since this is where it opens.
        if (/^(https?|mailto):/i.test(url)) window.open(url, '_blank', 'noopener,noreferrer')
        return null
      }
      default: return undefined
    }
  })
}

// ── keys ───────────────────────────────────────────────────────────────────

function matches(combo: Combo, event: KeyboardEvent): boolean {
  return combo.cmd === event.metaKey && combo.ctrl === event.ctrlKey && combo.alt === event.altKey &&
    combo.shift === event.shiftKey && combo.key === keyOf(event)
}

/**
 * The keys. Edit keys are answered in the tab: main's Edit menu sends
 * `edit:*` with ITS clipboard, which on a host is the server's, not this
 * computer's. Paste rides the browser's own paste event (no permission
 * prompt, and the text is this computer's clipboard); copy, undo and redo
 * are the same `edit:*` events main would have sent. Every other menu key
 * is sent to the host, which runs that item's click as the menu would.
 *
 * Capture phase on window, so a matched key never ALSO reaches a terminal
 * or a renderer listener: in the app an accelerator is consumed by the menu
 * before the page sees it, and the renderer was written for that.
 *
 * Off a Mac, Ctrl is the terminal's (Ctrl+C is SIGINT), so the edit keys are
 * left alone there and only the paste event is taken.
 */
export function bindKeys(link: HostLink): void {
  let menu: Array<{ id: string; combo: Combo }> = []
  link.onMenu((items: MenuKey[]) => {
    menu = items.flatMap((item) => {
      const combo = parseAccelerator(item.accelerator, isMac)
      return combo === null ? [] : [{ id: item.id, combo }]
    })
  })
  const edit = (event: KeyboardEvent): string | null => {
    if (!isMac || !event.metaKey || event.ctrlKey || event.altKey) return null
    const key = keyOf(event)
    if (key === 'z') return event.shiftKey ? IPC_EVENTS.EDIT_REDO : IPC_EVENTS.EDIT_UNDO
    if (key === 'c' && !event.shiftKey) return IPC_EVENTS.EDIT_COPY
    return null
  }
  window.addEventListener('keydown', (event) => {
    if (event.isComposing || document.querySelector('.tc-host-scrim') !== null) return
    const channel = edit(event)
    if (channel !== null) {
      event.preventDefault()
      event.stopImmediatePropagation()
      link.emitLocal(channel)
      return
    }
    // Cmd+V is left to the browser, which fires `paste` below with the clipboard's text.
    if (isMac && event.metaKey && keyOf(event) === 'v') return
    const hit = menu.find((m) => matches(m.combo, event))
    if (hit === undefined) return
    event.preventDefault()
    event.stopImmediatePropagation()
    link.menu(hit.id)
  }, true)
  window.addEventListener('paste', (event) => {
    if (document.querySelector('.tc-host-scrim') !== null) return
    const text = event.clipboardData?.getData('text/plain') ?? ''
    if (text === '') return
    event.preventDefault()
    event.stopImmediatePropagation()
    link.emitLocal(IPC_EVENTS.EDIT_PASTE, text)
  }, true)
}

// ── the connection ─────────────────────────────────────────────────────────

/**
 * A lost host is said, never hidden: a page whose doors all reject would
 * otherwise look alive and do nothing. A reload is the reconnect, because
 * the host treats a new tab as the app treats Cmd+R (sessions on tmux keep
 * running and reattach).
 */
export function watchConnection(link: HostLink): void {
  link.onLost((why) => {
    const scrim = el('div', 'tc-host-scrim')
    const box = el('div', 'tc-host-dialog')
    box.setAttribute('role', 'alertdialog')
    box.append(el('p', 'tc-host-dialog__message', why === 'replaced' ? 'Opened in another tab' : 'Lost the host'))
    box.append(el('p', 'tc-host-dialog__detail', why === 'replaced'
      ? 'This canvas is open in a newer tab, which has it now. Your terminals kept running.'
      : 'The connection to the host closed. Terminals on the host keep running; reconnect to pick them up.'))
    const row = el('div', 'tc-host-dialog__buttons')
    const again = el('button', 'tc-host-dialog__button is-default', why === 'replaced' ? 'Use it here' : 'Reconnect')
    again.type = 'button'
    again.addEventListener('click', () => location.reload())
    row.append(again)
    box.append(row)
    scrim.append(box)
    document.body.append(scrim)
    again.focus()
    if (why === 'closed') {
      // Back on its own when the host answers again (a redeploy, a dropped network).
      const poll = window.setInterval(() => {
        fetch('/healthz', { cache: 'no-store' }).then((r) => { if (r.ok) { window.clearInterval(poll); location.reload() } }, () => {})
      }, 3000)
    }
  })
}
