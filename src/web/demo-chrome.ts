import './demo.css'

/**
 * Lane N (M567). The two things the demo adds to the app's own page: a strip
 * that says what this is, and a notice that says "in the app" when a visitor
 * reaches a door that would spawn a process or write outside the page.
 *
 * Plain DOM, outside React and outside `styles.css`: the strip is the demo's,
 * not the product's, and the renderer tree under #root stays exactly the
 * app's, so what a visitor sees is what the app draws.
 */

export const REPO_URL = 'https://github.com/alexnieves-cs/terminal-canvas'
export const RELEASES_URL = `${REPO_URL}/releases/latest`

/** What a door does, said the way the notice says it. Unnamed doors fall back to the generic line. */
const DOOR_WORDS: Record<string, string> = {
  'pty.create': 'Starting a terminal',
  'pty.write': 'Typing into a terminal',
  'preset.spawnById': 'Starting an agent',
  'agentSession.create': 'Starting an agent',
  'agentSession.send': 'Sending to an agent',
  'agentSession.answer': 'Answering an agent',
  'file.open': 'Opening a file',
  'file.write': 'Saving a file',
  'file.create': 'Creating a file',
  'review.commit': 'Committing',
  'review.discard': 'Discarding changes',
  'github.publish': 'Publishing to GitHub',
  'board.openPr': 'Opening a pull request',
  'tonight.start': 'Starting Tonight',
  'routine.run': 'Running a routine',
  'watcher.create': 'Starting a watcher',
  'workspace.create': 'Making a workspace',
  'workspace.activate': 'Switching workspaces',
  'editor.open': 'Opening your editor',
  'links.open': 'Opening a link',
  'dialog.confirm': 'That step',
  'credential.set': 'Saving a key'
}

export function noticeText(door: string): string {
  const words = DOOR_WORDS[door] ?? (door.startsWith('export.') ? 'Exporting' : 'That')
  return `${words} runs in the app. This page is a demo with scripted agents.`
}

/** One notice per door per this long, so holding a key does not stack them. */
const REPEAT_MS = 4000
const SHOW_MS = 3600

export function installDemoChrome(doc: Document = document): { notice(door: string): void } {
  const strip = doc.createElement('div')
  strip.className = 'tc-demo-strip'
  strip.setAttribute('role', 'note')
  strip.innerHTML =
    '<span class="tc-demo-strip__what"><b>Live demo.</b> Scripted agents on a sample canvas; terminals are recordings.</span>' +
    `<a class="tc-demo-strip__get" href="${RELEASES_URL}" target="_blank" rel="noopener">Get the Mac app</a>` +
    `<a class="tc-demo-strip__src" href="${REPO_URL}" target="_blank" rel="noopener">Source</a>`
  const toast = doc.createElement('div')
  toast.className = 'tc-demo-notice'
  toast.setAttribute('role', 'status')
  toast.setAttribute('aria-live', 'polite')
  const mount = (): void => {
    doc.body.prepend(strip)
    doc.body.append(toast)
    doc.documentElement.classList.add('tc-demo')
  }
  if (doc.body) mount()
  else doc.addEventListener('DOMContentLoaded', mount, { once: true })

  const last = new Map<string, number>()
  let hide: ReturnType<typeof setTimeout> | undefined
  return {
    notice(door) {
      const now = Date.now()
      if ((last.get(door) ?? -Infinity) > now - REPEAT_MS) return
      last.set(door, now)
      toast.textContent = noticeText(door)
      toast.classList.add('is-shown')
      if (hide !== undefined) clearTimeout(hide)
      hide = setTimeout(() => toast.classList.remove('is-shown'), SHOW_MS)
    }
  }
}
