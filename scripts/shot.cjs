/* The screenshot harness. Not a verify suite, deliberately: it asserts
   nothing, it paints the real built renderer to PNGs so a person — or a
   fresh-context critic that never sees the code — can look at them.

   It exists because verify:styles says outright that it never renders
   anything, and the M36–M60 run built an entire visual language and never
   once looked at the result (M61's spec). Every scene below drives the
   renderer through the route a user takes — a chord, a click on a real
   control — never by reaching into React state, so what is painted is what
   a user would see after the same gestures.

   Run with: npm run build && npm run shot       (SHOT_DIR overrides out/shots)

   Output: <SHOT_DIR>/<scene>.png for every scene, plus manifest.json — the
   scene list with each scene's stated INTENT, which is what the critic is
   handed alongside the images. Add a scene by appending to SCENES; an intent
   is one sentence saying what the picture is supposed to show.

   Fenced like every Electron harness here: a throwaway userData, its own
   layout file, its own scrollback and projects directories, the direct
   backend (reattach is not a visual property), and never the production
   tmux sockets. It spawns real shells. */
const { join } = require('node:path')
const { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, realpathSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { execFileSync } = require('node:child_process')
const { buildSync } = require('esbuild')
const { app, BrowserWindow, webContents } = require('electron')

const OUT = process.env.SHOT_DIR || join(__dirname, '..', 'out', 'shots')
mkdirSync(OUT, { recursive: true })

// The subagent watcher resolves its projects root ONCE, at PtyManager
// construction, from this variable — set before the bundle is even required
// (verify-pty-manager.cjs's fence, same reason). A spaced path, this repo's rule.
process.env.TC_CLAUDE_PROJECTS = mkdtempSync(join(tmpdir(), 'tc shot projects '))

const ENTRY_OUT = join(__dirname, '..', 'out', 'verify', 'shot-entry.cjs')
buildSync({
  entryPoints: [join(__dirname, 'panels-entry.cjs')],
  outfile: ENTRY_OUT,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['node-pty', 'electron'],
  alias: {
    '@shared': join(__dirname, '..', 'src', 'shared'),
    '@renderer': join(__dirname, '..', 'src', 'renderer')
  }
})
const {
  registerIpcHandlers, PtyManager, createDirectBackend, resolveShellEnv, whichFromEnv,
  createLayoutStore, credentialStore, FileWatchers, ToolboxCache, createScrollbackLog,
  createReviewEngine, createGitRunner, createBaselineCapture, allTemplates, isBuiltInTemplate, allPresets, templateOf, createMemoryStore, createWatchRunner, readVault, listGithubWorkItems, createBrowserHandlers
} = require(ENTRY_OUT)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Never touch the real store: this harness spawns real shells.
app.setPath('userData', mkdtempSync(join(tmpdir(), 'tc-shot-')))
app.on('window-all-closed', () => {})

// ---------------------------------------------------------------------------
// Fixtures: a git repository with one modified file (a real review node), a
// project directory with a toolbox, a note, a scrollback log for a panel that
// is never started (the dormant card's tail, and something for search to hit).
// ---------------------------------------------------------------------------
const FIX = realpathSync(mkdtempSync(join(tmpdir(), 'tc shot fixtures ')))
const REPO = join(FIX, 'repo')
const NOTE = join(FIX, 'notes', 'plan.md')
mkdirSync(join(REPO, 'src'), { recursive: true })
mkdirSync(join(REPO, '.claude', 'commands'), { recursive: true })
mkdirSync(join(FIX, 'notes'), { recursive: true })
writeFileSync(join(REPO, 'src', 'server.ts'), 'export const port = 8080\nexport function start(): void {\n  console.log("listening")\n}\n')
writeFileSync(join(REPO, 'README.md'), '# fixture\n\nA repository the screenshot harness owns.\n')
writeFileSync(join(REPO, '.claude', 'settings.json'), JSON.stringify({ permissions: { allow: ['Bash(npm run *)', 'Read', 'Edit'], deny: ['Bash(rm -rf *)'] } }, null, 2))
writeFileSync(join(REPO, '.claude', 'commands', 'review.md'), 'Review the diff for correctness and name every silent failure.\n')
writeFileSync(join(REPO, '.claude', 'commands', 'deploy.md'), 'Run the deploy checklist and stop at the first red step.\n')
// M85. The notes folder IS the vault: the plan links to two other notes, one
// of which does not exist yet, and one note links back.
writeFileSync(NOTE, '# Plan\n\nSplit the flush gate out of onExit; the timer is the second door — see [[flush gate]] and [[decisions/tmux]].\n\nOpen question: [[what the watchdog should do]].\n\n- [ ] write the check first\n- [ ] watch it fail\n')
mkdirSync(join(FIX, 'notes', 'decisions'), { recursive: true })
writeFileSync(join(FIX, 'notes', 'flush gate.md'), '# Flush gate\n\nThe gate that keeps a kill from racing the last flush. Referenced from [[plan]].\n')
writeFileSync(join(FIX, 'notes', 'decisions', 'tmux.md'), '# tmux\n\nSessions live in tmux so agents outlive the app. See [[plan]] for the timer.\n')

let scrollbackDir = join(mkdtempSync(join(tmpdir(), 'tc shot scrollback ')), 'scrollback')
mkdirSync(scrollbackDir, { recursive: true })
writeFileSync(join(scrollbackDir, 'dormant.log'), [
  '$ npm test',
  '> fixture@1.0.0 test',
  '> node scripts/verify.cjs',
  'PASS  1 the parser accepts an absent key',
  'PASS  2 the parser drops a malformed key with a warning',
  'FAIL  3 the writer is atomic — ENOENT: no such file or directory, rename',
  '2/3 passed',
  'FAILED: 3 the writer is atomic',
  ''
].join('\r\n'))

const layoutPath = join(mkdtempSync(join(tmpdir(), 'tc shot layout ')), 'layout.json')

// M103. A dev server the browser panel opens to — the harness's own, so the
// scene needs no network and the address bar reads a real 127.0.0.1 url.
// The page looks like a preview (a heading, a status line, a list) rather
// than a placeholder, because the scene's claim is "the guest painted inside
// the frame", and a blank page proves nothing.
const SHOT_HTTP = require('node:http').createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(`<!doctype html><html><head><title>api — preview</title><style>body{margin:0;padding:24px 28px;font:15px/1.5 -apple-system,Helvetica,Arial,sans-serif;color:#1d2433;background:#fff}h1{font-size:22px;margin:0 0 4px}p{margin:0 0 14px;color:#5b6472}code{background:#f1f3f6;padding:2px 6px;border-radius:4px}ul{margin:0;padding-left:18px}li{margin:4px 0}.ok{color:#1a7f37}</style></head><body><h1>api — preview</h1><p>served by <code>npm run dev</code> · <span class="ok">listening</span></p><ul><li>GET /health → <code>200 ok</code></li><li>GET /users → <code>200</code> (3 rows)</li><li>POST /users → <code>201</code></li></ul></body></html>`)
})
const shotHttpReady = new Promise((resolve) => SHOT_HTTP.listen(0, '127.0.0.1', resolve))
const shotHttpUrl = () => `http://127.0.0.1:${SHOT_HTTP.address().port}/`

const term = (id, x, y, w, h, z, extra = {}) => ({ id, x, y, w, h, z, cwd: REPO, command: '/bin/sh', args: ['-c', 'echo "$ claude"; echo "Reading src/server.ts"; echo "Editing src/server.ts"; sleep 600'], ...extra })

// ---------------------------------------------------------------------------
// The scenes. Each `run` is handed the window and a small kit and ends with
// a capture; `intent` is written for a critic who cannot read this file.
// ---------------------------------------------------------------------------
const SCENES = [
  { name: 'launcher', intent: 'The empty canvas a fresh install sees: the launcher of real verbs, nothing else on the canvas.',
    run: async (k) => { await k.theme('light'); await k.shot('launcher') } },
  { name: 'kinds', intent: 'One of every panel kind side by side on the light theme: a live terminal, a dormant card with a recorded tail, a review node listing a changed file, a file panel, a note, a toolbox, and a Jira panel with no credential. Each should read as the same family of frame.',
    // The subagent scan lands a beat after the layout: wait for the notice
    // (up to 3s) so the scene does not depend on a race. M67's first shots
    // showed the notice in one scene and not the next for exactly this reason.
    run: async (k) => { await k.loadMain(); for (let i = 0; i < 30 && !(await k.js(`!!document.querySelector('[data-subagent-ambiguous]')`)); i++) await sleep(100); await k.shot('kinds') } },
  { name: 'kinds-dark', intent: 'The same panel kinds on the dark theme; the terminal well and every surface should follow the theme with the same hierarchy.',
    run: async (k) => { await k.theme('dark'); await k.shot('kinds-dark'); await k.theme('light') } },
  { name: 'chat', intent: 'A chat panel beside the live terminal: a restored conversation with a user turn, a collapsed tool call, the agent\'s answer in mono with no bubbles, the state pill reading asleep (a restored conversation with no process), a labelled `to terminal` verb after the pill, the composer pinned below with Send and Interrupt labelled — the same frame family as the terminal, not a chat app.',
    run: async (kit) => { await kit.goTo('api (chat)'); await kit.shot('chat') } },
  { name: 'integrations', intent: 'The Integrations page: the navigator\'s fifth pane, every service this app can reach on one page — each with its label, one of three sentences in its tone (connected as <label>, not connected — add a token, token rejected), one verb, and the broker\'s audit rows beneath it (method and path in mono, status, which panel asked, when; a refused call in red). What the agents did with a credential, and what to do when a service is not connected, in one place.',
    run: async (kit) => {
      // Two of the three states on screen: GitHub connected as octocat, Jira
      // with a token the last verify rejected. Seeded through the harness's
      // own store and cleared after, so the Jira panel elsewhere keeps its
      // no-credential arm.
      credentialStore.set('github', 'ghp_shot_token_000000000000000000000000')
      credentialStore.setLabel('github', 'octocat')
      credentialStore.set('jira', JSON.stringify({ site: 'https://acme.atlassian.net', email: 'me@acme.test', token: 'shot' }))
      credentialStore.markRejected('jira')
      await kit.js(`(() => { const b = document.querySelector('[data-dock="integrations"]'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true })); return !!b })()`)
      await sleep(900)
      await kit.js(`(() => { const b = document.querySelector('[data-integrations-refresh]'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true })); return !!b })()`)
      await sleep(900)
      await kit.shot('integrations')
      credentialStore.delete('github'); credentialStore.delete('jira')
      await kit.js(`(() => { const b = document.querySelector('[data-dock="panels"]'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true })); return !!b })()`)
    } },
  { name: 'github', intent: 'The GitHub work panel: the issues assigned to you and the pull requests waiting on your review as one list, each item led by its owner/repo#N in mono with its state, the title, the body\'s first line dim, and two verbs — Start session, which spawns an agent with the item as its opening context, and open on GitHub. Jira\'s shape reached by a second service, through the broker, so the panel\'s reads sit in the same audit as the agents\' own calls.',
    run: async (kit) => {
      await kit.goTo('GitHub work')
      await sleep(900)
      await kit.shot('github')
    } },
  { name: 'across', intent: 'A review of every worktree of one repository, in one node: the main tree first, then each worktree this app created, headed by what the user calls it and its branch, each with its own files and counts — and commit and discard blocked by name, because a commit across worktrees would be N commits pretending to be one. The context pane beside it names the repository on its identity line and says where the branch stands against its tracking ref, from the last fetch.',
    run: async (kit) => {
      await kit.goTo('every worktree of repo')
      await sleep(900)
      await kit.shot('across')
      // The other half of the intent: the context pane for the live panel
      // in that repository — its identity line and its branch line.
      await kit.goTo('claude — api')
      await kit.js(`(() => { const b = document.querySelector('[aria-label="Show the context pane"]'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true })); return !!b })()`)
      await sleep(900)
      await kit.shot('across-context')
      await kit.js(`(() => { const b = document.querySelector('[aria-label="Hide the context pane"]'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true })); return !!b })()`)
    } },
  { name: 'vault', intent: 'The vault: the navigator\'s fourth pane lists a folder of markdown notes by title, newest first, and the open note paints its `[[links]]` as links — a resolved one in the accent, an unresolved one dashed and offering to be created — with a Backlinks section beneath naming the notes that point here and the line. A note is still a file panel; a vault is many of them plus an index.',
    run: async (kit) => {
      await kit.js(`(() => { const b = document.querySelector('[data-dock="vault"]'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true })); return !!b })()`)
      await sleep(600)
      await kit.goTo('plan.md')
      await sleep(600)
      await kit.shot('vault')
      await kit.js(`(() => { const b = document.querySelector('[data-dock="panels"]'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true })); return !!b })()`)
    } },
  { name: 'watcher', intent: 'A watcher: a node that runs a command when something changes. The chrome row says WHEN in the same words everywhere (`on a change in src`), the body is the last run\'s output and one line saying how it ended, and the state is the ordinary vocabulary — a passing watcher reads `idle` in green on its own edge, in the rail and in the minimap, with no word invented for it.',
    run: async (kit) => {
      await kit.goTo('watcher · sh')
      await sleep(900)
      await kit.shot('watcher')
    } },
  { name: 'browser', intent: 'The browser pane beside the terminal that started its dev server: a live page painted INSIDE the panel frame, panned and clipped with the world like every other node. The chrome reads the page\'s real address (`http://127.0.0.1:…`, from the guest itself — never the page\'s title) beside one labelled verb, `Open in browser`; below it the app\'s own bar — `Back`, `Forward`, `Reload` as words, disabled with their reasons, and the address input — and then the page. A ruled edge from the dev server says `on exit 0`: the page reloads when the server comes back. The kind word `browser` sits in the rail and on the frame; no state is invented for a document.',
    run: async (kit) => {
      await kit.goTo('browser · 127.0.0.1')
      await sleep(1800)
      await kit.shot('browser')
    } },
  { name: 'teammate', intent: 'M100. The Teammates pane: the roster as rail rows (`ada · 1 place · 1 service · scheduled`, `bo · 0 places · 0 services · messaging`) with ada\'s record open beneath — her brief, her one place as a mono path with `remove` and `add a place…` (a folder dialog, never a typed path), the services with `grant`/`revoke` per service and `not connected` said where it is, the two permission checkboxes as separate controls, and `Chat as ada` / `Delete`. An identity with an explicit scope, three permissions kept apart.',
    run: async (k) => {
      await k.click('[data-dock="teammates"]'); await sleep(500)
      await k.click('[data-teammate-row="ada"] .rail-row__main'); await sleep(500)
      await k.shot('teammate')
    } },
  { name: 'routine', intent: 'M101. The same record\'s routines: `nightly review · every 10m` whose row says `missed at <time> — the app was closed` because its due tick fell while the app was closed and it was NOT fired, and `weekly tidy · every 1h · paused`; each with `Run now`, `Pause`/`Resume`, `Open last` (disabled by name when no run opened a chat) and `Delete`; the section header says `runs while the app is open — not while it is closed`; the form beneath to add one, its Add button enabled because ada may be scheduled.',
    run: async (k) => {
      await k.js(`(() => { const d = document.querySelector('[data-teammate-routines]'); if (d) d.scrollIntoView({ block: 'start' }); return !!d })()`)
      await sleep(300)
      await k.shot('routine')
      await k.click('[data-dock="panels"]'); await sleep(300)
    } },
  { name: 'memory', intent: 'The project memory as a node: what this repository has decided, tried and failed, newest first, each `kind · text · time`, with the count in the chrome row and one line to add another in the selected kind\'s own words. One list, written by people and agents alike — the same list `tc memory add` writes to from inside a panel. (A chat carries these with its FIRST message and says so above its composer; this scene\'s chat already has a history, so the note is not in frame.)',
    run: async (kit) => {
      await kit.goTo('memory · repo')
      await sleep(700)
      await kit.shot('memory')
    } },
  { name: 'supervisor', intent: 'The spawn sheet\'s supervisor row: `what` reads `supervisor of this canvas` and the preview says what it is — a chat that reads this canvas with `tc status`. One per canvas; the row says so when there already is one.',
    run: async (kit) => {
      await kit.press('k', { metaKey: true }); await sleep(400)
      await kit.type('new panel'); await sleep(300)
      await kit.js(`(() => { const i = document.querySelector('.palette__input'); if (i) i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return !!i })()`)
      await sleep(800)
      await kit.js(`(() => { const s = document.querySelector('[data-sheet-what]'); if (!s) return false; const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, '__supervisor__'); s.dispatchEvent(new Event('change', { bubbles: true })); return true })()`)
      await sleep(500)
      await kit.shot('supervisor')
      await kit.js(`(() => { const s = document.querySelector('[data-spawn-sheet]'); if (s) s.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); return !!s })()`)
      await sleep(300)
    } },
  { name: 'templates', intent: 'The spawn sheet opened on a template: `what` names `review this repository`, ONE field per parameter is asked (`repository`), and the preview line counts the shape it will make (`2 panels · 1 edge`). A shape of work, started with one thing filled in.',
    run: async (kit) => {
      await kit.press('k', { metaKey: true }); await sleep(400)
      await kit.type('new from review this repository'); await sleep(400)
      await kit.js(`(() => { const i = document.querySelector('.palette__input'); if (i) i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return !!i })()`)
      await sleep(800)
      await kit.js(`(() => { const i = document.querySelector('[data-sheet-hole="repository"]'); if (!i) return false; const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, ${JSON.stringify('~/work/api')}); i.dispatchEvent(new Event('input', { bubbles: true })); i.focus(); return true })()`)
      await sleep(500)
      await kit.shot('templates')
      await kit.js(`(() => { const s = document.querySelector('[data-spawn-sheet]'); if (s) s.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); return !!s })()`)
      await sleep(300)
    } },
  { name: 'runs', intent: 'A run that already happened: the Workspaces pane lists it — name, `3 panels`, its duration and cost, the word `done`, a `Run again` verb — and on the canvas its three panels wear a read-only frame with the run\'s name as its caps label; the context pane\'s Work tab for the target names the run it belongs to. A record of what the graph did, in the same words the graph uses.',
    run: async (kit) => {
      await kit.goTo('claude — api (2)')
      await kit.js(`window.canvas.settings.set('shell.inspectorOpen', true)`)
      await kit.js(`(() => { const b = document.querySelector('[data-dock="workspaces"]'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true })); return !!b })()`)
      await kit.js(`(() => { const c = document.querySelector('.panel[data-panel-id="twin"] .pf__chrome'); if (c) c.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); return !!c })()`)
      await sleep(300)
      await kit.js(`(() => { const t = document.querySelector('[data-context-tab="work"]'); if (t) { t.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); t.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) } return !!t })()`)
      await sleep(700)
      await kit.shot('runs')
    } },
  { name: 'graph', intent: 'The task graph: two ruled edges into the second terminal — the chat\'s after a turn, worker a\'s on exit 0 — each saying what it does on the line in mono; the edge from the chat is selected (accent stroke, its badge the remove control) and the context pane shows it as an Edge: source → target, the rule as a labelled select, Label… and Remove. An edge is a thing you can pick up.',
    run: async (kit) => {
      await kit.goTo('claude — api (2)')
      await kit.js(`window.canvas.settings.set('shell.inspectorOpen', true)`)
      await sleep(300)
      await kit.js(`(() => { const hit = document.querySelector('[data-link-hit="chat:twin"]'); if (hit) hit.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return !!hit })()`)
      await sleep(700)
      await kit.shot('graph')
    } },
  { name: 'tool-objects', intent: 'A tool call as an object: in the chat, the Edit row\'s `diff` verb is open and shows the hunk against the chat\'s baseline in the review node\'s own line idiom; the context pane\'s Changes section answers for the chat; a review node opened from it lists server.ts with `· 2 tool calls` and, expanded, the Read and the Edit that touched it. One vocabulary for what happened to a file, whichever surface says it.',
    run: async (kit) => {
      await kit.goTo('api (chat)')
      await kit.js(`window.canvas.settings.set('shell.inspectorOpen', true)`)
      await kit.js(`(() => { const body = document.querySelector('.panel[data-panel-id="chat"] .chat__body'); if (body) body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); return !!body })()`)
      await sleep(400)
      await kit.js(`(() => { const row = document.querySelector('.panel[data-panel-id="chat"] [data-chat-tool="Edit"]'); const b = row && row.querySelector('[data-chat-tool-diff]'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return !!b })()`)
      await sleep(900)
      await kit.js(`(() => { const b = document.querySelector('[data-inspector-action="review"]'); if (b && !b.disabled) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return !!b })()`)
      await sleep(900)
      await kit.js(`(() => { const b = [...document.querySelectorAll('.review-node')].pop()?.querySelector('[data-review-node-file="src/server.ts"] .review-node__file-button'); if (b) b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 })); return !!b })()`)
      await sleep(900)
      await kit.goTo('review: claude — api (chat)')
      await sleep(400)
      // The pane shows the CHAT's Changes (the Work tab), the camera stays on the node.
      await kit.js(`(() => { const body = document.querySelector('.panel[data-panel-id="chat"] .chat__body'); if (body) body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); return !!body })()`)
      await sleep(300)
      await kit.js(`(() => { const t = document.querySelector('[data-context-tab="work"]'); if (t) { t.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); t.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) }; return !!t })()`)
      await sleep(700)
      await kit.shot('tool-objects')
    } },
  { name: 'composer', intent: 'The chat panel\'s composer at work: a dropped image as a dim mono line above the textarea (its name and a labelled `remove`), and the `@` file list open under a half-typed reference — rows in mono, directories first, the same hairline family as the frame; nothing floats over the canvas.',
    run: async (kit) => {
      await kit.goTo('api (chat)')
      await kit.js(`(() => { const p = document.querySelector('.panel[data-panel-id="chat"]'); const host = document.querySelector('.canvas').getBoundingClientRect(); const r = p.getBoundingClientRect(); return window.__m59Drop(${JSON.stringify(join(FIX, 'shot.png'))}, r.left + r.width / 2 - host.left, r.top + r.height / 2 - host.top) })()`)
      await sleep(300)
      await kit.js(`(() => { const ta = document.querySelector('.panel[data-panel-id="chat"] [data-chat-input]'); if (!ta) return false
        const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(ta, 'wire /health like @s'); ta.setSelectionRange(20, 20); ta.dispatchEvent(new Event('input', { bubbles: true })); ta.focus(); return true })()`)
      await sleep(700)
      await kit.shot('composer')
    } },
  { name: 'approval', intent: 'An agent asking permission, seen from afar: the chat card reads `needs you` in amber with the question (tool and argument in mono) and Allow / Deny; the dock badge counts one; the attention popover\'s row for it names the tool on its Allow verb with the argument beneath, while a terminal\'s row (if any) says only jump; the context pane\'s action bar leads with Allow Bash and Deny. The same question, answerable in three places, one vocabulary.',
    run: async (kit) => {
      await kit.goTo('api (chat)')
      await kit.js(`(() => { const ta = document.querySelector('.panel[data-panel-id="chat"] [data-chat-input]'); if (!ta) return false
        const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(ta, 'run the tests'); ta.dispatchEvent(new Event('input', { bubbles: true }))
        const b = document.querySelector('.panel[data-panel-id="chat"] [data-chat-send]'); if (!b || b.disabled) return 'send disabled'; b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return true })()`)
      await sleep(600)
      await kit.js(`window.canvas.settings.set('shell.inspectorOpen', true)`)
      await kit.js(`(() => { const body = document.querySelector('.panel[data-panel-id="chat"] .chat__body'); if (body) body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); return !!body })()`)
      await sleep(300)
      await kit.js(`(() => { const b = document.querySelector('[data-dock="attention"]'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true })); return !!b })()`)
      await sleep(500)
      await kit.shot('approval')
    } },
  { name: 'verbs', intent: 'M96. The verb line: the palette in text mode on `Run a verb…` after a typed step was refused — the refusal and its fix on the palette\'s own feedback line (`step 1: no panel is called zz9 — name a panel by its id…`), the typed line kept for correction. A plan is shown and refused by name before anything runs.',
    run: async (k) => {
      await k.press('k', { metaKey: true }); await sleep(500)
      await k.type('run a verb'); await sleep(400)
      await k.enter(); await sleep(500)
      await k.type('close zz9'); await sleep(200)
      await k.enter(); await sleep(600)
      await k.shot('verbs')
      await k.press('Escape'); await sleep(300); await k.press('Escape'); await sleep(300)
    } },
  { name: 'auto', intent: 'M97. A chat wearing a running auto chip beside its state pill (`auto · complete · 0/8` with a ring) after the chat\'s `auto` verb opened the palette on the Auto rows and Complete was chosen; the opening prompt drew a permission question, so the approval card is up with its verbs — Allow, Allow for session, Deny. The chip is a projection of main\'s count; the card is the same question every attention surface answers.',
    run: async (k) => {
      await k.goTo('api (chat)')
      await k.click('.panel[data-panel-id="chat"] [data-chat-auto-open]'); await sleep(500)
      await k.type('auto: complete'); await sleep(400)
      await k.enter(); await sleep(900)
      // Back to the chat: the row's run moved nothing, and the card sits under the composer.
      await k.goTo('api (chat)')
      await k.js(`window.canvas.settings.set('shell.inspectorOpen', true)`)
      // Fixture panels sit over this chat: Maximise (the M92 verb, through the
      // palette on the focused chat) fills the window with it — the chip, the
      // transcript and the card all in frame. The user's own route.
      await k.js(`(() => { const body = document.querySelector('.panel[data-panel-id="chat"] .chat__body'); if (body) body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); return !!body })()`)
      await sleep(200)
      await k.press('k', { metaKey: true }); await sleep(400)
      await k.type('maximise panel'); await sleep(300)
      await k.enter(); await sleep(700)
      await k.js(`window.canvas.settings.set('shell.inspectorOpen', true)`)
      await sleep(400)
      await k.shot('auto')
    } },
  { name: 'subagents', intent: 'Two live terminals share one repository, so the app cannot attribute subagents; the notice beside them should read as a deliberate card, not a rendering error.',
    run: async (k) => { await k.goTo('claude — api (2)'); await k.shot('subagents') } },
  { name: 'palette', intent: 'The command palette at rest (Cmd+K) over the canvas: sections, rows, disabled rows with their reasons, and the footer.',
    run: async (k) => { await k.press('k', { metaKey: true }); await sleep(600); await k.shot('palette') } },
  { name: 'palette-query', intent: 'The palette filtered by the word "group": matching rows with highlighted matches, and any disabled row naming why.',
    run: async (k) => { await k.type('group'); await sleep(400); await k.shot('palette-query'); await k.closePalette() } },
  { name: 'spawn-sheet', intent: 'The spawn sheet (New panel…): what, where with its suggestions, title, and for an agent preset its mode, effort and model; a preview line and the keys in the foot.',
    run: async (k) => { await k.click('.shell__spawn'); await sleep(700); await k.js(`(() => { const s = document.querySelector('[data-sheet-what]'); if (!s) return false; s.value = 'claude'; s.dispatchEvent(new Event('change', { bubbles: true })); return true })()`); await sleep(200); await k.js(`(() => { const w = document.querySelector('[data-sheet-where]'); if (w) { w.focus(); w.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })) } return !!w })()`); await sleep(600); await k.shot('spawn-sheet'); await k.js(`(() => { const w = document.querySelector('[data-sheet-where]'); if (w) w.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return true })()`); await sleep(300) } },
  { name: 'palette-dark', intent: 'The palette at rest on the dark theme.',
    run: async (k) => { await k.theme('dark'); await k.press('k', { metaKey: true }); await sleep(600); await k.shot('palette-dark'); await k.closePalette(); await k.theme('light') } },
  { name: 'search', intent: 'Search across every panel (Cmd+F) for "FAIL": hits from the durable log, each naming its panel, with the matching line.',
    run: async (k) => { await k.press('f', { metaKey: true, code: 'KeyF' }); await sleep(500); await k.type('FAIL'); await sleep(900); await k.shot('search') } },
  { name: 'search-empty', intent: 'The same search with a term nothing said: an empty state that names the term and says there were no matches, not a blank list.',
    run: async (k) => { await k.type('zzqx'); await sleep(900); await k.shot('search-empty'); await k.closePalette() } },
  { name: 'inspector-detail', intent: 'The context pane open on the live terminal, Detail tab: identity pinned at the top, fields below, an action bar pinned at the bottom.',
    run: async (k) => { await k.selectRail('live'); await k.context(true); await k.tab('detail'); await k.shot('inspector-detail') } },
  { name: 'inspector-work', intent: 'The context pane, Work tab: what the panel has changed, run and cost — every section either answers, says nothing to show, or says it is still asking.',
    run: async (k) => { await k.tab('work'); await sleep(600); await k.shot('inspector-work') } },
  { name: 'inspector-tools', intent: 'The context pane, Tools tab: what this panel\'s agent can do — permissions and commands from its toolbox.',
    run: async (k) => { await k.tab('tools'); await sleep(600); await k.shot('inspector-tools'); await k.context(false) } },
  { name: 'navigator-panels', intent: 'The dock\'s Panels pane: one row per panel with its state, the selected row marked.',
    run: async (k) => { await k.dock('panels'); await k.shot('navigator-panels') } },
  { name: 'navigator-workspaces', intent: 'The dock\'s Workspaces pane: the two canvases, the active one marked.',
    run: async (k) => { await k.dock('workspaces'); await k.shot('navigator-workspaces') } },
  { name: 'navigator-files', intent: 'The dock\'s Files pane: a file tree rooted on the selected panel\'s directory.',
    run: async (k) => { await k.dock('files'); await sleep(500); await k.shot('navigator-files'); await k.dock('panels') } },
  { name: 'attention', intent: 'A panel rang its bell: the dock badge counts one, and the popover lists the waiting panel with a way to jump to it.',
    run: async (k) => { await k.focus('live'); await k.ring(); await k.click('[data-dock="attention"]'); await sleep(400); await k.shot('attention'); await k.press('Escape'); await sleep(200) } },
  { name: 'overview', intent: 'The minimap in the top-right corner at 100%: one block per panel in its state colour — the waiting panel amber — and the camera as an iris rectangle; the status board while working.',
    run: async (k) => { await k.shot('overview') } },
  { name: 'group', intent: 'A named, coloured group frame around two panels, with its label, member count, and its card and remove controls in the header.',
    run: async (k) => { await k.goTo('the workers'); await k.wake('groupA'); await k.shot('group') } },
  { name: 'group-collapsed', intent: 'The same group carded: its live member is now a card inside a dashed frame, and nothing was closed.',
    run: async (k) => { await k.click('.canvas-group__toggle'); await sleep(500); await k.shot('group-collapsed'); await k.click('.canvas-group__toggle'); await sleep(300) } },
  { name: 'merged', intent: 'The merged view: every workspace\'s panels at once in labelled lanes, read-only, with the door to leave it visible.',
    run: async (k) => { await k.goTo('the kinds'); await k.click('.shell__merge'); await sleep(900); await k.zoom(0.25); await k.shot('merged'); await k.click('.shell__merge'); await sleep(500); await k.zoom(1) } },
  { name: 'zoomed-out', intent: 'The canvas pulled back to about a fifth of its size: cards become summaries whose title and state are still legible; the shell chrome does not shrink.',
    run: async (k) => { await k.goTo('the kinds'); await k.zoom(0.22); await k.shot('zoomed-out') } },
  { name: 'zoomed-out-dark', intent: 'The zoomed-out canvas on the dark theme.',
    run: async (k) => { await k.theme('dark'); await k.shot('zoomed-out-dark'); await k.theme('light'); await k.zoom(1) } },
  { name: 'compact', intent: 'The shell at its compact breakpoint (1000px wide): the navigator and context become drawers, the canvas keeps the width.', size: [1000, 760],
    run: async (k) => { await k.context(true); await sleep(400)
      if (process.env.SHOT_PROBE) console.log('PROBE compact', await k.js(`(() => { const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [s, Math.round(b.top), Math.round(b.bottom), Math.round(b.height), getComputedStyle(e).display, getComputedStyle(e).height] }
        return JSON.stringify([r('.shell'), r('.shell__inspector'), r('.shell__inspector > *'), r('.context'), r('.context__header'), r('.context__tabs'), r('.context__body'), r('.inspector__actions'), r('.context__panel[data-context-panel="tools"]')]) })()`))
      await k.shot('compact'); await k.context(false) } },
  { name: 'wide', intent: 'The shell at its wide breakpoint (1800px): navigator and context pane both resident, canvas between them.', size: [1800, 1000],
    run: async (k) => { await k.context(true); await sleep(400); await k.shot('wide') } }
]

app.whenReady().then(async () => {
  await shotHttpReady
  const win = new BrowserWindow({
    show: false,
    width: 1440,
    height: 900,
    webPreferences: {
      preload: join(__dirname, '..', 'out', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
      // M103. The browser pane is a <webview>; the tag on, as production has it.
      webviewTag: true
    }
  })
  const wc = win.webContents
  const loginEnv = await resolveShellEnv()

  // A real repository with one modified file, so the review node has a row.
  const gitPath = whichFromEnv('git', loginEnv)
  const git = (args) => execFileSync(gitPath, ['-C', REPO, ...args], { encoding: 'utf8', env: { ...loginEnv, GIT_AUTHOR_NAME: 'shot', GIT_AUTHOR_EMAIL: 'shot@example.invalid', GIT_COMMITTER_NAME: 'shot', GIT_COMMITTER_EMAIL: 'shot@example.invalid' } })
  git(['init', '-q'])
  git(['add', '.'])
  git(['commit', '-q', '-m', 'fixture'])
  const baselineSha = git(['rev-parse', 'HEAD']).trim()
  // M86. Two worktrees the "app" created for the fixture repository, one with
  // a change, so the cross-worktree scene shows a changed and a clean section.
  // After the repository's own init and commit above, through the same helper.
  const REPO_ROOT = git(['rev-parse', '--show-toplevel']).trim()
  const REPO_HEAD = baselineSha
  const WT_DIR = join(FIX, 'worktrees')
  mkdirSync(WT_DIR, { recursive: true })
  const WT_A = join(WT_DIR, 'tc-api-health'); const WT_B = join(WT_DIR, 'tc-tests')
  git(['worktree', 'add', '-q', '-b', 'tc/api-20260904-1100', WT_A, 'HEAD'])
  git(['worktree', 'add', '-q', '-b', 'tc/tests-20260904-1102', WT_B, 'HEAD'])
  writeFileSync(join(WT_A, 'src', 'server.ts'), 'export const port = 8080\nexport function start(): void {\n  console.log("listening on", port)\n}\nexport function health(): string { return "ok" }\n')
  writeFileSync(join(WT_A, 'src', 'health.ts'), 'export const ok = () => true\n')
  writeFileSync(join(REPO, 'src', 'server.ts'), 'export const port = 8081\nexport function start(): void {\n  console.log("listening on", port)\n}\n')
  writeFileSync(join(REPO, 'src', 'health.ts'), 'export const ok = (): boolean => true\n')
  // M75. An image for the composer scene's drop.
  writeFileSync(join(FIX, 'shot.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52]))

  // The layout: one workspace with every kind, a group, a bookmark; a second
  // workspace with two panels, for the merged view and the workspaces pane.
  // WRITTEN, not loaded, until the launcher scene has run: the store below
  // is created over this path while the file does not exist yet, so the
  // first load is the empty canvas a fresh install sees.
  const writeFixtureLayout = () => writeFileSync(layoutPath, JSON.stringify({
    version: 1,
    activeWorkspaceId: 'w1',
    workspaces: [{
      id: 'w1', name: 'api', camera: { x: 0, y: 0, scale: 1 }, selectedId: 'live', focusedId: null,
      panels: [
        // M78. Two ruled edges INTO `twin` (the second terminal): a join of the
        // chat (after a turn) and worker a (on exit 0); every ruled edge says
        // what it does. Twin sits in open space, so the edges are visible.
        term('live', 30, 30, 380, 250, 1, { locked: true, title: 'claude — api' }),
        // M74. Marked a claude session so the frame shows the terminal-side
        // front-end verb (it is dormant: no live process, the precondition).
        { id: 'dormant', pinned: true, x: 660, y: 30, w: 440, h: 250, z: 2, cwd: REPO, command: '/bin/sh', args: ['-c', 'sleep 600'], agent: 'claude-code', title: 'tests' },
        { id: 'review', kind: 'review', x: 30, y: 310, w: 350, h: 230, z: 3, subject: { subjectId: 'live', repoRoot: REPO, baselineSha, label: 'claude — api' } },
        { id: 'file', kind: 'file', x: 410, y: 310, w: 360, h: 230, z: 4, source: { path: join(REPO, 'src', 'server.ts') } },
        { id: 'note', kind: 'file', x: 800, y: 310, w: 340, h: 420, z: 5, source: { path: NOTE, prose: true } },
        { id: 'toolbox', kind: 'toolbox', x: 30, y: 570, w: 380, h: 210, z: 6, source: { cwd: REPO } },
        { id: 'jira', kind: 'jira', x: 440, y: 570, w: 300, h: 210, z: 7 },
        // M88. The GitHub work panel over a recorded broker.
        { id: 'github', kind: 'github', x: 1800, y: 900, w: 460, h: 440, z: 15 },
        // M103. A dev server beside the browser pane that shows it, with a
        // ruled edge from the one into the other: on exit 0, reload.
        term('dev', 1550, 120, 360, 250, 16, { title: 'dev server', args: ['-c', 'echo "$ npm run dev"; echo "listening on http://127.0.0.1:3000"; sleep 600'], links: [{ to: 'browser', automation: { kind: 'handoff', enabled: true, trigger: 'exit-ok' } }] }),
        { id: 'browser', kind: 'browser', x: 1950, y: 120, w: 560, h: 420, z: 17, url: shotHttpUrl() },
        // M86. One review over every worktree of the fixture repository.
        { id: 'across', kind: 'review', x: 1200, y: 1300, w: 560, h: 420, z: 14,
          subject: { subjectId: 'live', repoRoot: REPO_ROOT, baselineSha: REPO_HEAD, label: 'every worktree of repo', across: true } },
        // M84. A watcher: a command run on a trigger, mid-canvas.
        { id: 'watch', kind: 'watcher', x: 440, y: 900, w: 520, h: 340, z: 13,
          watch: { cwd: REPO, command: '/bin/sh', args: ['-c', 'echo "tests 41 passed, 0 failed"; echo "typecheck clean"; exit 0'], trigger: { kind: 'path', path: REPO + '/src' } } },
        // M83. The project memory as a document node.
        { id: 'memory', kind: 'memory', x: 1200, y: 570, w: 460, h: 420, z: 12, source: { root: REPO } },
        // M73. A chat panel with a recorded conversation in its durable file
        // (seeded below), so the scene shows a transcript with no process.
        { id: 'chat', kind: 'chat', x: 770, y: 570, w: 560, h: 360, z: 11, title: 'claude — api (chat)', chat: { cwd: REPO, sessionId: '55555555-5555-4555-8555-555555555555' }, links: [{ to: 'twin', automation: { kind: 'handoff', enabled: true, trigger: 'idle' } }] },
        // M90. The second backend beside the first: the chrome names it, the rest is the same panel.
        { id: 'codex', kind: 'chat', x: 1130, y: 120, w: 340, h: 300, z: 11, title: 'codex — api thread', chat: { cwd: REPO, sessionId: 'thread-0199a1b2', backend: 'codex' } },
        term('twin', 1400, 1000, 480, 300, 8, { title: 'claude — api (2)', args: ['-c', 'echo "$ claude"; echo "Waiting for input"; read x; printf "\\a? Allow Edit on src/server.ts (y/n)\\n"; sleep 600'] }),
        term('groupA', 60, 1440, 420, 260, 9, { title: 'worker a', cwd: FIX, links: [{ to: 'twin', automation: { kind: 'handoff', enabled: true, trigger: 'exit-ok' } }] }),
        term('groupB', 520, 1440, 420, 260, 10, { title: 'worker b', cwd: FIX })
      ],
      groups: [{ id: 'g1', label: 'workers', colour: 'violet', panelIds: ['groupA', 'groupB'] }],
      // M79. A run that already happened: the chat and worker a handed off into twin.
      runs: [{ id: 'run-1', name: 'run 1', panelIds: ['chat', 'groupA', 'twin'], edges: [{ from: 'chat', to: 'twin' }, { from: 'groupA', to: 'twin' }], startedAt: Date.now() - 3600000, endedAt: Date.now() - 3480000, entries: [{ panelId: 'chat', startedAt: Date.now() - 3600000, endedAt: Date.now() - 3590000, outcome: 'a turn' }, { panelId: 'groupA', startedAt: Date.now() - 3600000, endedAt: Date.now() - 3560000, outcome: 'exit 0' }, { panelId: 'twin', startedAt: Date.now() - 3560000, endedAt: Date.now() - 3480000, outcome: 'exit 0' }], costUsd: 0.2138 }],
      bookmarks: [{ id: 'b1', name: 'the workers', camera: { x: 0, y: -1380, scale: 1 } }, { id: 'b2', name: 'the kinds', camera: { x: 0, y: 0, scale: 1 } }],
      // M93. Notes in the margins: one on the canvas, one on a panel.
      annotations: [{ id: 'note-1', text: 'the api pair — worker b takes over on exit 0', anchor: { kind: 'world', x: 30, y: 318 } }, { id: 'note-2', text: 'flaky since the watchdog change', anchor: { kind: 'panel', panelId: 'dormant', dx: 12, dy: 262 } }]
    }, {
      id: 'w2', name: 'docs', camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null,
      panels: [
        { id: 'docsA', x: 40, y: 40, w: 480, h: 300, z: 1, cwd: FIX, command: '/bin/sh', args: ['-c', 'sleep 600'], title: 'docs writer' },
        { id: 'docsB', x: 560, y: 40, w: 480, h: 300, z: 2, cwd: FIX, command: '/bin/sh', args: ['-c', 'sleep 600'], title: 'docs reviewer' }
      ],
      groups: [], bookmarks: []
    }],
    presets: [], defaultPresetId: 'shell', prompts: [],
    // M100/M101. The roster and a routine: ada may work in the repo and spend
    // GitHub; her nightly routine last ran an hour ago at a ten-minute interval,
    // so arming marks it MISSED — the row must say so with the time.
    teammates: [
      { id: 'ada', name: 'ada', brief: 'You review pull requests for the api repository and never merge them yourself.', places: [REPO], services: ['github'], skills: [], memory: 'ada', chats: [], messaging: false, scheduling: true },
      { id: 'bo', name: 'bo', brief: '', places: [], services: [], skills: [], memory: 'bo', chats: [], messaging: true, scheduling: false }
    ],
    routines: [
      { id: 'nightly', name: 'nightly review', teammateId: 'ada', everyMs: 600000, prompt: 'Summarise what changed in the repository since the last run and list anything that looks unfinished.', plan: 'focus chat', paused: false, lastRun: { at: Date.now() - 3600000, outcome: 'started', panelId: 'chat' }, missed: { at: Date.now() - 3000000 } },
      { id: 'weekly', name: 'weekly tidy', teammateId: 'ada', everyMs: 3600000, prompt: 'Draft a tidy-up plan.', paused: true }
    ],
    worktrees: [
      { id: 'wt-a', root: REPO_ROOT, path: WT_A, branch: 'tc/api-20260904-1100', createdAt: Date.now() - 3600000, panelId: 'live' },
      { id: 'wt-b', root: REPO_ROOT, path: WT_B, branch: 'tc/tests-20260904-1102', createdAt: Date.now() - 3000000, panelId: 'dormant' }
    ],
    preferences: { 'appearance.theme': 'light', 'scrollback.persist': true, 'agent.bell': true, 'placement.snap': false, 'vault.root': join(FIX, 'notes') },
    // M77. The chat's baseline too: the fixture's edit to server.ts predates
    // boot, so it is seeded rather than captured (as the terminal's is).
    baselines: { live: { root: REPO, sha: baselineSha }, chat: { root: REPO, sha: baselineSha } }
  }), 'utf8')

  const layoutStore = createLayoutStore({ filePath: layoutPath })
  layoutStore.load()
  const scrollbackLog = createScrollbackLog({ dir: scrollbackDir })
  const backend = () => createDirectBackend('shot: direct')
  const gitRunner = createGitRunner({ gitPath: () => gitPath, env: () => loginEnv })
  const reviewEngine = createReviewEngine({
    run: gitRunner,
    baselineOf: (panelId) => layoutStore.baseline(panelId),
    peersInRepo: (root, except) => layoutStore.baselinePeers(root, except),
    notARepo: (panelId) => baselineCapture.isNotARepo(panelId)
    ,
    // M86. The scene's two worktree records, as main wires them.
    worktreesOf: (root) => layoutStore.worktrees().filter((w) => w.root === root).map((w) => ({ path: w.path, branch: w.branch, panelId: w.panelId, ...(w.panelId === 'live' ? { panelTitle: 'claude — api' } : {}) }))
  })
  const baselineCapture = createBaselineCapture({
    baselineOf: (panelId) => layoutStore.baseline(panelId),
    setBaseline: (panelId, baseline) => layoutStore.setBaseline(panelId, baseline),
    resolveRepo: (cwd) => reviewEngine.resolveRepo(cwd),
    captureBaseline: (root) => reviewEngine.captureBaseline(root)
  })
  const ptyManager = new PtyManager(
    () => wc, backend,
    () => Number(layoutStore.getSetting('agent.idleAfterMs')),
    () => layoutStore.getSetting('agent.bell') === true,
    (panelId, cwd) => baselineCapture.capture(panelId, cwd),
    (panelId) => { baselineCapture.drop(panelId); layoutStore.dropBaseline(panelId) },
    (panelId) => layoutStore.session(panelId),
    (panelId, sessionId) => layoutStore.setSession(panelId, sessionId),
    (panelId) => layoutStore.dropSession(panelId),
    undefined, undefined, undefined, undefined,
    {
      append: (panelId, data) => scrollbackLog.append(panelId, data),
      drop: (panelId) => scrollbackLog.drop(panelId),
      enabled: () => layoutStore.getSetting('scrollback.persist') === true
    }
  )
  // M73. The agent-session runtime over a FAKE runner (nothing is sent in a
  // scene; the manager exists so agent:create answers a real snapshot), and
  // a transcript log seeded with a recorded conversation so the chat panel
  // renders yesterday's turns exactly as a restored panel does.
  // From the bundled kit (panels-entry.cjs), never a direct require of a
  // TypeScript module: Electron's main loader cannot read one, and the
  // throw lands at module scope where it reads as a hang.
  const { AgentSessionManager, createAgentTranscriptLog, createApprovalTracker, IPC_EVENTS: SHOT_EVENTS } = require(ENTRY_OUT)
  const agentTranscripts = createAgentTranscriptLog({ dir: join(mkdtempSync(join(tmpdir(), 'tc-shot-chat-')), 'agent-transcripts') })
  // M76. The runner answers a user line with a permission request and never
  // finishes the turn: the `approval` scene is the question, waiting.
  const agentSessions = new AgentSessionManager({
    runner: () => {
      const cbs = []
      return {
        pid: 1,
        write(line) {
          let parsed = null
          try { parsed = JSON.parse(line) } catch { parsed = null }
          if (parsed && parsed.type === 'user') {
            setTimeout(() => { for (const cb of cbs) cb(JSON.stringify({ type: 'control_request', request_id: 'req-shot-1', request: { subtype: 'can_use_tool', tool_name: 'Bash', input: { command: 'npm test -- --watch=false', description: 'run the tests' }, tool_use_id: 'tu-1' } }) + '\n') }, 30)
          }
        },
        onData(cb) { cbs.push(cb) }, onExit() {}, kill() {}
      }
    },
    command: '/fake/claude', env: {}, newSessionId: () => 'shot-session'
  })
  const approvalTracker = createApprovalTracker({
    sink: { notify() {}, badge() {}, beep() {}, windowFocused: () => true, notifyEnabled: () => false, soundEnabled: () => false },
    emitState: (panelId, state) => { if (!wc.isDestroyed()) wc.send(SHOT_EVENTS.AGENT_STATE, { panelId, state }) },
    label: () => 'api'
  })
  agentSessions.subscribe((event) => {
    approvalTracker.apply(event)
    if (!wc.isDestroyed()) wc.send(SHOT_EVENTS.AGENT_EVENT, event)
  })
  const seedChatTranscript = (panelId) => {
    const at = Date.now() - 3600000
    agentTranscripts.appendTurn(panelId, { id: 'u-1', role: 'user', blocks: [{ type: 'text', text: 'What does src/server.ts export, and is the health check wired?' }], at })
    agentTranscripts.appendTurn(panelId, { id: 'm1', role: 'assistant', blocks: [{ type: 'thinking', text: '' }, { type: 'tool_use', id: 't1', name: 'Read', input: { file_path: join(REPO, 'src', 'server.ts') } }, { type: 'tool_use', id: 't1b', name: 'Edit', input: { file_path: join(REPO, 'src', 'server.ts'), old_string: '8080', new_string: '8081' } }], model: 'claude-haiku-4-5-20251001', at: at + 1000 })
    agentTranscripts.appendTurn(panelId, { id: 'u-2', role: 'user', blocks: [{ type: 'tool_result', toolUseId: 't1', content: 'export const start = () => listen(3000)\nexport const health = () => ok()', isError: false }], at: at + 1500 })
    agentTranscripts.appendTurn(panelId, { id: 'm2', role: 'assistant', blocks: [{ type: 'text', text: 'It exports `start` and `health`. The health check exists but nothing routes to it yet — `start` only calls `listen(3000)`.\n\nWant me to wire `/health` to it?' }], model: 'claude-haiku-4-5-20251001', at: at + 4000 })
    agentTranscripts.appendMeta(panelId, { usage: { input: 18, output: 96, cacheWrite: 40101, cacheRead: 79671 }, costUsd: 0.0895, turns: 1 })
  }
  seedChatTranscript('chat')
  // M83. A few memories, so the node's scene shows a list rather than its
  // empty arm — written through the store the app itself writes through.
  const shotMemory = createMemoryStore({ dir: join(mkdtempSync(join(tmpdir(), 'tc-shot-memory-')), 'memory') })
  const memAt = Date.now() - 7200000
  shotMemory.add({ root: REPO, kind: 'decided', text: 'sessions live in tmux so agents outlive the app', at: memAt })
  shotMemory.add({ root: REPO, kind: 'tried', text: 'a worker pool per repository — one agent per panel reads better', at: memAt + 60000 })
  shotMemory.add({ root: REPO, kind: 'failed', text: 'parsing the CLI\'s pretty output; the stream-json door is the contract', at: memAt + 120000 })

  /* M84. A watcher whose runs are real, so the scene shows a real tail: the
     same runner main uses, over an ordinary child process. */
  const shotWatch = createWatchRunner({
    spawn: (spec, handlers) => {
      const child = require('node:child_process').spawn(spec.command, [...spec.args], { cwd: spec.cwd, shell: false })
      child.stdout?.on('data', (c) => handlers.onData(c.toString('utf8')))
      child.stderr?.on('data', (c) => handlers.onData(c.toString('utf8')))
      child.on('error', (e) => handlers.onData(`${e.message}\n`))
      child.on('exit', (code, signal) => handlers.onExit(code, signal))
      return { kill: () => { try { child.kill('SIGTERM') } catch { /* gone */ } } }
    },
    now: () => Date.now(),
    ledger: { append: () => {} },
    onState: (id, state) => { if (!wc.isDestroyed()) wc.send(SHOT_EVENTS.WATCHER_STATE, { id, ...state }) }
  })
  const watcherHandlers = {
    create: (req) => { shotWatch.add({ id: req.id, cwd: req.cwd, command: req.command, args: req.args, trigger: req.trigger }); shotWatch.fire(req.id); return { ok: true } },
    run: (id) => shotWatch.fire(id),
    stop: (id) => shotWatch.stop(id),
    dispose: (id) => shotWatch.remove(id),
    list: () => shotWatch.ids().map((id) => ({ id, ...(shotWatch.stateOf(id) ?? { status: 'not-started', tail: '', pending: false }) }))
  }

  const agentHandlers = {
    create: (spec) => { const snapshot = agentSessions.create(spec); baselineCapture.capture(spec.id, spec.cwd); return { kind: 'created', snapshot } },
    send: (id, text) => agentSessions.send(id, text),
    interrupt: (id) => agentSessions.interrupt(id),
    dispose: ({ id, drop }) => { agentSessions.dispose(id); if (drop) agentTranscripts.drop(id) },
    answer: ({ id, requestId, answer }) => agentSessions.answerPermission(id, requestId, answer),
    list: () => agentSessions.list(),
    transcript: (id) => { const r = agentTranscripts.read(id); return { turns: r.turns, snapshot: agentSessions.get(id) ?? null, ...(r.meta === undefined ? {} : { meta: r.meta }) } },
    // M97/M98. The same verbs main wires; grants are a harness-local set.
    autoStart: (req) => agentSessions.startAuto(req.id, { mode: req.mode, task: req.task, limit: req.limit }),
    autoStop: (id) => agentSessions.stopAuto(id),
    grants: () => [],
    revokeGrants: () => {}
  }
  registerIpcHandlers(
    ptyManager, layoutStore,
    () => { const b = backend(); return { kind: b.kind, reason: b.reason } },
    {
      list: () => [{ id: 'shell', name: 'Login shell', available: true, builtIn: true, isDefault: true, subtitle: '~', cwd: '~' }, { id: 'claude', name: 'Claude', available: true, builtIn: true, isDefault: false, subtitle: '~', cwd: '~', agent: 'claude-code' }],
      rename: () => false, remove: () => false, setDefault: () => {},
      spawn: () => {}, savePanel: () => {}, requestReset: () => {}, listPrompts: () => [], savePrompt: () => {}, removePrompt: () => false,
      // M80. Templates: the built-ins plus the store's own.
      presetTemplate: (id) => { const found = allPresets(layoutStore.presets()).find((p) => p.id === id); return found === undefined ? null : templateOf(found) },
      // M88. GitHub through a recorded broker: the scene shows the list with
      // an issue and a review request.
      brokerAudit: (_limit, service) => ({ rows: [{ at: Date.now() - 60000, service: 'github', method: 'GET', path: '/issues?filter=assigned', status: 200, bytes: 2410, panelId: 'github' }, { at: Date.now() - 400000, service: 'github', method: 'POST', path: '/repos/acme/canvas/issues/12/comments', status: 201, bytes: 88, panelId: 'live' }, { at: Date.now() - 900000, service: 'github', method: 'DELETE', path: '/repos/acme/canvas', status: 0, bytes: 0, panelId: 'live', reason: 'a delete of a repository is not a path the broker performs' }].filter((r) => service === undefined || r.service === service), skipped: 0 }),
      githubList: (panelId) => listGithubWorkItems({ panelId, broker: { call: async (q) => ({ ok: true, status: 200, truncated: false, body: q.path.includes('/search/')
        ? JSON.stringify({ total_count: 1, items: [{ number: 77, title: 'Split the flush gate out of onExit', body: 'The timer is the second door. Please review before the release branch cuts.', state: 'open', html_url: 'https://github.com/acme/canvas/pull/77', repository_url: 'https://api.github.com/repos/acme/canvas', pull_request: { url: 'x' }, user: { login: 'worker-a' } }] })
        : JSON.stringify([
          { number: 12, title: 'Watchdog fires under load', body: 'The 300s watchdog trips when the suite runs beside a build. Split the suite or raise it once more.', state: 'open', html_url: 'https://github.com/acme/canvas/issues/12', repository: { full_name: 'acme/canvas' }, assignee: { login: 'octocat' } },
          { number: 31, title: 'Group buttons are mouse-only', body: 'Card and remove on a group frame cannot be reached from the keyboard.', state: 'open', html_url: 'https://github.com/acme/canvas/issues/31', repository: { full_name: 'acme/canvas' }, assignee: { login: 'octocat' } }
        ]) }) } }),
      vaultRead: (root) => readVault(root),
      memoryList: (root, limit) => shotMemory.list(root, limit),
      memoryAdd: (req) => { const r = shotMemory.add(req); return r.ok ? { ok: true } : { ok: false, reason: r.reason } },
      listTemplates: () => allTemplates(layoutStore.templates()),
      // M100/M101. The roster and routines over the harness's own store; the
      // folder dialog and the runner are main's and stay out of a harness.
      listTeammates: () => layoutStore.teammates(),
      saveTeammate: (t) => { layoutStore.saveTeammate(t); return t },
      removeTeammate: (id) => layoutStore.deleteTeammate(id),
      choosePlace: async () => null,
      listRoutines: () => layoutStore.routines(),
      saveRoutine: (r) => { layoutStore.saveRoutine(r); return { kind: 'saved', routine: r } },
      removeRoutine: (id) => layoutStore.deleteRoutine(id),
      runRoutine: () => false,
      saveTemplate: (t) => { const saved = { ...t, id: t.id || `tpl-${Date.now().toString(36)}` }; layoutStore.saveTemplate(saved); return saved },
      removeTemplate: (id) => (isBuiltInTemplate(id) ? false : layoutStore.deleteTemplate(id)),
      spawnWith: () => ({ kind: 'refused', reason: 'shot harness' }), recentDirectories: () => layoutStore.recentDirectories()
    },
    () => {},
    reviewEngine,
    async () => ({ kind: 'refused', reason: 'the screenshot harness does not commit' }),
    credentialStore, new FileWatchers(), () => win,
    new ToolboxCache(),
    join(mkdtempSync(join(tmpdir(), 'tc-shot-diagnostics-')), 'diagnostics'),
    { list: () => [], remove: async () => ({ kind: 'refused', reason: 'no worktrees here' }), reveal: () => true },
    {
      tail: (panelId, lines) => scrollbackLog.tail(panelId, lines),
      clear: () => scrollbackLog.clearAll(),
      search: (panelIds, query) => scrollbackLog.search(panelIds, query, { maxHits: 50, maxPerPanel: 5 })
    },
    () => ({
      probedAt: Date.now(), shell: { path: '/bin/zsh', ok: true }, pathEntries: ['/usr/bin', '/bin'],
      clis: [{ name: 'claude', path: '/usr/local/bin/claude' }, { name: 'codex', path: null }, { name: 'git', path: gitPath }],
      tmux: { kind: 'direct', reason: 'shot: direct', path: null }, layout: { path: layoutPath, backupWritten: false }, envKeys: ['HOME', 'PATH']
    }),
    { open: () => ({ kind: 'opened' }) },
    () => [],
    undefined,
    undefined,
    agentHandlers,
    watcherHandlers,
    // M103. The real read over the real guest.
    createBrowserHandlers({ guestOf: (id) => webContents.fromId(id) ?? null })
  )
  wc.on('did-finish-load', () => { ptyManager.resendStates() })
  wc.on('console-message', (_e, level, message) => { if (level >= 2) console.log('[renderer]', String(message).slice(0, 200)) })

  // ---------------------------------------------------------------------
  // The kit every scene drives the renderer through.
  // ---------------------------------------------------------------------
  const js = (code) => wc.executeJavaScript(code)
  const kit = {
    js,
    shot: async (name) => {
      await sleep(250)
      const img = await wc.capturePage()
      const path = join(OUT, `${name}.png`)
      writeFileSync(path, img.toPNG())
      console.log(`wrote ${path}`)
    },
    press: (key, mods = {}) => js(`window.dispatchEvent(new KeyboardEvent('keydown', ${JSON.stringify({ key, bubbles: true, cancelable: true, ...mods })})), true`),
    // React's controlled input ignores a plain value assignment: the native
    // setter plus a dispatched 'input' is what reaches its state.
    type: (text) => js(`(() => { const i = document.querySelector('.palette__input'); if (!i) return false
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, ${JSON.stringify(text)}); i.dispatchEvent(new Event('input', { bubbles: true })); return true })()`),
    // Enter on the palette's INPUT: a window-level keydown never reaches the
    // palette's handler (the panels suite learned this first).
    enter: () => js(`(() => { const i = document.querySelector('.palette__input'); if (!i) return false; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return true })()`),
    click: (sel) => js(`(() => { const b = document.querySelector(${JSON.stringify(sel)}); if (!b) return false; b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); return true })()`),
    theme: async (name) => { await js(`window.canvas.settings.set('appearance.theme', ${JSON.stringify(name)})`); await sleep(700) },
    // The first real layout: the launcher scene runs on an EMPTY store, so
    // the fixture layout is written to disk first and loaded here, once.
    loadMain: async () => {
      writeFixtureLayout()
      layoutStore.load()
      const first = new Promise((resolve) => wc.once('did-finish-load', resolve))
      wc.reload(); await first
      await sleep(1200)
      // Wake the live panel and the twin by clicking their cards at the
      // centre: a mousedown with no coordinates hit-tests world (0,0) and
      // misses (verify:panels' own lesson).
      for (const id of ['live', 'twin']) {
        await js(`(() => { const card = document.querySelector('.panel[data-panel-id="${id}"] .panel__card'); if (!card) return false
          const r = card.getBoundingClientRect(); card.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })); return true })()`)
        await sleep(400)
      }
      await sleep(2500)
      await js(`window.__m56ReducedMotion(true)`)
    },
    // The user's own route to a place: the palette's Go-to and bookmark
    // rows. Reduced motion is forced on (the harness override verify:panels
    // uses), so a flight is one frame and the capture is not mid-tween.
    goTo: async (text) => {
      await kit.press('k', { metaKey: true }); await sleep(400)
      await kit.type(text); await sleep(300)
      await js(`(() => { const i = document.querySelector('.palette__input'); if (i) i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return true })()`)
      await sleep(700)
    },
    // Escape is two-stage inside a scope (pop, then close): press until gone.
    closePalette: async () => {
      for (let i = 0; i < 3; i++) {
        const open = await js(`document.querySelector('.palette') !== null`)
        if (!open) break
        await js(`(() => { const i = document.querySelector('.palette__input'); if (i) i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return true })()`)
        await sleep(250)
      }
    },
    // Wake a dormant panel by clicking its card at the centre (a mousedown
    // with no coordinates hit-tests world (0,0) and misses).
    wake: async (id) => {
      await js(`(() => { const card = document.querySelector('.panel[data-panel-id="${id}"] .panel__card'); if (!card) return false
        const r = card.getBoundingClientRect(); card.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })); return true })()`)
      await sleep(2000)
    },
    // Focus a live panel by clicking into its terminal.
    focus: async (id) => {
      await js(`(() => { const s = document.querySelector('.panel[data-panel-id="${id}"] .panel__slot'); if (!s) return false
        const r = s.getBoundingClientRect(); s.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })); return true })()`)
      await sleep(300)
    },
    zoom: async (target) => {
      // A pinch is a wheel with ctrlKey (canvas-input.ts); step until the
      // scale lands within a few percent of the target.
      for (let i = 0; i < 80; i++) {
        const scale = await js(`window.__m4aScale()`)
        if (Math.abs(scale - target) / target < 0.04) break
        const deltaY = scale > target ? 60 : -60
        await js(`(() => { const host = document.querySelector('.canvas'); const r = host.getBoundingClientRect()
          host.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, ctrlKey: true, deltaY: ${deltaY}, deltaMode: 0, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })); return true })()`)
        await sleep(40)
      }
      await sleep(600)
    },
    selectRail: async (id) => { await kit.click(`.rail-row[data-rail-row="${id}"] .rail-row__main`); await sleep(300) },
    context: async (open) => {
      const isOpen = await js(`(document.querySelector('.shell__inspector')?.getBoundingClientRect().width ?? 0) > 0`)
      if (isOpen !== open) { await kit.click('.shell__inspector-toggle'); await sleep(400) }
    },
    tab: async (id) => { await kit.click(`[data-context-tab="${id}"]`); await sleep(400) },
    dock: async (id) => {
      const on = await js(`document.querySelector('[data-dock="${id}"]')?.getAttribute('aria-pressed') === 'true'`)
      if (!on) { await kit.click(`[data-dock="${id}"]`); await sleep(400) }
    },
    // One bell from the dormant panel's twin: the agent-state detector
    // counts it and the dock badge follows.
    ring: async () => { ptyManager.write('twin', String.fromCharCode(13)); await sleep(1500) },
    resize: async (w, h) => { win.setSize(w, h); await sleep(900) }
  }

  await win.loadFile(join(__dirname, '..', 'out', 'renderer', 'index.html')).catch(() => {})
  await sleep(1500)

  const manifest = []
  for (const scene of SCENES) {
    if (scene.size) await kit.resize(scene.size[0], scene.size[1])
    try {
      await scene.run(kit)
      manifest.push({ file: `${scene.name}.png`, intent: scene.intent })
    } catch (error) {
      console.log(`scene ${scene.name} failed: ${error && error.message || error}`)
      manifest.push({ file: `${scene.name}.png`, intent: scene.intent, failed: String(error && error.message || error) })
    }
  }
  writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2))
  console.log(`wrote ${join(OUT, 'manifest.json')} (${manifest.length} scenes)`)

  ptyManager.killAll()
  for (const p of [FIX, scrollbackDir]) { try { if (existsSync(p)) rmSync(p, { recursive: true, force: true }) } catch { /* best effort */ } }
  app.quit()
})
