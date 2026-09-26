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
   is one sentence saying what the picture is supposed to show. A scene that
   restyles towards an art-direction image names it in `reference` (repo
   paths, tracked — verify:meta critic.reference.1), and the run then also
   writes <scene>.vs-reference.png, the reference beside the capture, which
   is what a fresh-context critic is handed (docs/product-rules.md, "The
   critic and the reference").

   Fenced like every Electron harness here: a throwaway userData, its own
   layout file, its own scrollback and projects directories, the direct
   backend (reattach is not a visual property), and never the production
   tmux sockets. It spawns real shells. */
const { join } = require('node:path')
const { loadRenderer } = require('./load-renderer.cjs')
const { composeManifest } = require('./shot-composite.cjs')
const { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, realpathSync, statSync, openSync, readSync, closeSync } = require('node:fs')
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

// M127. The toolbox's home fence, set BEFORE the entry bundle is required —
// `panels-entry.cjs` only mints one if this is unset, and `resolveToolboxHome`
// falls back to the real `homedir()` in production. Unfenced, the `skills`
// scene would paint the RUNNING DEVELOPER'S own ~/.claude: a different set of
// columns on every machine, and somebody's private skill names in a PNG that
// gets handed to a critic. Ours rather than the entry's throwaway because the
// scene plants user skills and a plugin under it. A spaced path, this repo's rule.
const SHOT_HOME = mkdtempSync(join(tmpdir(), 'tc shot home '))
process.env.TC_TOOLBOX_HOME = SHOT_HOME

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
  createReviewEngine, createGitRunner, createBaselineCapture, allTemplates, isBuiltInTemplate, allPresets, templateOf, createMemoryStore, createWatchRunner, readVault, readImage, prepareStarter, listGithubWorkItems, createBrowserHandlers, trailFor, parseShelf, skillKey, createRunLedger, INERT_PRESENCE,
  createRepoSetupStore, INERT_KIT, colorOf
} = require(ENTRY_OUT)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// M363. A fixture time the page prints as a CLOCK ("missed at 06:16 AM") is
// pinned to that clock, never `Date.now() - n`: the routine scene's golden read
// the hour it was painted and failed whenever it was run at another one. The
// most recent such moment, so it is always in the past, as a run must be.
function clockAt(h, m) {
  const d = new Date(); d.setHours(h, m, 0, 0)
  if (d.getTime() > Date.now()) d.setDate(d.getDate() - 1)
  return d.getTime()
}

// M353. Orchestrate's workbench reads its Changes pane from git in the
// background and says "Reading changes…" until it has. A shot taken inside
// that window pins a loading caption: under load, M349's UPDATE_GOLDENS wrote
// two orchestration goldens that way. So every orchestration shot waits it
// out, and a caption that never resolves is a thrown scene, not a golden.
async function changesRead(k, scene) {
  const loading = `[...document.querySelectorAll('.orch__caption[role="status"]')].some((p) => p.textContent.trim() === 'Reading changes…')`
  for (let i = 0; i < 50 && (await k.js(loading)); i++) await sleep(100)
  if (await k.js(loading)) throw new Error(`${scene}: the Changes pane still says "Reading changes…" after 5s, so the shot would pin a loading caption`)
}

// Never touch the real store: this harness spawns real shells.
app.setPath('userData', mkdtempSync(join(tmpdir(), 'tc-shot-')))
app.on('window-all-closed', () => {})

// ---------------------------------------------------------------------------
// Fixtures: a git repository with one modified file (a real review node), a
// project directory with a toolbox, a note, a scrollback log for a panel that
// is never started (the dormant card's tail, and something for search to hit).
// ---------------------------------------------------------------------------
// M162. A FIXED name, not mkdtemp: the review, file and toolbox bodies print
// this path in full at 4.0, and a six-character suffix minted per run moved a
// word in three scenes past the tile budget on some runs and not others — a
// golden that flaps for a reason the app does not own. (M164's path rule stops
// printing the path; the fixed name stays so the goldens are one machine's
// captures of one path.) Wiped first: a previous run's files would otherwise
// leak into this one's fixture.
const FIX = (() => { const p = join(tmpdir(), 'tc shot fixtures golden'); rmSync(p, { recursive: true, force: true }); mkdirSync(p, { recursive: true }); return realpathSync(p) })()
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
// M130. Three project skills, so the trail's cards resolve BY NAME against a
// real inventory: two the agent used and one it did not. The fourth name in
// the transcript below is installed nowhere, which is the `not installed
// here` card — the useful answer after a session used a plugin skill this
// project cannot see.
for (const [name, description] of [
  ['brainstorming', 'Explore intent and requirements before any implementation.'],
  ['test-driven-development', 'Write the failing check first and watch it fail.'],
  ['writing-plans', 'Turn a spec into an ordered implementation plan.']
]) {
  mkdirSync(join(REPO, '.claude', 'skills', name), { recursive: true })
  writeFileSync(join(REPO, '.claude', 'skills', name, 'SKILL.md'), `---\nname: ${name}\ndescription: ${description}\n---\n\nBody.\n`)
}
// M127. The `skills` scene's second source: one enabled PLUGIN, whose skills
// are named `<plugin>:<skill>` the way the CLI names them — which is the only
// thing that makes `placement` derive a `plugin:` column, since the derivation
// reads the NAME, never the `pluginId` stamp. A pane showing only project
// skills would prove nothing about the column order the scene is there to
// judge. Deliberately the ONLY extra source: the navigator is a fixed 300px
// and a column is 14rem, so a fourth column would push `Ungrouped` out of
// every frame that also holds a placed column, and the ordering rule would
// become unphotographable.
const PLUGIN_ID = 'documents'
const PLUGIN_ROOT = join(SHOT_HOME, 'plugins', PLUGIN_ID)
for (const [name, description] of [
  ['documents:docx', 'Create, read and edit Word documents.'],
  ['documents:pdf', 'Read, merge, split and fill PDF files.']
]) {
  mkdirSync(join(PLUGIN_ROOT, 'skills', name), { recursive: true })
  writeFileSync(join(PLUGIN_ROOT, 'skills', name, 'SKILL.md'), `---\nname: ${name}\ndescription: ${description}\n---\n\nBody.\n`)
}
// The CLI's own transcript, in the shape skill-trail-read.ts tails: the
// harness points `skill:trail` at this file, so the scene's lane comes
// through the REAL byte-offset read rather than a hand-built Trail.
const TRAIL_LOG = join(FIX, 'trail.jsonl')
writeFileSync(TRAIL_LOG, [
  ['2026-09-06T09:58:00.000Z', 'brainstorming'],
  ['2026-09-06T10:02:00.000Z', 'writing-plans'],
  ['2026-09-06T10:19:00.000Z', 'test-driven-development'],
  ['2026-09-06T10:41:00.000Z', 'superpowers:verification-before-completion']
].map(([timestamp, skill]) => JSON.stringify({ type: 'assistant', timestamp, message: { content: [{ type: 'tool_use', id: `tu-${skill}`, name: 'Skill', input: { skill } }] } })).join('\n') + '\n')
// M85. The notes folder IS the vault: the plan links to two other notes, one
// of which does not exist yet, and one note links back.
writeFileSync(NOTE, '# Plan\n\nSplit the flush gate out of onExit; the timer is the second door — see [[flush gate]] and [[decisions/tmux]].\n\nOpen question: [[what the watchdog should do]].\n\n- [ ] write the check first\n- [ ] watch it fail\n')
mkdirSync(join(FIX, 'notes', 'decisions'), { recursive: true })
writeFileSync(join(FIX, 'notes', 'flush gate.md'), '# Flush gate\n\nThe gate that keeps a kill from racing the last flush. Referenced from [[plan]].\n\n#decision #tmux\n')
writeFileSync(join(FIX, 'notes', 'decisions', 'tmux.md'), '# tmux\n\nSessions live in tmux so agents outlive the app. See [[plan]] for the timer.\n\n#decision\n')

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

// M130 critic wave. The trail's host gets a RESTORED tail of its own, the
// same shape `dormant.log` has: a dormant panel with a trail but an empty
// well made the scene read as a panel that had done nothing, beside four
// cards claiming it had. The lines are the session those four skills were
// used in.
writeFileSync(join(scrollbackDir, 'trail.log'), [
  '$ claude',
  '> Plan the milestone from the spec.',
  'Using skill brainstorming',
  'Using skill writing-plans',
  'Using skill test-driven-development',
  'Wrote docs/plans/m134.md — four tasks, checks first.',
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
// M225. A PREFERRED port, not an ephemeral one. `listen(0)` stamped a fresh
// random port into every golden that paints the rail's `browser · 127.0.0.1:…`
// row, so every capture differed there and every re-baseline froze a new
// meaningless number — noise inside the one artefact the visual gate compares
// against. The M225 golden walk's critic found it; the gate itself never
// could, because ~171 differing pixels sit under BOTH budgets, which is
// exactly the blind spot verify-visual.cjs's own header declares.
//
// It falls back to an ephemeral port rather than failing: a machine where
// 31789 is taken must still be able to paint the scenes, and a four- or
// five-digit port there is still under both budgets. Deterministic where it
// can be, degrading where it cannot — never the other way round.
const SHOT_HTTP_PORT = 31789
const shotHttpReady = new Promise((resolve) => {
  SHOT_HTTP.once('error', () => { SHOT_HTTP.listen(0, '127.0.0.1', resolve) })
  SHOT_HTTP.listen(SHOT_HTTP_PORT, '127.0.0.1', resolve)
})
const shotHttpUrl = () => `http://127.0.0.1:${SHOT_HTTP.address().port}/`

const term = (id, x, y, w, h, z, extra = {}) => ({ id, x, y, w, h, z, cwd: REPO, command: '/bin/sh', args: ['-c', 'echo "$ claude"; echo "Reading src/server.ts"; echo "Editing src/server.ts"; sleep 600'], ...extra })

// ---------------------------------------------------------------------------
// The scenes. Each `run` is handed the window and a small kit and ends with
// a capture; `intent` is written for a critic who cannot read this file.
// ---------------------------------------------------------------------------
const SCENES = [
  { name: 'launcher', intent: 'The empty canvas a fresh install sees: the launcher of real verbs, nothing else on the canvas.',
    run: async (k) => { await k.theme('light'); await k.shot('launcher') } },
  { name: 'kinds', intent: 'One of every panel kind side by side on the light theme at 100 %: a live claude terminal, a dormant tests card, a review, a source file, a note, a toolbox, a work card and a chat — every header at rest a glyph, a title and one state; the bodies in the UI face with code and paths in mono.',
    // The subagent scan lands a beat after the layout: wait for the notice
    // (up to 3s) so the scene does not depend on a race. M67's first shots
    // showed the notice in one scene and not the next for exactly this reason.
    run: async (k) => { await k.loadMain(); for (let i = 0; i < 30 && !(await k.js(`!!document.querySelector('[data-subagent-ambiguous]')`)); i++) await sleep(100); await k.shot('kinds') } },
  { name: 'kinds-dark', intent: 'The same panel kinds on the dark theme; the terminal well and every surface should follow the theme with the same hierarchy.',
    run: async (k) => { await k.theme('dark'); await k.shot('kinds-dark'); await k.theme('light') } },
  { name: 'trail', intent: 'The live skill trail: a lane of cards to the right of a selected agent panel, each card the skill\'s name and its phase as a sentence, the host\'s `hide 4 skills` capsule in its chrome; the dashed tether on the host\'s edge.',
    run: async (kit) => { await kit.goTo('claude — plan the milestone'); await sleep(1200); await kit.shot('trail') } },
  { name: 'skills', intent: 'M127. The Skills pane: the navigator over the Skills section with a column per shelf placement, each card the skill\'s name, a note and its facts, the column\'s count beside its `⋯`; the search field above; a card that wraps its name.',
    run: async (k) => {
      await k.selectRail('live'); await k.dock('skills'); await sleep(1200)
      // The rack scrolls horizontally and the navigator is a fixed 300px, so
      // one 14rem column and a sliver is all a frame holds. This scene is
      // therefore the one place the harness moves a scroller directly: a
      // SYNTHESISED wheel is untrusted and Chromium does not scroll on it, so
      // the gesture the rest of this file insists on is not available here.
      // 0, and the number came DOWN in the critic wave: at 210 the
      // PLACED column — the whole point of the rack's order — was scrolled
      // off the left edge, so the picture showed two derived columns and
      // proved nothing about arrangement. At 40 the placed column
      // `starting a milestone · placed by you` is whole at the left, the
      // derived `documents · derived` shows its edge beside it, and the
      // scrollbar under the rack is what says the rack scrolls. The offset
      // is logged so a critic knows the picture is the pane at rest.
      const at = await k.js(`(() => { const r = document.querySelector('.skills-pane__columns'); if (!r) return -1
        r.scrollLeft = 0; return Math.round(r.scrollLeft) + ' of ' + Math.round(r.scrollWidth - r.clientWidth) })()`)
      console.log(`[shot] skills rack scrolled to ${at}`)
      await sleep(400)
      await k.shot('skills'); await k.dock('panels')
    } },
  { name: 'chat', intent: 'A chat panel beside the live terminal: a restored transcript with the user\'s turn as a soft bubble on the right, the assistant\'s answer as unboxed prose in the UI face at the measure, a collapsed tool row, the state pill reading asleep, a labelled `to terminal` verb after the pill, the composer pinned below with Send and Interrupt labelled (M167).',
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
  { name: 'across', intent: 'A review of every worktree of one repository, in one panel: the main tree first, then a section per worktree lane with its branch, each file a card with its counts as pills; Commit and discard are the frame\'s verbs and refuse by name across lanes.',
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
  { name: 'browser', intent: 'The browser pane beside the terminal that started its dev server: a live page painted INSIDE the panel frame, panned and clipped with the world like every other node. The chrome reads the page\'s real address (`http://127.0.0.1:…`, from the guest itself — never the page\'s title) beside one labelled verb, `Open in browser`; below it the app\'s own bar — `Back`, `Forward`, `Reload` as words, disabled with their reasons, and the address input — and then the page. A ruled edge from the dev server says `on exit 0`: the page reloads when the server comes back. Beside the width chips and Capture, the pane says which work it is a preview OF — `source · repo`, with `Change source` next to it (M195): a file change under that folder reloads THIS pane and no other project\'s. The kind word `browser` sits in the rail and on the frame; no state is invented for a document.',
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
  { name: 'board', intent: 'M116. The Board pane: four columns (todo · working · review · done), each with its count, a card under todo with its key and Show on canvas, the dispatched card under working with its teammate and lane, the two empty columns saying what sets them; the drop edge appears on a drag.',
    run: async (k) => {
      // Frame the card first (the harness's own goTo, like every scene), THEN
      // open the pane: the pane's rows are the pane's; the canvas half must
      // show the card beside its lane, not what the last scene left in view.
      await k.goTo('Watchdog fires under load'); await sleep(400)
      await k.dock('board'); await sleep(500)
      await k.shot('board')
      await k.dock('panels'); await sleep(300)
    } },
  { name: 'chat-copilot', intent: 'M118/M120. The spawn sheet on the copilot row under the harness\'s stripped PATH: `what` reads `chat with copilot — not on PATH` (the disabled arm, by name, like the codex scene), the how row says `no mode flag` and `no effort flag` because copilot has neither, the model field is a SELECT whose empty choice is `auto (the CLI\'s default)` over the row\'s closed list, and the preview names the engine with its capability sentence (runs every tool on its own policy · no interrupt · no images · a read-only mode). A third engine is a row, not a new surface.',
    run: async (kit) => {
      await kit.press('k', { metaKey: true }); await sleep(400)
      await kit.type('new panel'); await sleep(300)
      await kit.js(`(() => { const i = document.querySelector('.palette__input'); if (i) i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return !!i })()`)
      await sleep(800)
      await kit.js(`(() => { const s = document.querySelector('[data-sheet-what]'); if (!s) return false; const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, '__copilot__'); s.dispatchEvent(new Event('change', { bubbles: true })); return true })()`)
      await sleep(500)
      await kit.shot('chat-copilot')
      await kit.js(`(() => { const s = document.querySelector('[data-spawn-sheet]'); if (s) s.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); return !!s })()`)
      await sleep(300)
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
  { name: 'runs', intent: 'A run that already happened: the Workspaces pane lists it under RUNS with its panel count, duration and state and a Run again verb; the selected run\'s panels are in frame beneath.',
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
  { name: 'graph', intent: 'The task graph: two ruled edges into the second panel drawn as lines with their rule words, the target\'s inspector open on the edge\'s fields; the chat behind carries the join\'s first arrival.',
    run: async (kit) => {
      await kit.goTo('claude — api (2)')
      await kit.js(`window.canvas.settings.set('shell.inspectorOpen', true)`)
      await sleep(300)
      await kit.js(`(() => { const hit = document.querySelector('[data-link-hit="chat:twin"]'); if (hit) hit.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return !!hit })()`)
      await sleep(700)
      await kit.shot('graph')
    } },
  { name: 'edge-firing', intent: 'M233. An edge in flight: the worker\'s ruled edge into `claude — api (2)` FIRING — the line and its arrowhead lifted to the accent, with a bright packet part-way along it placed by the same analytic Bézier the label uses. An edge animates ONLY when something crosses it; at rest it is the quiet grey line every other edge on this canvas is showing. (Two disclosures. The harness freezes the clock at a chosen instant so the packet lands in the same place every capture — that is the one thing faked, and the real reducer computes the real t. And the join\'s SECOND edge, from the chat, is not in this frame: the fixture stacks three panels over its short path, and moving them to expose it would move five other goldens. The lit/quiet contrast is therefore carried by this scene against `graph`, and the regression guarantee is `edge.paint.1`, not this image.)',
    run: async (kit) => {
      // Pulled back so BOTH ends of the firing edge are in frame. At 100% the
      // camera centres the target and the source sits off the left edge, so
      // Framed from `worker a` at half size, with the inspector closed so the
      // canvas keeps its 360px. Two earlier framings failed: centring on the
      // target at 100% put the source off the left edge (an arrowhead and no
      // journey), and a `the join` BOOKMARK added to the fixture silently
      // rewrote palette, search and every other scene that lists bookmarks —
      // a scene must not change the fixture other scenes are shot against.
      await kit.js(`window.canvas.settings.set('shell.inspectorOpen', false)`)
      await kit.goTo('worker a')
      await kit.zoom(0.5)
      await sleep(400)
      // Fire, then freeze 80% of the way across (720 of EDGE_FIRE_MS's 900).
      // Order matters: the freeze must land after the fire's timestamp or the
      // packet sits at t = 0. And 80%, not the more natural 40%: this edge
      // runs up from the worker at the bottom-left, and at 40% the packet's
      // painted rect was at client x = 268 — behind the navigator rail, off
      // the canvas entirely. The dot was correct and invisible, which a
      // DOM check would have called a pass.
      // groupA -> twin, not chat -> twin. Links paint BENEATH the panels (M13:
      // a line over a terminal hides the agent output the app exists to show),
      // and the chat edge's whole path runs under three of them — the first
      // capture had a packet in the DOM and nothing visible in the image. The
      // worker's edge crosses bare ground, so the journey can be seen.
      await kit.js(`(() => { const now = Date.now(); window.__m233Flow('fired', 'groupA', 'twin'); window.__m233Freeze(now + 720); return true })()`)
      await sleep(500)
      // The packet's PAINTED RECT, not just its presence. Twice in this
      // milestone a packet was in the DOM, correctly positioned by the real
      // arithmetic, and nowhere in the image — once behind three panels and
      // once behind the navigator rail. A query check would have passed both
      // times, which is M149's lesson arriving from a new direction.
      console.log('[shot] edge-firing:', await kit.js(`JSON.stringify({ packets: [...document.querySelectorAll('.link-layer__packet')].map((c) => { const r = c.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), fill: getComputedStyle(c).fill } }), lines: [...document.querySelectorAll('.link-layer__line')].map((l) => [l.getAttribute('data-link'), l.getAttribute('data-edge-activity')]).filter((e) => e[1]) })`))
      await kit.shot('edge-firing')
      await kit.js(`window.__m233Flow('thaw', '', '')`)
      await kit.zoom(1)
      await kit.js(`window.canvas.settings.set('shell.inspectorOpen', true)`)
      await sleep(200)
    } },
  { name: 'edge-waiting', intent: 'M233. A join that is waiting: the worker\'s edge has DELIVERED into `claude — api (2)` and rests at the accent with no packet — the travel is over, the join is not. Captured after the breath has finished: the waiting edge breathes three times and then rests, because nothing on this canvas animates forever (M111\'s rule, applied to an edge), and the resting value is what a person who waits a minute actually sees — and what a reduced-motion user sees from the start. It differs from `edge-firing` by the absence of the packet, which is deliberate and is the point: the two states differ by whether something is CROSSING, not by how the edge is coloured.',
    run: async (kit) => {
      await kit.js(`window.canvas.settings.set('shell.inspectorOpen', false)`)
      await kit.goTo('worker a')
      await kit.zoom(0.5)
      await sleep(400)
      await kit.js(`(() => { window.__m233Flow('arrived', 'groupA', 'twin'); window.__m233Flow('waiting', '', 'twin', ['chat']); return true })()`)
      // Past the arrival flash (EDGE_ARRIVE_MS) and past three breaths of
      // --dur-breath, so the capture is of the RESTING waiting state and does
      // not depend on when the shutter happened to fall.
      await sleep(4200)
      await kit.shot('edge-waiting')
      await kit.js(`(() => { window.__m233Flow('waiting', '', 'twin', []); return true })()`)
      await kit.zoom(1)
      await kit.js(`window.canvas.settings.set('shell.inspectorOpen', true)`)
      await sleep(200)
    } },
  // The composer scene runs BEFORE tool-objects on purpose: tool-objects opens
  // the chat's review node OVER the chat, and a drop at the chat's centre then
  // hits the node (the hit test is topmost-first) and mints a file panel.
  { name: 'composer', intent: 'The chat panel\'s composer at work: a dropped image as a dim mono line above the textarea (its name and a labelled `remove`), and the `@` file list open under a half-typed reference — rows in mono, directories first, the same hairline family as the frame; nothing floats over the canvas.',
    run: async (kit) => {
      // By the rail row, not a palette search: `api (chat)` also matches the
      // review node `review: claude — api (chat)` a later scene minted, and
      // the drop then landed on the canvas and opened a file panel instead.
      await kit.goTo('claude — api (chat)'); await sleep(300)
      // Raise the chat first: the tool-objects scene opened its review node
      // OVER it, and a drop at the chat's centre hit the node on top (the
      // hit test is topmost-first), which opened a file panel instead.
      await kit.js(`(() => { const c = document.querySelector('.panel[data-panel-id="chat"] .pf__chrome'); if (!c) return false; const r = c.getBoundingClientRect(); const at = { bubbles: true, cancelable: true, button: 0, clientX: r.left + 40, clientY: r.top + r.height / 2 }; c.dispatchEvent(new MouseEvent('mousedown', at)); document.dispatchEvent(new MouseEvent('mouseup', at)); return true })()`)
      await sleep(300)
      console.log('[shot] composer chat on top:', await kit.js(`(() => { const p = document.querySelector('.panel[data-panel-id="chat"]'); if (!p) return 'no chat'; const r = p.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); const tp = top && top.closest('.panel'); return tp ? tp.getAttribute('data-panel-id') : String(top && top.className) })()`))
      console.log('[shot] composer drop:', await kit.js(`(() => { const p = document.querySelector('.panel[data-panel-id="chat"]'); const host = document.querySelector('.canvas').getBoundingClientRect(); const r = p.getBoundingClientRect(); const at = { x: r.left + r.width / 2, y: r.top + r.height / 2 }; const under = document.elementFromPoint(at.x, at.y); const up = under && under.closest('.panel'); /* CLIENT coordinates: __m59Drop subtracts the host's origin itself (the M59 hook's own comment); this scene had handed it host-relative ones, and the double subtraction put the drop outside the chat — a file panel every time. */ const out = window.__m59Drop(${JSON.stringify(join(FIX, 'shot.png'))}, at.x, at.y); return JSON.stringify({ out, rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], host: [Math.round(host.left), Math.round(host.top)], under: up ? up.getAttribute('data-panel-id') : (under ? under.className : null), palette: document.querySelector('.palette') !== null }) })()`))
      await sleep(300)
      await kit.js(`(() => { const ta = document.querySelector('.panel[data-panel-id="chat"] [data-chat-input]'); if (!ta) return false
        const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(ta, 'wire /health like @s'); ta.setSelectionRange(20, 20); ta.dispatchEvent(new Event('input', { bubbles: true })); ta.focus(); return true })()`)
      await sleep(700)
      await kit.shot('composer')
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
  { name: 'approval', intent: 'An agent asking permission, seen from afar: the attention badge on the dock\'s bell and the popover naming the chat with a jump verb; the review node in front, its file cards and pills at rest; the chat\'s own card is behind it.',
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
  { name: 'lineup', intent: 'M104. The spawn sheet opened on `lineup: Workbench` with worktrees asked (the `lanes` checkbox): under the ordinary preview line, the LINEUP PREVIEW — `3 sessions will open · 1 agent`, then every seat with its role, kind and place (`worker · agent`, `dev server · shell`, `preview · browser · http://localhost:3000/`) — shown BEFORE Enter mints anything; with worktrees asked, only the agent seat says `in a worktree` and the others `in the checkout`. A ceiling line appears only when agents would queue.',
    run: async (k) => { await k.click('.shell__spawn'); await sleep(700); await k.click('[data-sheet-switch-to="panel"]'); await sleep(500); await k.js(`(() => { const s = document.querySelector('[data-sheet-what]'); if (!s) return false; s.value = '__lineup__:workbench'; s.dispatchEvent(new Event('change', { bubbles: true })); return true })()`); await sleep(400); await k.click('[data-sheet-worktree]'); await sleep(300); await k.shot('lineup'); await k.closePalette() } },
  { name: 'header', intent: 'M106. Header discipline on a 320px frame with a long title (`review: the health check wiring for the api repository`): the title is ellipsised whole-words-first while the kind mark, the state pill and every chrome control (`fill`, `⋯`, `×`) stay whole inside the frame; the full title lives in the title attribute and at the top of the ⋯ menu, which is open.',
    run: async (k) => { await k.goTo('health check wiring'); await sleep(500); await k.js(`(() => { const c = document.querySelector('.panel[data-panel-id="narrow"] .pf__chrome'); if (!c) return false; const r = c.getBoundingClientRect(); const at = { bubbles: true, button: 0, clientX: r.left + 40, clientY: r.top + r.height / 2 }; c.dispatchEvent(new MouseEvent('mousedown', at)); document.dispatchEvent(new MouseEvent('mouseup', at)); return true })()`); await sleep(300); console.log('[shot] header landed:', await k.js(`(() => { const p = document.querySelector('.panel[data-panel-id="narrow"]'); if (!p) return 'no narrow panel'; const r = p.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + 12); const tp = top && top.closest('.panel'); return JSON.stringify({ x: r.left, y: r.top, w: r.width, z: getComputedStyle(p).zIndex, over: tp ? tp.getAttribute('data-panel-id') : (top ? top.className : null), palette: document.querySelector('.palette') !== null }) })()`)); await k.click('.panel[data-panel-id="narrow"] [data-panel-more]'); await sleep(300); console.log('[shot] header menu open:', await k.js(`document.querySelector('.panel[data-panel-id="narrow"] [data-panel-menu]') !== null`)); await k.shot('header'); await k.click('.panel[data-panel-id="narrow"] [data-panel-menu-close]'); await sleep(200) } },
  { name: 'flip', intent: 'M106. Flip Terminals: every terminal turned over to its far-view summary — the work title large with the state word beneath — while chats, files and the review node stay as they were; M57\'s far view invoked deliberately by the Workspace menu (or the palette row), not by camera distance. A second flip turns them back.',
    run: async (k) => { await k.flip(); await sleep(400); await k.shot('flip'); await k.flip() } },
  { name: 'spawn-sheet', intent: 'The spawn sheet (New panel…): what, where with its suggestions, title, and for an agent preset its mode, effort and model; a preview line and the keys in the foot.',
    run: async (k) => { await k.click('.shell__spawn'); await sleep(700); await k.click('[data-sheet-switch-to="panel"]'); await sleep(500); await k.js(`(() => { const s = document.querySelector('[data-sheet-what]'); if (!s) return false; s.value = 'claude'; s.dispatchEvent(new Event('change', { bubbles: true })); return true })()`); await sleep(200); await k.js(`(() => { const w = document.querySelector('[data-sheet-where]'); if (w) { w.focus(); w.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })) } return !!w })()`); await sleep(600); await k.shot('spawn-sheet'); await k.js(`(() => { const w = document.querySelector('[data-sheet-where]'); if (w) w.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return true })()`); await sleep(300) } },
  // M197 (D05). The start sheet is the milestone's whole face and it had no
  // scene: a surface with no golden is one nobody can see regress.
  { name: 'start-work', intent: 'M197 (D05). The Start work sheet: one place for the three things a start needs — the task, the agent and the repository — with a teammate chosen so the repository field holds the clones under its places, the triple stated in the foot before anything is minted, and the route to the Teammates pane named rather than a grant widened from inside the flow. A placeless teammate is offered DISABLED by name in the agent field, never dropped.',
    run: async (k) => { await k.press('k', { metaKey: true }); await sleep(400); await k.type('Start work'); await sleep(400); await k.enter(); await sleep(700)
      await k.js(`(() => { const t = document.querySelector('[data-start-task]'); if (!t) return false
        const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(t, 'Fix the flush gate on the api repository'); t.dispatchEvent(new Event('input', { bubbles: true })); return true })()`)
      await sleep(200)
      await k.js(`(() => { const s = document.querySelector('[data-start-agent]'); if (!s) return false
        const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, 'ada'); s.dispatchEvent(new Event('change', { bubbles: true })); return true })()`)
      await sleep(600)
      await k.js(`(() => { const s = document.querySelector('[data-start-repo]'); const o = s && s.querySelector('option[data-start-repo-row]'); if (!o) return false
        const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, o.value); s.dispatchEvent(new Event('change', { bubbles: true })); return true })()`)
      await sleep(500); await k.shot('start-work')
      // Escape on the SHEET, not through `closePalette` — that helper presses
      // Escape on `.palette__input`, and in a sheet mode there is no input at
      // all (the sheet replaces the bar), so it does nothing and the overlay
      // is left standing. The next scene's Cmd+K then TOGGLES it shut and
      // paints a `palette-dark` with no palette in it. The spawn-sheet scenes
      // already escape this way; this one now does too.
      await k.js(`(() => { const s = document.querySelector('[data-start-sheet]'); if (s) s.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); return !!s })()`)
      await sleep(400) } },
  { name: 'palette-dark', intent: 'The palette at rest on the dark theme.',
    run: async (k) => { await k.theme('dark'); await k.press('k', { metaKey: true }); await sleep(600); await k.shot('palette-dark'); await k.closePalette(); await k.theme('light') } },
  { name: 'search', intent: 'Search across every panel (Cmd+F) for "FAIL": hits from the durable log, each naming its panel, with the matching line. M122: the scope now reads BOTH durable logs — the scrollback logs and the chat transcript logs — and what the answer left out comes first (the cap line, the redaction count), each only when non-zero.',
    run: async (k) => { await k.press('f', { metaKey: true, code: 'KeyF' }); await sleep(500); await k.type('FAIL'); await sleep(900); await k.shot('search') } },
  { name: 'search-empty', intent: 'The same search with a term nothing said: an empty state that names the term and says there were no matches, not a blank list.',
    run: async (k) => { await k.type('zzqx'); await sleep(900); await k.shot('search-empty'); await k.closePalette() } },
  { name: 'inspector-detail', intent: 'The context pane open on a live terminal whose well may be blank in the fixture (its shell prints nothing): the Detail tab\'s command, the full cwd wrapped, the Machine section\'s figure, the action bar with its one filled Restart.',
    run: async (k) => { await k.selectRail('live'); await k.context(true); await k.tab('detail'); console.log('[shot] restart paint:', await k.js(`(() => { const b = document.querySelector('[data-inspector-action="restart"]'); if (!b) return 'none'; const cs = getComputedStyle(b); return JSON.stringify({ disabled: b.disabled, text: b.textContent, bg: cs.backgroundColor, color: cs.color, opacity: cs.opacity, classes: b.className }) })()`)); await k.shot('inspector-detail') } },
  { name: 'inspector-work', intent: 'The context pane, Work tab: what the panel has changed, run and cost — every section either answers, says nothing to show, or says it is still asking.',
    run: async (k) => { await k.tab('work'); await sleep(600); await k.shot('inspector-work') } },
  { name: 'inspector-tools', intent: 'The context pane, Tools tab: what this panel\'s agent can do — permissions and commands from its toolbox.',
    run: async (k) => { await k.tab('tools'); await sleep(600); await k.shot('inspector-tools') } },
  { name: 'inspector-activity', intent: 'M279. The context pane, Activity tab: what this panel has DONE, newest first — its agent-state transitions as rows (a dot in the tone, the panel\'s name, an age, one line of detail), from the same ring buffer the orchestration page reads; or the empty sentence when nothing has happened to it yet.',
    run: async (k) => { await k.tab('activity'); await sleep(600); console.log('[shot] activity rows:', await k.js(`document.querySelectorAll('[data-activity-feed] .activity-row').length`)); await k.shot('inspector-activity'); await k.tab('detail'); await k.context(false) } },
  { name: 'navigator-panels', intent: 'The dock\'s Panels pane: one row per panel with its state, the selected row marked.',
    run: async (k) => { await k.dock('panels'); await k.shot('navigator-panels') } },
  { name: 'navigator-workspaces', intent: 'The dock\'s Workspaces pane: the two canvases, the active one marked.',
    run: async (k) => { await k.dock('workspaces'); await k.shot('navigator-workspaces') } },
  { name: 'navigator-files', intent: 'The dock\'s Files pane: a file tree rooted on the selected panel\'s directory.',
    run: async (k) => { await k.dock('files'); await sleep(500); await k.shot('navigator-files'); await k.dock('panels') } },
  { name: 'attention', intent: 'A panel rang its bell: the dock badge counts one, and the popover lists the waiting panel with a way to jump to it.',
    run: async (k) => { await k.focus('live'); await k.ring(); /* dock(): the approval scene left the popover OPEN and a bare click toggled it shut — the golden had no popover. */ await k.dock('attention'); await sleep(400); console.log('[shot] attention:', await k.js(`JSON.stringify({ pressed: document.querySelector('[data-dock="attention"]')?.getAttribute('aria-pressed'), popover: document.querySelector('.dock__popover') !== null, badge: document.querySelector('[data-dock-badge]')?.textContent })`)); await k.shot('attention'); await k.press('Escape'); await sleep(200) } },
  { name: 'overview', intent: 'The minimap in the top-right corner at 100%: one block per panel in its state colour — the waiting panel amber — and the camera as an iris rectangle; the status board while working.',
    run: async (k) => { await k.shot('overview') } },
  { name: 'group', intent: 'A named, coloured group frame around two panels, with its label, member count, and its card and remove controls in the header.',
    run: async (k) => { await k.goTo('the workers'); await k.wake('groupA'); await k.shot('group') } },
  { name: 'group-collapsed', intent: 'The same group carded: its live member is now a card inside a dashed frame, and nothing was closed.',
    run: async (k) => { await k.click('.canvas-group__toggle'); await sleep(500); await k.shot('group-collapsed'); await k.click('.canvas-group__toggle'); await sleep(300) } },
  { name: 'merged', intent: 'The merged view: every workspace\'s panels at once, the api lane in frame with its header, the read-only chip in the top bar, the HUD pill at 22 %.',
    run: async (k) => { await k.goTo('the kinds'); await k.click('.shell__merge'); await sleep(900); await k.zoom(0.25); await k.shot('merged'); await k.click('.shell__merge'); await sleep(500); await k.zoom(1) } },
  { name: 'zoomed-out', intent: 'The canvas pulled back to about a fifth of the size: every card is its kind glyph, its name clipped to the frame and its state on a tone wash; the minimap agrees.',
    run: async (k) => { await k.goTo('the kinds'); await k.zoom(0.22); await k.shot('zoomed-out') } },
  { name: 'zoomed-out-dark', intent: 'The zoomed-out canvas on the dark theme.',
    run: async (k) => { await k.theme('dark'); await k.shot('zoomed-out-dark'); await k.theme('light'); await k.zoom(1) } },
  { name: 'compact', intent: 'The shell at its compact breakpoint (1000px wide): the navigator and context become drawers, the canvas keeps the width.', size: [1000, 760],
    run: async (k) => { await k.context(true); await sleep(400)
      if (process.env.SHOT_PROBE) console.log('PROBE compact', await k.js(`(() => { const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [s, Math.round(b.top), Math.round(b.bottom), Math.round(b.height), getComputedStyle(e).display, getComputedStyle(e).height] }
        return JSON.stringify([r('.shell'), r('.shell__inspector'), r('.shell__inspector > *'), r('.context'), r('.context__header'), r('.context__tabs'), r('.context__body'), r('.inspector__actions'), r('.context__panel[data-context-panel="tools"]')]) })()`))
      await k.shot('compact'); await k.context(false) } },
  { name: 'workflow', intent: 'The workflow panel: a template drawn as a block diagram (scan, workers, judge, report) with the edge words between them; the verb row with Run ENABLED (the pool has its caller since M138), Triggers, Stop (disabled — no pool is running), Save (disabled — the draft is kept on the panel; Save on the diagram arrives with M184), Delete and Build with AI; the Definition tab selected.',
    run: async (k) => { await k.goTo('the workflow'); await sleep(600); await k.shot('workflow') } },
  { name: 'workflow-edit', intent: 'M183. The workflow panel as an EDITOR: the node library opened from its `Add node…` disclosure (an entry per kind, each a name, one sentence and an example, with its own Add control), the diagram beside it with a port on every block, the `scan` block selected with the accent stroke, and the context pane on Detail showing that node\'s own fields from its kind\'s schema — folder, title, command, arguments, preset, first message — as editable inputs with a Done verb; Save still disabled with the sentence naming M184; nothing running.', size: [1800, 1000],
    run: async (k) => {
      // In order, and every step a REAL press: select the panel (the pane names
      // the selected panel), open the library (a disclosure, and it shifts the
      // diagram), THEN press the block — a point computed before the shift
      // lands on the wrong block. Everything is put back after the shot: the
      // library closed, the context tab as it was (a persisted setting), the
      // pane as it was, and nothing selected.
      const press = async (sel) => {
        const p = await k.js(`(() => { const t = document.querySelector(${JSON.stringify(sel)}); if (!t) return null; const r = t.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } })()`)
        if (!p) return false
        k.wc.focus(); k.wc.sendInputEvent({ type: 'mouseDown', ...p, button: 'left', clickCount: 1 }); k.wc.sendInputEvent({ type: 'mouseUp', ...p, button: 'left', clickCount: 1 })
        await sleep(250)
        return true
      }
      await press('.panel[data-panel-kind="workflow"] .pf__title')
      await press('[data-workflow-library-toggle]')
      await sleep(300)
      await press('[data-workflow-block="scan"] rect')
      const tabBefore = await k.js(`document.querySelector('[data-context-tab][aria-selected="true"]')?.getAttribute('data-context-tab') ?? 'detail'`)
      await k.context(true)
      await k.tab('detail')
      for (let i = 0; i < 20 && !(await k.js(`document.querySelector('[data-inspector-node="block"]') !== null`)); i++) await sleep(100)
      await sleep(500)
      await k.shot('workflow-edit')
      await press('[data-workflow-library-toggle]')
      await k.tab(tabBefore)
      await k.context(false)
      await k.js(`(() => { const bg = document.querySelector('.canvas'); if (!bg) return false; bg.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, clientX: 1300, clientY: 800 })); bg.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0, clientX: 1300, clientY: 800 })); return true })()`)
      await sleep(300)
    } },
  { name: 'wide', intent: 'The shell at its wide breakpoint (1800px): navigator and context pane both resident, canvas between them.', size: [1800, 1000],
    run: async (k) => { await k.context(true); await sleep(400); await k.shot('wide') } },
  // M149. The 4.0 audit's three owed scenes. Each is the REAL condition, set
  // through the DevTools protocol rather than the renderer's test override:
  // a scene proves what a person on that machine would see.
  { name: 'reduced-motion', intent: 'M149. The camera with `prefers-reduced-motion: reduce` on: a palette jump to a far panel lands INSTANTLY — the frame captured a beat after Enter already shows the target framed and selected, with no mid-flight blur or trail — the M56 rule under the real media query, not the test override.', size: [1440, 900],
    run: async (k) => {
      try { k.wc.debugger.attach('1.3') } catch { /* attached by an earlier scene */ }
      await k.wc.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
      // The harness sets the M56 OVERRIDE at boot (every scene's flight is one
      // frame so the captures are deterministic), and the override is read
      // BEFORE the media query — with it on, this scene proved nothing (the
      // Act III critic). Off for the jump, so the real media feature is what
      // lands it; back on after.
      await k.js(`window.__m56ReducedMotion(null)`)
      console.log('[shot] reduced-motion matches:', await k.js(`window.matchMedia('(prefers-reduced-motion: reduce)').matches`))
      await k.goTo('claude — api'); await sleep(300)
      await k.press('k', { metaKey: true }); await sleep(300)
      await k.type('worker b'); await sleep(200)
      await k.js(`(() => { const i = document.querySelector('.palette__input'); if (i) i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return true })()`)
      // A beat, not the goTo's 700ms: with reduce on there is no flight to wait out.
      await sleep(80)
      await k.shot('reduced-motion')
      await k.wc.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [] })
      await k.js(`window.__m56ReducedMotion(true)`)
    } },
  // A `scale-100` scene (a device scale factor of 1 through
  // Emulation.setDeviceMetricsOverride) was tried and DROPPED by measurement:
  // capturePage renders at the display's own scale whatever the override
  // says — the capture came back 2880x1800 — so the scene could not prove
  // what its intent claimed. The 100% density stays a hand check.
  { name: 'ink', intent: 'M155. Ink on the annotation layer: annotate mode with the DRAW tool pressed on the strip, one stroke drawn across the ground and one drawn from a panel (it belongs to the panel and moves with it), the strokes in the label\'s own colour at a world width, the last one selected; the strip names the gesture (`drag to draw`).', size: [1440, 900],
    run: async (k) => {
      await k.goTo('worker a'); await sleep(300)
      await k.press('k', { metaKey: true }); await sleep(300)
      await k.type('annotate'); await sleep(300)
      await k.js(`(() => { const i = document.querySelector('.palette__input'); if (i) i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return true })()`)
      await sleep(500)
      await k.click('[data-annotate-tool="draw"]'); await sleep(200)
      const host = await k.js(`(() => { const c = document.querySelector('.canvas'); const r = c.getBoundingClientRect(); return { x: r.left, y: r.top } })()`)
      const drag = async (from, to, steps) => {
        k.wc.sendInputEvent({ type: 'mouseDown', x: from.x, y: from.y, button: 'left', clickCount: 1 })
        for (let i = 1; i <= steps; i++) { k.wc.sendInputEvent({ type: 'mouseMove', x: from.x + (to.x - from.x) * i / steps, y: from.y + (to.y - from.y) * i / steps + Math.sin(i) * 12, button: 'left', modifiers: ['leftButtonDown'] }); await sleep(20) }
        k.wc.sendInputEvent({ type: 'mouseUp', x: to.x, y: to.y, button: 'left', clickCount: 1 })
      }
      await drag({ x: host.x + 120, y: host.y + 520 }, { x: host.x + 520, y: host.y + 560 }, 24)
      await sleep(200)
      const pr = await k.js(`(() => { const p = document.querySelector('.panel[data-panel-id="groupA"]'); if (!p) return null; const r = p.getBoundingClientRect(); return { x: r.left + 60, y: r.top + 140 } })()`)
      if (!pr) throw new Error('ink scene: panel groupA is gone')
      await drag(pr, { x: pr.x + 220, y: pr.y + 60 }, 20)
      await sleep(400)
      await k.shot('ink')
      await k.js(`(() => { const b = document.querySelector('[data-annotate-done]'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return !!b })()`)
      await sleep(200)
    } },
  { name: 'orchestration', reference: ['docs/design-reference.png', 'docs/design/orchestrate-preview.png'], intent: 'M271/M274/M275, cubes on an R3F island since the diorama R3F pass. The Orchestration HUD as a diorama over the fixture canvas: glass metrics, real-lit WebGL agent cubes (a shared light rig and shadow-catching ground, one stage tilt) standing on an elliptical ground plane, the hub painted behind the near satellites (a real depth buffer, not painter\'s order), upright callout cards anchored to their cubes, hub spokes quieter than authored links, pipeline stages from the board, the activity ring. The task frame is lifted (Show all) and one back-of-ring satellite is selected: the unselected cubes dim yet stay solid, and its expanded card hangs BELOW it, painted over the hub. Disclosed: the clock values and greeting are hidden, because they change every run, and so are the System card\'s CPU/Memory numbers and their two sparklines — those are a REAL sample of this machine\'s process table, so they differ between two runs a minute apart (measured 2 MB against 1 MB), and the memory tile is the one that failed the dark golden\'s tile budget at 81%. The cards, labels and geometry are unmasked; only the live values are. Captured under prefers-reduced-motion so every cube is at rest (no bob, breath or shimmer) — the static depth, tone colours and callouts are exactly what a reduced-motion person sees. The canvas host stays mounted behind it. No invented CI branding.', size: [1440, 900],
    run: async (k) => {
      // Sized so the capture never inherits the previous scene's window (a golden
      // at 865 against an 868 capture was this scene's standing red), and stilled
      // so a mid-bob cube can never move a tile between two runs.
      try { k.wc.debugger.attach('1.3') } catch { /* attached by an earlier scene */ }
      await k.wc.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
      try {
        await k.loadMain()
        await k.js(`(() => { const b = document.querySelector('[data-dock="orchestration"]'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); return !!b })()`)
        // M325. Orchestrate opens on its task list; this scene is the diorama, the visualisation a person chooses.
        for (let i = 0; i < 20 && !(await k.js(`!!document.querySelector('[data-orch-lens="scene"]')`)); i++) await sleep(100)
        await k.js(`(() => { if (!document.querySelector('[data-orch-view="tasks"]')) return false; const b = document.querySelector('[data-orch-lens="scene"]'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return !!b })()`)
        for (let i = 0; i < 20 && !(await k.js(`!!document.querySelector('.orch__cube-canvas canvas')`)); i++) await sleep(100)
        if (!(await k.js(`!!document.querySelector('.orch__cube-canvas canvas')`))) throw new Error('orchestration scene: no 3D cube painted')
        // The fixture has a focused task, which ghosts every non-member cube and
        // hides its card — a golden of ghosts pins no glass and no depth. Show the
        // whole ring, then select one plain satellite so an EXPANDED callout (the
        // glass card, its outward-scrubbed tail, Jump) is in the frame.
        await k.js(`(() => { const b = [...document.querySelectorAll('.orch__roster .orch__mini')].find((x) => x.textContent.trim() === 'Show all'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return !!b })()`)
        await sleep(300)
        const picked = await k.js(`(() => { const c = document.querySelector('.orch__cube:not(.orch__cube--hub):not(.orch__cube--overflow):not(.orch__cube--synthetic)'); if (c) c.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return !!c })()`)
        if (!picked) throw new Error('orchestration scene: no satellite cube to select')
        for (let i = 0; i < 20 && !(await k.js(`!!document.querySelector('.orch__callout-card[data-expanded]')`)); i++) await sleep(100)
        // M299. Nothing is masked any more: the wall clock, the view-open timer and
        // the time-of-day greeting this mask hid are gone from the page. The empty
        // style stays as the hook, so a future live value has a named place to go.
        await k.js(`(() => { const s = document.createElement('style'); s.id = 'shot-orch-mask'; s.textContent = ''; document.head.appendChild(s); return true })()`)
        await sleep(600)
        await changesRead(k, 'orchestration')
        await k.shot('orchestration')
        await k.js(`(() => { document.getElementById('shot-orch-mask')?.remove(); return true })()`)
      } finally {
        await k.wc.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [] })
      }
    } },
  { name: 'orchestration-dark', reference: ['docs/design-reference.png', 'docs/design/orchestrate-preview.png'], intent: 'Command deck in dark mode: blue-black ground, glass cubes, role-tinted platforms, mono labels and separate state dots. Same selection as the light scene; clocks, greeting and the live machine readouts masked (see the light scene\'s disclosure) and reduced motion enabled.', size: [1440, 900],
    run: async (k) => {
      await k.wc.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
      try {
        await k.theme('dark')
        await k.js(`(() => { const s = document.createElement('style'); s.id = 'shot-orch-mask'; s.textContent = ''; document.head.appendChild(s); return true })()`)
        await sleep(600)
        await changesRead(k, 'orchestration-dark')
        await k.shot('orchestration-dark')
      } finally {
        await k.js(`(() => { document.getElementById('shot-orch-mask')?.remove(); return true })()`)
        await k.theme('light')
        // BACK TO THE CANVAS. This pair opened the Orchestrate page and nothing
        // closed it, so every scene after it ran UNDER that page: `file-missing`'s
        // golden was a picture of the orchestration HUD (greeting and wall clock
        // unmasked, so it also went red by time of day), and `starter` reported
        // "the arrangement is not on screen" — recorded in the M279 ledger as a
        // flake. The dock button is a toggle, so press it only while it is pressed,
        // and refuse to go on if the page is still there.
        await k.js(`(() => { const b = document.querySelector('[data-dock="orchestration"][aria-pressed="true"]'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); return !!b })()`)
        for (let i = 0; i < 20 && (await k.js(`!!document.querySelector('.orch__graph-wrap')`)); i++) await sleep(100)
        if (await k.js(`!!document.querySelector('.orch__graph-wrap')`)) throw new Error('orchestration-dark: the Orchestrate page is still open, so every later scene would capture it')
        await k.wc.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [] })
      }
    } },
  { name: 'orchestration-working', reference: ['docs/design-reference.png', 'docs/design/orchestrate-preview.png'], intent: 'M280. The ring with work ACTUALLY RUNNING, which is the state the rest of the diorama is designed for and the one no other scene shows: three agents busy and one waiting on a person, so the bloom tiers, the role-coloured halos and the ground pools under lit nodes are all in frame at once. The companion to `orchestration-dark`, which is the same ring with everything idle — that scene pins that idle does NOT bloom (a dark floor and unlit slabs), this one pins that working does. DISCLOSED, and the only thing faked: the fixture spawns no real agent, so the harness sends the same `agent:state` transitions main would have sent for four of the fixture\'s own panels, addressed by the `data-node` each cube carries; every pixel after that is the real model, the real material and the real composer. Dark theme and reduced motion, so a mid-bob cube cannot move a tile between runs; clocks, greeting and the live machine readouts masked as in the pair above.', size: [1440, 900],
    run: async (k) => {
      // RUNS LAST of the three, and opens the page itself rather than
      // inheriting it. Sequenced between `orchestration` and its dark twin, the
      // seeded transitions landed in the canvas-wide ACTIVITY FEED, which is a
      // real event ring — so the next scene's golden gained two rows it did not
      // ask for. Restoring the tone puts the state back but never the history;
      // the only way to leave a neighbour untouched is to run after it.
      await k.wc.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
      const seeded = []
      try {
        await k.js(`(() => { const b = document.querySelector('[data-dock="orchestration"]'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); return !!b })()`)
        // M325. Orchestrate opens on its task list; this scene is the diorama, the visualisation a person chooses.
        for (let i = 0; i < 20 && !(await k.js(`!!document.querySelector('[data-orch-lens="scene"]')`)); i++) await sleep(100)
        await k.js(`(() => { if (!document.querySelector('[data-orch-view="tasks"]')) return false; const b = document.querySelector('[data-orch-lens="scene"]'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return !!b })()`)
        for (let i = 0; i < 20 && !(await k.js(`!!document.querySelector('.orch__cube-canvas canvas')`)); i++) await sleep(100)
        if (!(await k.js(`!!document.querySelector('.orch__cube-canvas canvas')`))) throw new Error('orchestration-working: no 3D cube painted')
        await k.theme('dark')
        await k.js(`(() => { const b = [...document.querySelectorAll('.orch__roster .orch__mini')].find((x) => x.textContent.trim() === 'Show all'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return !!b })()`)
        await sleep(300)
        // A ROLE MIX, not the first four cubes in the ring. Taking them in order
        // lit four TERMINALS, and a scene in which every working cube is the same
        // role cannot show that brightness preserves hue — the lit cubes were
        // being compared against UNLIT cubes of other roles, which tests
        // brightness, not colour. So: one cube of each kind available, chats
        // first because a chat panel is agentic and therefore also moves the
        // ACTIVE AGENTS tile, which otherwise reads 1 beside four lit cubes.
        const ids = await k.js(`(() => {
          const cubes = [...document.querySelectorAll('.orch__cube:not(.orch__cube--hub):not(.orch__cube--overflow):not(.orch__cube--synthetic)')]
            .map((c) => ({ id: c.dataset.node, kind: c.dataset.kind })).filter((c) => c.id)
          const byKind = new Map()
          for (const c of cubes) if (!byKind.has(c.kind)) byKind.set(c.kind, c)
          // One per kind, then top up from whatever is left so the ring is busy.
          const picked = [...byKind.values()]
          for (const c of cubes) if (picked.length < 4 && !picked.includes(c)) picked.push(c)
          return picked.slice(0, 4).map((c) => c.id + '::' + c.kind)
        })()`)
        if (!Array.isArray(ids) || ids.length < 3) throw new Error(`orchestration-working: expected at least 3 addressable cubes, got ${JSON.stringify(ids)}`)
        const kinds = ids.map((x) => String(x).split('::')[1])
        if (new Set(kinds).size < 2) throw new Error(`orchestration-working: every seeded cube is a ${kinds[0]} — this scene exists to show role beside role under the same brightness, so one role cannot carry it`)
        // Busy on all but the last, wants-you on the last: the two tiers that
        // clear the bloom threshold, so a regression in either is one changed tile.
        const states = ids.map((_, i) => (i === ids.length - 1 ? 'wants-you' : 'busy'))
        for (let i = 0; i < ids.length; i++) {
          const panelId = String(ids[i]).split('::')[0]
          k.wc.send('agent:state', { panelId, state: states[i] })
          seeded.push(panelId)
        }
        for (let i = 0; i < 20 && !(await k.js(`!!document.querySelector('.orch__cube--busy')`)); i++) await sleep(100)
        if (!(await k.js(`!!document.querySelector('.orch__cube--busy')`))) throw new Error('orchestration-working: no cube took the busy tone, so the lit ring this scene exists to show is not in the frame')
        await k.js(`(() => { const s = document.createElement('style'); s.id = 'shot-orch-mask'; s.textContent = ''; document.head.appendChild(s); return true })()`)
        await sleep(700)
        await changesRead(k, 'orchestration-working')
        await k.shot('orchestration-working')
      } finally {
        for (const id of seeded) k.wc.send('agent:state', { panelId: id, state: 'idle' })
        await k.js(`(() => { document.getElementById('shot-orch-mask')?.remove(); return true })()`)
        await k.theme('light')
        // Same close-and-assert the dark scene uses: leaving this page open made
        // every later scene a picture of the Orchestrate HUD once already.
        await k.js(`(() => { const b = document.querySelector('[data-dock="orchestration"][aria-pressed="true"]'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); return !!b })()`)
        for (let i = 0; i < 20 && (await k.js(`!!document.querySelector('.orch__graph-wrap')`)); i++) await sleep(100)
        if (await k.js(`!!document.querySelector('.orch__graph-wrap')`)) throw new Error('orchestration-working: the Orchestrate page is still open, so every later scene would capture it')
        await k.wc.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [] })
      }
    } },
  { name: 'orchestration-watch', reference: ['docs/design-reference.png', 'docs/design/orchestrate-preview.png'], intent: 'M304. The Watch lens with work ACTUALLY HAPPENING: the dark theme, every roster session on its island platform — the focused task centre, the rest ringing it — two chats working (spinning iris cores with orbit rings), the files they touched standing as towers of green (added) and red (removed) slabs labelled with the lines written, the file both chats wrote wearing an amber ring, a write in flight as a light arc carrying its real code token, and the working chat\'s callout typing that token. Seeded through real `agent:event` turns — the same door a live session uses — and captured mid-flight WITHOUT reduced motion, so the one thing this image cannot pin is the exact frame of the arc; the towers, labels, callout and HUD are the regression surface.', size: [1440, 900],
    run: async (k) => {
      const turn = (panelId, id, blocks) => k.wc.send('agent:event', { id: panelId, type: 'turn', turn: { id, role: 'assistant', blocks, at: Date.now() } })
      const result = (panelId, id, toolUseId, isError) => k.wc.send('agent:event', { id: panelId, type: 'turn', turn: { id, role: 'user', blocks: [{ type: 'tool_result', toolUseId, content: '', isError }], at: Date.now() } })
      const f = (name) => join(REPO, 'src', name)
      let opened = false
      try {
        // The chat store only takes events for panels a mounted panel has seeded
        // (chat-store's recycled-id door), so the fixture canvas has to have been
        // on screen first — the `orchestration` scene loads it the same way.
        await k.loadMain()
        for (let i = 0; i < 30 && !(await k.js(`!!document.querySelector('[data-panel-id="chat"], .chat')`)); i++) await sleep(100)
        await sleep(400)
        await k.js(`(() => { const b = document.querySelector('[data-dock="orchestration"]'); if (b && b.getAttribute('aria-pressed') !== 'true') b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); return !!b })()`)
        opened = true
        for (let i = 0; i < 30 && !(await k.js(`!!document.querySelector('[data-orch-lens="watch"]')`)); i++) await sleep(100)
        await k.theme('dark')
        await k.js(`(() => { const b = [...document.querySelectorAll('.orch__roster .orch__mini')].find((x) => x.textContent.trim() === 'Show all'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return !!b })()`)
        k.wc.send('agent:state', { panelId: 'chat', state: 'busy' })
        k.wc.send('agent:state', { panelId: 'codex', state: 'busy' })
        // History first: what happened before Watch opened stands as towers and never flies.
        turn('chat', 'w-h1', [
          { type: 'tool_use', id: 'wh1', name: 'Read', input: { file_path: f('config.ts') } },
          { type: 'tool_use', id: 'wh2', name: 'Write', input: { file_path: f('health.ts'), content: 'export function watchdogBudget(load: number): number {\n  // back off under load instead of firing on a fixed 2s tick\n  const base = config.watchdogMs ?? 2000\n  return Math.min(8000, base * Math.max(1, load / 0.75))\n}\n' } }
        ])
        turn('codex', 'w-h2', [{ type: 'tool_use', id: 'wh3', name: 'Edit', input: { file_path: f('config.ts'), old_string: '', new_string: 'watchdogMs: 2000,\nwatchdogMaxMs: 8000' } }])
        await sleep(400)
        await k.js(`(() => { const b = document.querySelector('[data-orch-lens="watch"]'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return !!b })()`)
        for (let i = 0; i < 40 && !(await k.js(`!!document.querySelector('[data-orch-live] canvas')`)); i++) await sleep(100)
        if (!(await k.js(`!!document.querySelector('[data-orch-live] canvas')`))) throw new Error('orchestration-watch: the Watch scene did not paint')
        await sleep(900)
        // Live: these arrive while the lens is open, so they fly.
        turn('codex', 'w-l1', [{ type: 'tool_use', id: 'wl1', name: 'Edit', input: { file_path: f('server.ts'), old_string: 'setInterval(tick, 2000)\nconst fixed = true', new_string: 'scheduleWatchdog(watchdogBudget(load))' } }])
        turn('chat', 'w-l2', [{ type: 'tool_use', id: 'wl2', name: 'Bash', input: { command: 'npm test -- health' } }])
        result('chat', 'w-r2', 'wl2', false)
        await sleep(500)
        turn('chat', 'w-l3', [{ type: 'tool_use', id: 'wl3', name: 'Edit', input: { file_path: f('server.ts'), old_string: 'const tick = 2000', new_string: 'const tick = watchdogBudget(load)\nlog.debug(tick)' } }])
        await sleep(1150)
        const painted = await k.js(`(() => { const r = document.querySelector('[data-orch-live]'); return r ? { towers: r.dataset.orchLiveTowers, events: r.dataset.orchLiveEvents } : null })()`)
        if (!painted || Number(painted.towers) < 3) throw new Error(`orchestration-watch: expected at least 3 towers, got ${JSON.stringify(painted)}`)
        await changesRead(k, 'orchestration-watch')
        await k.shot('orchestration-watch')
      } finally {
        k.wc.send('agent:state', { panelId: 'chat', state: 'idle' })
        k.wc.send('agent:state', { panelId: 'codex', state: 'idle' })
        // The lens is a PERSISTED preference: leave it on Watch and every later
        // Orchestrate scene (and golden) opens on Watch instead of the Scene.
        await k.js(`(() => { const b = document.querySelector('[data-orch-lens="scene"]'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return !!b })()`)
        await k.theme('light')
        if (opened) {
          await k.js(`(() => { const b = document.querySelector('[data-dock="orchestration"][aria-pressed="true"]'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); return !!b })()`)
          for (let i = 0; i < 20 && (await k.js(`!!document.querySelector('.orch__graph-wrap')`)); i++) await sleep(100)
        }
      }
    } },
  { name: 'file-missing', intent: 'M149. A file panel whose file was deleted from disk under it: the watcher\'s push reaches the panel and it says so in words (`not found`), keeps its title and its chrome, and offers the reload — the error arm every three-state result must have, never a blank body.', size: [1440, 900],
    run: async (k) => {
      // Last, on purpose: the file stays gone for every scene after it.
      rmSync(join(REPO, 'src', 'server.ts'))
      await k.goTo('server.ts'); await sleep(1500)
      await k.shot('file-missing')
    } },
  { name: 'starter', intent: 'M181/M205. The starter canvas the OPTIONAL `Starter canvas…` line (inside the launcher\'s `More ways to start`) lays out: the agent (an asleep chat, its composer the first thing to type into) at working size in the middle, and to its right and below a captioned example of each kind — a dormant terminal card, a note over a real Markdown file, a workflow projecting the built-in template, an image showing real pixels — in a group named Examples; every caption a sentence under its object; nothing running, no process spawned; the launcher gone.',
    run: async (k) => {
      // LAST, on an EMPTIED canvas: the chat this scene mints leaves main-side
      // state (the recent folders the sheet's WHERE reads) that shifted four
      // later scenes past their budgets when it ran second.
      await k.emptyCanvas()
      // REAL clicks (a dispatched click never reaches shellControl's
      // mousedown; the product suite's own lesson): M205 moved the starter
      // off the primary and into the disclosure, so open it, then press the line.
      const press = async (selector) => {
        const point = await k.js(`(() => { const b = document.querySelector(${JSON.stringify(selector)}); if (!b || b.disabled) return null; const r = b.getBoundingClientRect(); if (r.width === 0) return null; return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } })()`)
        if (point) { k.wc.focus(); k.wc.sendInputEvent({ type: 'mouseDown', ...point, button: 'left', clickCount: 1 }); k.wc.sendInputEvent({ type: 'mouseUp', ...point, button: 'left', clickCount: 1 }) }
        return point !== null
      }
      await press('[data-launcher-more-toggle]')
      for (let i = 0; i < 20 && !(await press('[data-launcher-starter]')); i++) await sleep(100)
      for (let i = 0; i < 40 && (await k.js(`document.querySelectorAll('.panel[data-panel-kind]').length`)) < 5; i++) await sleep(100)
      for (let i = 0; i < 30 && !(await k.js(`document.querySelector('[data-image-node][data-image-arm="data"]') !== null`)); i++) await sleep(100)
      // LOUD when the arrangement is not there: a capture of the chat alone
      // would be written as the starter's golden by a blind update (the critic).
      const kinds = await k.js(`[...document.querySelectorAll('.panel[data-panel-kind]')].map((p) => p.getAttribute('data-panel-kind')).sort().join(',')`)
      if (kinds !== 'chat,file,image,terminal,workflow') throw new Error(`starter scene: the arrangement is not on screen (${kinds})`)
      await sleep(800)
      await k.shot('starter')
    } },
  // M336–M338. After the starter, on purpose: these turn the harness's account
  // ON, and every scene above must keep its top bar exactly as its golden has it.
  { name: 'account-menu', intent: 'M336. The account menu open from the top bar\'s last control — the active account\'s initials (`AL`) in a circle. Under `Active account`, the two GitHub accounts signed in on this Mac as a radio set, `ada-lovelace` checked; `Add another account…`; under `Sharing`, `Share this workspace…` and `Open a shared workspace…`; below a rule, `Sign out ada-lovelace`. The menu is the View menu\'s own surface.',
    run: async (k) => {
      await k.emptyCanvas()
      k.accountOn()
      for (let i = 0; i < 20 && !(await k.js(`!!document.querySelector('.shell__account-avatar')`)); i++) await sleep(100)
      const point = await k.js(`(() => { const b = document.querySelector('.shell__account-trigger'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } })()`)
      if (point === null) throw new Error('account-menu scene: no account trigger in the top bar')
      k.wc.focus(); k.wc.sendInputEvent({ type: 'mouseDown', ...point, button: 'left', clickCount: 1 }); k.wc.sendInputEvent({ type: 'mouseUp', ...point, button: 'left', clickCount: 1 })
      for (let i = 0; i < 20 && !(await k.js(`!!document.querySelector('.shell__account-menu:not([hidden])')`)); i++) await sleep(100)
      await sleep(400)
      await k.shot('account-menu')
      await k.press('Escape'); await sleep(300)
    } },
  { name: 'share-dialog', intent: 'M337. The share dialog over a dimmed canvas, for a workspace that is not shared yet: `Share “Main”` as its title; one sentence saying exactly what crosses (cards: place, kind, a scrubbed title and owner) and what never does (no command, folder or transcript); an `Organization` select reading `Acme`; the note that you become its owner and nobody is in until you add them; the primary `Share`, and `Done` at the foot.',
    run: async (k) => {
      await k.press('k', { metaKey: true }); await sleep(400); await k.type('Share this workspace'); await sleep(400); await k.enter()
      for (let i = 0; i < 30 && !(await k.js(`!!document.querySelector('.share-dialog__org')`)); i++) await sleep(100)
      await sleep(400)
      await k.shot('share-dialog')
      await k.press('Escape'); await sleep(300)
      await k.js(`(() => { const b = [...document.querySelectorAll('.share-dialog__btn')].find((x) => x.textContent === 'Done'); if (b) b.click(); return true })()`); await sleep(300)
    } },
  { name: 'relay', intent: 'M338. A relay terminal on an otherwise empty canvas: a panel that KEEPS its header — the relay glyph, `relay · shell` as its title and the kind word `relay` — over the M335 attachment. The strip reads `You are in control` with the program `shell` in mono and one verb, `End session`; below it the remote shell\'s screen (`ada@relay:~$ uptime`, a load line, an `ls` of the deploy folder) in the terminal well, cursor live because this person is the one typing.',
    run: async (k) => {
      await k.press('k', { metaKey: true }); await sleep(400); await k.type('New Relay terminal'); await sleep(400); await k.enter()
      for (let i = 0; i < 40 && !(await k.js(`(() => { const s = document.querySelector('[data-relay-node] .xterm-rows'); return !!s && s.textContent.includes('ada@relay') })()`)); i++) await sleep(100)
      if (!(await k.js(`!!document.querySelector('[data-relay-node]')`))) throw new Error('relay scene: no relay panel on the canvas')
      await k.closePalette()
      await sleep(600)
      await k.shot('relay')
    } },
  { name: 'shared-canvas', intent: 'M343–M345. A SHARED workspace from its owner\'s seat, with a teammate (sam) working in it from another Mac. The roster strip shows sam in sam\'s colour, and (M349) sam\'s one agent beside sam as a smaller CIRCLE of its own (people are rounded squares): a dashed ring in sam\'s colour, never filled (a filled tile is a person), its initial in the working tone, named in full on hover (`claude — tests — sam\'s agent, working`). sam\'s cursor sits on the canvas with a name tag. Beneath the owner\'s own relay terminal, two of sam\'s panels stand as inert placeholders, each header wearing sam\'s colour and name: sam\'s RELAY terminal reads `sam\'s terminal on the team relay · shell` and offers Attach (the session id crossed the doc; the relay still decides by role), and sam\'s terminal reads `Terminal on sam\'s machine — nothing runs here`. Nothing of sam\'s runs here, and nothing is started by showing it. DISCLOSED: the view and the roster are the pushes main\'s canvas-sync and presence hub would send, sent as those pushes — no doc and no network in the harness.',
    run: async (k) => {
      const sh = k.shared
      const wsId = sh.store.current().activeWorkspaceId
      sh.store.setWorkspaceShare(wsId, { id: sh.share, orgId: sh.org.id, role: 'owner' })
      // The relay scene left the owner's relay panel (720x460, world rect read
      // off its own style) at the viewport's centre. sam's two panels go in a
      // row BENEATH it, the same total width, and the camera then moves up with
      // a real wheel so the three fit the window.
      const at = await k.js(`(() => { const p = document.querySelector('.panel[data-panel-kind="relay"]'); if (!p) return null; return { x: parseFloat(p.style.left), y: parseFloat(p.style.top), w: parseFloat(p.style.width), h: parseFloat(p.style.height) } })()`)
      if (at === null) throw new Error('shared-canvas scene: the relay scene left no relay panel to stand beneath')
      const place = (id, kind, title, x, y, w, h, extra = {}) => ({ id, kind, title, owner: sh.sam, host: 'hostsam1', x, y, w, h, z: 50, ...extra })
      const half = (at.w - 30) / 2
      sh.state.view = {
        shareId: sh.share, role: 'owner', seq: 1, rects: [], files: [],
        placeholders: [
          place('hostsam1_r1', 'relay', 'relay · shell', at.x, at.y + at.h + 30, half, 160, { relay: { session: 'samRelaySession000001', program: 'shell' } }),
          place('hostsam1_n1', 'terminal', 'tests — api', at.x + half + 30, at.y + at.h + 30, half, 160)
        ]
      }
      const samPresence = {
        // The colour a real peer carries: derived from the user id (presence.ts colorOf), the same the placeholders read.
        userId: sh.sam, displayName: 'sam', initials: 'S', color: colorOf(sh.sam), currentPanelId: null,
        cursor: { x: at.x + half + 150, y: at.y + at.h + 130 }, viewport: null, selection: [], textCursor: null,
        mode: 'canvas', agentStatus: 'working', statusLine: '', currentTask: 'Watchdog fires under load', observing: null, lastActivity: Date.now(),
        // M349. sam's agent, as sam's machine publishes it: the panel's id, its scrubbed title, its state.
        agents: [{ id: 'n7', name: 'claude — tests', status: 'working' }]
      }
      sh.state.roster = { workspaceId: wsId, connection: 'connected', peers: [{ clientId: 7, presence: samPresence, status: 'active', idleForMs: 0, live: true }] }
      sh.state.on = true
      k.wc.send(sh.events.CANVAS_SHARED, sh.state.view)
      k.wc.send(sh.events.PRESENCE_REMOTE, sh.state.roster)
      // The workspace rows reload on a palette open (Canvas.tsx), which is how
      // the share becomes a row fact the share dialog below can read.
      await k.press('k', { metaKey: true }); await sleep(300); await k.closePalette(); await sleep(300)
      // Up by 80 screen px, so the relay's header clears the roster strip AND
      // the sync chip under it (a chip sitting on a panel's edge read as that
      // panel's status — the shared-offline critic) — over the empty ground at
      // the canvas's left edge
      // (a wheel over a panel would be the panel's).
      const ground = await k.js(`(() => { const c = document.querySelector('.canvas').getBoundingClientRect(); return { x: Math.round(c.left + 40), y: Math.round(c.top + c.height / 2) } })()`)
      k.wc.sendInputEvent({ type: 'mouseWheel', x: ground.x, y: ground.y, deltaX: 0, deltaY: -80 }); await sleep(500)
      for (let i = 0; i < 30 && !(await k.js(`!!document.querySelector('[data-shared-relay-attach]')`)); i++) await sleep(100)
      if (!(await k.js(`!!document.querySelector('[data-shared-relay-attach]')`))) throw new Error('shared-canvas scene: sam\'s relay placeholder did not offer Attach')
      await sleep(500)
      await k.shot('shared-canvas')
    } },
  { name: 'share-members', intent: 'M337/M345. The share dialog on a workspace that IS shared, opened by its owner: the title `“api” is shared`, the owner\'s one-sentence role, and the Members list of the share\'s organization — `ada-lovelace (you)` as owner with no picker on themselves, `sam` with an Editor picker, `lin` with a Viewer picker and `octocat`, in the organization but not in the share, with the picker at Not in. One opaque card over a dimmed canvas; nothing changes until a person picks.',
    run: async (k) => {
      await k.press('k', { metaKey: true }); await sleep(400); await k.type('Share this workspace'); await sleep(400); await k.enter()
      for (let i = 0; i < 40 && !(await k.js(`document.querySelectorAll('.share-dialog__member').length >= 4`)); i++) await sleep(100)
      if (!(await k.js(`document.querySelectorAll('.share-dialog__member').length >= 4`))) throw new Error('share-members scene: the Members view did not list the organization')
      await sleep(400)
      await k.shot('share-members')
      // Closed by its Done, not Escape: `press` dispatches on window, and
      // Radix listens for Escape on the document, so the key never reached
      // it (the share-dialog scene above closes only when the next scene's
      // palette takes focus).
      await k.click('.share-dialog__foot .share-dialog__btn'); await sleep(400)
      if (await k.js(`!!document.querySelector('.share-dialog__card')`)) throw new Error('share-members scene: the dialog did not close')
    } },
  { name: 'shared-offline', intent: 'M348. The same shared workspace with its collab server gone: under the roster strip (sam, as before), one amber chip says `Offline — 3 changes waiting to sync` — the provider\'s own count of edits the server has not acknowledged. sam\'s tile dims, and sam\'s cursor and sam\'s agent tile are gone: offline, this seat cannot know where sam is or what sam\'s agents are doing. The canvas stays editable, sam\'s placeholders stay where they were, and nothing claims the changes are lost (main keeps them; they go when the server is back). DISCLOSED: the roster is the push main\'s presence hub would send for a disconnected room, sent as that push.',
    run: async (k) => {
      const sh = k.shared
      // What the hub sends for a disconnected room (M348): the count, and every
      // peer not live — this seat cannot know where sam is now.
      sh.state.roster = { ...sh.state.roster, connection: 'disconnected', unsynced: 3, peers: sh.state.roster.peers.map((p) => ({ ...p, live: false })) }
      k.wc.send(sh.events.PRESENCE_REMOTE, sh.state.roster)
      for (let i = 0; i < 30 && !(await k.js(`!!document.querySelector('[data-sync-chip="disconnected"]')`)); i++) await sleep(100)
      if (!(await k.js(`(document.querySelector('[data-sync-chip]') || {}).textContent === 'Offline — 3 changes waiting to sync'`))) throw new Error('shared-offline scene: the sync chip did not say the three changes are waiting')
      await sleep(300)
      await k.shot('shared-offline')
    } },
  { name: 'inspector-caps', intent: 'M350–M352. The context pane, Work tab, on an AGENT CONVERSATION held at its own cap: under Cost, a Caps section reads `Spend $2.10 of $2.00 — this agent\'s cap` and `Context 118k tokens of 150k — Settings cap`; one amber sentence says the agent reached its own $2.00 spend cap ($2.10 reported) and names its fix (raise its own cap here, or cap-agent in the palette); two fields, each named on screen (`Spend cap $` holding the record\'s 2, `Context cap` blank and reading Settings, `k tokens`), beside Set; and the verb\'s own answer from the Set that wrote the cap (`spend cap $2.00`). On the chat itself the state pill reads idle with nothing waiting, and its close reads `end?` because the agent\'s process is still alive (a hold keeps the agent; closing would end it); the auto run\'s resolved chip stays in the header beside the pill and reads `auto stuck` with its dismiss (M356: what the run came to never clips; its reason, `— cap reached`, gives first, and the whole sentence with its mode is the chip\'s title), the Auto… door is hidden while the chip shows, and every control in the header is painted inside the chat\'s frame (the scene hit-tests each). DISCLOSED: the cap was written through the fields and Set (the verb\'s canvas door); the hold is the pushes main\'s agent runtime sends when a result crosses the cap (the status, the stuck run, its dropped continuation and the meter), sent as those pushes.',
    run: async (k) => {
      const meter = (m) => k.wc.send(k.shared.events.AGENT_EVENT, { id: 'chat', type: 'meter', meter: m })
      const fill = (sel, text) => k.js(`(() => { const i = document.querySelector(${JSON.stringify(sel)}); if (!i) return false
        const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, ${JSON.stringify(text)}); i.dispatchEvent(new Event('input', { bubbles: true })); return true })()`)
      // LAST in the sequence, from the fixture: nothing after it can inherit its
      // cap, its meter or its selection. The share (the scenes above) is off.
      k.shared.state.on = false
      await k.loadMain(); await k.dock('panels'); await k.context(true)
      await k.selectRail('chat'); await k.tab('work'); await sleep(400)
      if (!(await fill('[data-caps-input="usd"]', '2'))) {
        const seen = await k.js(`JSON.stringify({ rows: [...document.querySelectorAll('.rail-row[data-rail-row]')].map((r) => r.getAttribute('data-rail-row')).slice(0, 30), selected: document.querySelector('.rail-row[aria-selected="true"], .rail-row.is-selected')?.getAttribute('data-rail-row') ?? null, work: document.querySelector('[data-context-panel="work"]')?.innerText.slice(0, 400) ?? null })`)
        throw new Error(`inspector-caps scene: no Caps fields on the chat's Work tab — ${seen}`)
      }
      await k.click('[data-caps-set]'); await sleep(400)
      // What main sends when this agent's result crosses its own cap (enforceCap):
      // the turn is over (ready), the auto run the M97 scene left running goes
      // stuck with reason `cap` and its continuation is dropped with it, and the
      // meter says the hold. All four, or the scene would show a held agent
      // whose auto run is still counting.
      k.wc.send(k.shared.events.AGENT_EVENT, { id: 'chat', type: 'status', status: 'ready' })
      k.wc.send(k.shared.events.AGENT_EVENT, { id: 'chat', type: 'auto', mode: 'complete', turn: 0, limit: 8, state: 'stuck', reason: 'cap' })
      k.wc.send(k.shared.events.AGENT_EVENT, { id: 'chat', type: 'queue', queue: [] })
      meter({ spentUsd: 2.1, context: 118000, held: { unit: 'usd', spent: 2.1, limit: 2, own: true }, caps: { usd: 2, context: 150000, ownUsd: true, ownContext: false } })
      await sleep(500)
      const said = await k.js(`document.querySelector('[data-caps-said]')?.textContent ?? ''`)
      const held = await k.js(`document.querySelector('[data-caps-held]')?.textContent ?? ''`)
      if (said !== 'spend cap $2.00' || !/own cap/.test(held)) throw new Error(`inspector-caps scene: said ${JSON.stringify(said)}, held ${JSON.stringify(held)}`)
      // M356. The run's stuck chip STAYS: a held agent's header carries it,
      // and every control beside it must still be painted inside the frame.
      // A control pushed past the panel's right edge is clipped by `.panel`'s
      // overflow: hidden and painted nowhere, so each one is hit-tested at its
      // centre, never judged by its rect alone.
      const chip = await k.js(`document.querySelector('.panel[data-panel-id="chat"] [data-chat-auto]')?.getAttribute('title') ?? ''`)
      if (!/stuck — cap reached/.test(chip)) throw new Error(`inspector-caps scene: the auto chip reads ${JSON.stringify(chip)}`)
      const outside = await k.js(`(() => { const panel = document.querySelector('.panel[data-panel-id="chat"]'); const box = panel.getBoundingClientRect(); const out = []
        for (const c of panel.querySelectorAll('.pf__chrome button, .pf__chrome .pf__word')) {
          const r = c.getBoundingClientRect(); if (r.width === 0) continue
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
          if (r.right > box.right + 0.5 || !(hit === c || c.contains(hit))) out.push(c.getAttribute('aria-label') || c.textContent.trim().slice(0, 32))
        }
        return JSON.stringify(out) })()`)
      if (outside !== '[]') throw new Error(`inspector-caps scene: header controls painted outside the chat's frame — ${outside}`)
      if (process.env.SHOT_PROBE) console.log('PROBE chat header', await k.js(`JSON.stringify({ panel: Math.round(document.querySelector('.panel[data-panel-id="chat"]').getBoundingClientRect().width), items: [...document.querySelectorAll('.panel[data-panel-id="chat"] .pf__chrome .pf__title, .panel[data-panel-id="chat"] .pf__chrome button, .panel[data-panel-id="chat"] .pf__chrome .pf__word, .panel[data-panel-id="chat"] .pf__chrome .pf__kind')].map((e) => [(e.getAttribute('aria-label') || e.textContent).trim().slice(0, 18), Math.round(e.getBoundingClientRect().width)]) })`))
      await k.js(`document.querySelector('.context__panel[data-context-panel="work"]')?.scrollTo(0, 99999), true`); await sleep(200)
      await k.shot('inspector-caps')
      // The cap cleared through the same door, so the store the harness leaves holds no cap.
      await fill('[data-caps-input="usd"]', ''); await k.click('[data-caps-set]'); meter({}); await sleep(300)
    } },
]

const SCRIPT_NAME = 'shot.cjs'

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
  // M162. The goldens are 1440x865 CONTENT captures. A 900px-tall window is
  // clamped to the display's work area at creation (a 1512x982 laptop panel
  // leaves 896 under the menu bar and the Dock), so the content came out 864
  // or 865 tall depending on whether the Dock was showing — every scene then
  // fails as `the size changed` for one reason that has nothing to do with the
  // app. setContentSize AFTER creation is honoured past the work area, so the
  // content is pinned to the goldens' own size whatever the Dock is doing.
  win.setContentSize(1440, 865)
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
        // M195 (D03). BOUND to the repository the dev server beside it runs in:
        // that is what a preview opened through discovery is, and the pane says
        // whose changes reload it. An unbound pane is a real state too (it
        // reloads for nothing and reads `not bound`), and the fixture shows the
        // ordinary one.
        { id: 'browser', kind: 'browser', x: 1950, y: 120, w: 560, h: 420, z: 17, url: shotHttpUrl(), preview: { root: REPO, sourcePanelId: 'dev' } },
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
        // M116. A work card beside the chat it was dispatched to, with the edge.
        { id: 'card12', kind: 'work', x: 300, y: 570, w: 420, h: 200, z: 18, title: 'Watchdog fires under load', work: { itemId: 'wi-12' }, links: [{ to: 'chat', label: 'dispatched' }] },
        // M130. The trail's host: a terminal whose session used four skills.
        // Clear of the workers group and the wide review: the scene's whole
        // question is whether the lane crowds its HOST, and a host sitting on
        // another panel's frame would answer a different one.
        term('trail', 1800, 1800, 420, 260, 19, { title: 'claude — plan the milestone' }),
        // M106. A narrow frame with a long title: the frame rule's subject.
        term('narrow', 1400, 1360, 320, 220, 30, { title: 'review: the health check wiring for the api repository' }),
        term('twin', 1400, 1000, 480, 300, 8, { title: 'claude — api (2)', args: ['-c', 'echo "$ claude"; echo "Waiting for input"; read x; printf "\\a? Allow Edit on src/server.ts (y/n)\\n"; sleep 600'] }),
        term('groupA', 60, 1440, 420, 260, 9, { title: 'worker a', cwd: FIX, links: [{ to: 'twin', automation: { kind: 'handoff', enabled: true, trigger: 'exit-ok' } }] }),
        term('groupB', 520, 1440, 420, 260, 10, { title: 'worker b', cwd: FIX }),
        // M133. The workflow panel: a VIEW of the `nightly sweep` template
        // below, off in its own space so the diagram is the whole picture.
        { id: 'workflow', kind: 'workflow', x: 2600, y: 900, w: 620, h: 440, z: 19, title: 'nightly sweep', workflow: { templateId: 'tpl-sweep' } }
      ],
      groups: [{ id: 'g1', label: 'workers', colour: 'violet', panelIds: ['groupA', 'groupB'] }],
      // M79. A run that already happened: the chat and worker a handed off into twin.
      runs: [{ id: 'run-1', name: 'run 1', panelIds: ['chat', 'groupA', 'twin'], edges: [{ from: 'chat', to: 'twin' }, { from: 'groupA', to: 'twin' }], startedAt: Date.now() - 3600000, endedAt: Date.now() - 3480000, entries: [{ panelId: 'chat', startedAt: Date.now() - 3600000, endedAt: Date.now() - 3590000, outcome: 'a turn' }, { panelId: 'groupA', startedAt: Date.now() - 3600000, endedAt: Date.now() - 3560000, outcome: 'exit 0' }, { panelId: 'twin', startedAt: Date.now() - 3560000, endedAt: Date.now() - 3480000, outcome: 'exit 0' }], costUsd: 0.2138 }],
      bookmarks: [{ id: 'b1', name: 'the workers', camera: { x: 0, y: -1380, scale: 1 } }, { id: 'b2', name: 'the kinds', camera: { x: 0, y: 0, scale: 1 } }, { id: 'b3', name: 'the workflow', camera: { x: -2560, y: -860, scale: 1 } }],
      // M116. The board: one item dispatched to ada's chat (its card is
      // `card12` above), one still to do with no card, so the pane shows a
      // lane row and a `Show on canvas` row.
      workItems: [
        { id: 'wi-12', source: 'github', key: 'acme/canvas#12', title: 'Watchdog fires under load', url: 'https://github.com/acme/canvas/issues/12', description: 'The 300s watchdog trips when the suite runs beside a build.', state: 'working', remoteState: 'open', teammateId: 'ada', panelId: 'chat', createdAt: Date.now() - 7200000, updatedAt: Date.now() - 600000, anchor: { panelId: 'chat', dx: -470, dy: 0 } },
        { id: 'wi-31', source: 'github', key: 'acme/canvas#31', title: 'Group buttons are mouse-only', url: 'https://github.com/acme/canvas/issues/31', state: 'todo', remoteState: 'open', createdAt: Date.now() - 3600000, updatedAt: Date.now() - 3600000 }
      ],
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
    // M133. The template the workflow panel projects: a scan, a pool of six
    // over a shared list, a judge, and a collect — one of each M132 block
    // beside an ordinary terminal, so the diagram shows the vocabulary.
    templates: [{
      id: 'tpl-sweep', name: 'nightly sweep', description: 'scan, work the list six at a time, judge, collect',
      nodes: [
        { key: 'scan', kind: 'terminal', cwd: REPO, command: '/bin/sh', args: ['-c', 'rg -n TODO src > todo.txt'], title: 'scan', dx: 0, dy: 0 },
        { key: 'workers', kind: 'pool', cwd: REPO, width: 6, list: join(REPO, 'todo.txt'), prompt: 'Fix this TODO and report what you changed.', dx: 280, dy: 0 },
        { key: 'judge', kind: 'orchestrator', cwd: REPO, prompt: 'Read every worker\'s report and reject anything untested.', dx: 0, dy: 170 },
        { key: 'report', kind: 'collect', cwd: REPO, target: join(REPO, 'FINDINGS.md'), dx: 280, dy: 170 }
      ],
      edges: [
        { from: 'scan', to: 'workers', trigger: 'exit-ok' },
        { from: 'workers', to: 'judge', trigger: 'idle' },
        { from: 'judge', to: 'report', trigger: 'idle' }
      ]
    }],
    // M100/M101. The roster and a routine: ada may work in the repo and spend
    // GitHub; her nightly routine last ran an hour ago at a ten-minute interval,
    // so arming marks it MISSED — the row must say so with the time.
    teammates: [
      { id: 'ada', name: 'ada', brief: 'You review pull requests for the api repository and never merge them yourself.', places: [REPO], services: ['github'], skills: [], memory: 'ada', chats: [], messaging: false, scheduling: true },
      { id: 'bo', name: 'bo', brief: '', places: [], services: [], skills: [], memory: 'bo', chats: [], messaging: true, scheduling: false }
    ],
    routines: [
      { id: 'nightly', name: 'nightly review', teammateId: 'ada', everyMs: 600000, prompt: 'Summarise what changed in the repository since the last run and list anything that looks unfinished.', plan: 'focus chat', paused: false, lastRun: { at: clockAt(6, 6), outcome: 'started', panelId: 'chat' }, missed: { at: clockAt(6, 16) } },
      { id: 'weekly', name: 'weekly tidy', teammateId: 'ada', everyMs: 3600000, prompt: 'Draft a tidy-up plan.', paused: true }
    ],
    worktrees: [
      { id: 'wt-a', root: REPO_ROOT, path: WT_A, branch: 'tc/api-20260904-1100', createdAt: Date.now() - 3600000, panelId: 'live' },
      { id: 'wt-b', root: REPO_ROOT, path: WT_B, branch: 'tc/tests-20260904-1102', createdAt: Date.now() - 3000000, panelId: 'dormant' }
    ],
    // M127. One PLACED column, so the pane shows all three placements at
    // once: the user's own arrangement first, then the derived `documents`
    // plugin and `user`/`project` scope columns, then Ungrouped last and
    // always. A shelf seeded with nothing would paint only derived columns,
    // and the ordering rule the scene exists to judge would be invisible.
    shelf: { columns: [{ id: 'col-milestone', title: 'starting a milestone', keys: [skillKey('project', 'brainstorming'), skillKey('project', 'writing-plans'), skillKey('project', 'test-driven-development')] }] },
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
  // M341. The start sheet's setup line, read for real over the fixture
  // repository. INERT_KIT's setupRead answers `not-a-repo` — a false claim —
  // so until this the `start-work` scene printed "Setup: not a repository"
  // under the repository field that named one.
  const shotSetup = createRepoSetupStore({
    dir: join(mkdtempSync(join(tmpdir(), 'tc shot setup ')), 'repo-setup'),
    mainRootOf: async (cwd) => { const a = await reviewEngine.resolveRepo(cwd); return a.kind === 'root' ? reviewEngine.commonRootOf(a.root) : null },
    lanesOf: (root) => layoutStore.worktrees().filter((w) => w.root === root).map((w) => w.path),
    loginEnv: () => loginEnv
  })
  const shotKit = { ...INERT_KIT, setupRead: (cwd) => shotSetup.read(cwd) }
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
  // M300. The shot run's own run ledger, in a temp dir — never the real
  // userData — so a scene can write the rows its tab is meant to show.
  const shotLedger = createRunLedger({ file: join(mkdtempSync(join(tmpdir(), 'tc shot ledger ')), 'ledger.jsonl') })
  // M336–M338. The account, the org the share dialog reads, and the relay —
  // OFF for every scene until the last three turn them on, so no earlier
  // golden grows an avatar in its top bar. Nothing here reaches a network:
  // sign-in, use and every relay write are refused or recorded by name.
  const SHOT_ORG = { id: '11111111-1111-1111-1111-111111111111', name: 'Acme' }
  const SHOT_ME = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const shotAccount = {
    on: false,
    sessions: [
      { githubId: '101', githubLogin: 'ada-lovelace', userId: SHOT_ME, expiresAt: '2099-01-01T00:00:00.000Z', addedAt: '2026-09-01T00:00:00.000Z' },
      { githubId: '202', githubLogin: 'octocat', userId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', expiresAt: '2099-01-01T00:00:00.000Z', addedAt: '2026-08-01T00:00:00.000Z' }
    ]
  }
  const HARNESS_NO = 'the screenshot harness does not sign in'
  const shotAccountDoors = {
    login: async () => ({ kind: 'refused', reason: HARNESS_NO }),
    logout: async () => ({ kind: 'refused', reason: HARNESS_NO }),
    sessions: () => (shotAccount.on ? shotAccount.sessions : []),
    use: () => ({ kind: 'refused', reason: HARNESS_NO }),
    status: () => (shotAccount.on ? { configured: true } : { configured: false, reason: 'accounts are off in the harness' })
  }
  // M345. A SHARED workspace, from the owner's seat — off until the last two
  // scenes turn it on, like the account above. sam is a teammate on another
  // Mac: two placeholders on the canvas (a relay terminal with a session, so
  // it offers Attach, and a terminal), a peer in the presence roster (named,
  // coloured, with a live cursor), and a member in the share's Members list.
  // Nothing here opens a doc or reaches a network: the view and the roster
  // are what main's canvas-sync and presence hub WOULD push, sent as those
  // pushes (the rule the working Orchestrate scene follows for agent:state).
  const SHOT_SHARE = '5ca1ab1e-0000-4000-8000-000000000345'
  const SHOT_SAM = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  const shotShared = { on: false, view: null, roster: null }
  const shotSharedMembers = [
    { userId: SHOT_ME, login: 'ada-lovelace', role: 'owner', me: true },
    { userId: SHOT_SAM, login: 'sam', role: 'editor', me: false },
    { userId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', login: 'lin', role: 'viewer', me: false },
    { userId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', login: 'octocat', role: null, me: false }
  ]
  const shotPresence = {
    ...INERT_PRESENCE,
    team: async () => (shotAccount.on
      ? { kind: 'ok', me: SHOT_ME, org: SHOT_ORG, orgs: [SHOT_ORG, { id: '33333333-3333-3333-3333-333333333333', name: 'ada-lovelace' }], members: [], presence: [], activity: [] }
      : { kind: 'refused', reason: 'the Team view is not wired in this build' }),
    rosters: () => (shotShared.on && shotShared.roster !== null ? [shotShared.roster] : []),
    canvasView: () => (shotShared.on ? shotShared.view : null),
    shareMembers: async (shareId) => (shotShared.on && shareId === SHOT_SHARE
      ? { kind: 'ok', orgId: SHOT_ORG.id, members: shotSharedMembers }
      : { kind: 'refused', reason: 'this share is not in the harness' }),
    setShareMember: async () => ({ kind: 'refused', reason: 'the screenshot harness does not change roles' })
  }
  const SHOT_RELAY_SESSION = 'shotRelaySession0001'
  const SHOT_RELAY_SCREEN = 'ada@relay:~$ uptime\r\n 14:02:11 up 12 days,  3:41,  2 users,  load average: 0.08, 0.12, 0.09\r\nada@relay:~$ ls deploy\r\nCaddyfile  relay.env.example  setup.sh  tc-relay.service\r\nada@relay:~$ '
  const shotRelayPanels = new Set()
  const shotRelayView = (panelId) => ({
    panelId, sessionId: SHOT_RELAY_SESSION, connection: 'open', userId: SHOT_ME, role: 'owner',
    control: { sessionId: SHOT_RELAY_SESSION, ownerId: SHOT_ME, controllerId: SHOT_ME, requests: [], peers: [{ userId: SHOT_ME, sockets: 1 }], cols: 96, rows: 24 },
    canType: true, canRequest: true, program: 'shell', exited: false, reason: null
  })
  const shotRelayArrive = (panelId) => {
    shotRelayPanels.add(panelId)
    setTimeout(() => {
      wc.send(SHOT_EVENTS.RELAY_STATE, shotRelayView(panelId))
      wc.send(SHOT_EVENTS.RELAY_DATA, { panelId, data: new Uint8Array(Buffer.from(SHOT_RELAY_SCREEN)), reset: true })
    }, 50)
    return { kind: 'ok', sessionId: SHOT_RELAY_SESSION }
  }
  const shotRelay = {
    spawn: async (panelId) => shotRelayArrive(panelId),
    attach: async (panelId) => shotRelayArrive(panelId),
    detach: (panelId) => { shotRelayPanels.delete(panelId) },
    input: () => false, resize: () => {}, control: () => {}, kill: () => {},
    list: async () => (shotAccount.on ? { kind: 'ok', sessions: [] } : { kind: 'refused', reason: 'the relay is not wired in this build' }),
    view: (panelId) => (shotRelayPanels.has(panelId) ? shotRelayView(panelId) : null),
    replay: (panelId) => { if (shotRelayPanels.has(panelId)) wc.send(SHOT_EVENTS.RELAY_DATA, { panelId, data: new Uint8Array(Buffer.from(SHOT_RELAY_SCREEN)), reset: true }) }
  }
  registerIpcHandlers(
    ptyManager, layoutStore,
    () => { const b = backend(); return { kind: b.kind, reason: b.reason } },
    {
      list: () => [{ id: 'shell', name: 'Login shell', available: true, builtIn: true, isDefault: true, subtitle: '~', cwd: '~' }, { id: 'claude', name: 'Claude', available: true, builtIn: true, isDefault: false, subtitle: '~', cwd: '~', agent: 'claude-code' }],
      rename: () => false, remove: () => false, setDefault: () => {},
      spawn: () => null, markPresetReviewed: () => false, savePanel: () => {}, requestReset: () => {}, listPrompts: () => [], savePrompt: () => {}, removePrompt: () => false,
      // M142/M149. The ledger's week rows: nothing closed in a fixture canvas — the answered arm, never the reading one.
      ledgerUsage: () => Promise.resolve([]),
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
      // M181. The real readers over the harness's own userData (the M85 rule).
      imageRead: (path) => readImage(path),
      starterPrepare: () => prepareStarter(join(app.getPath('userData'), 'starter')),
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
      saveTemplate: (t, expectedRevision) => layoutStore.saveTemplate({ ...t, id: t.id || `tpl-${Date.now().toString(36)}` }, expectedRevision),
      removeTemplate: (id) => (isBuiltInTemplate(id) ? false : layoutStore.deleteTemplate(id)),
      spawnWith: () => ({ kind: 'refused', reason: 'shot harness' }), recentDirectories: () => layoutStore.recentDirectories(), recentDirectoryUsed: () => layoutStore.recentDirectoryUsed(),
      // M127. The shelf, through the store and main's OWN parser. Without
      // these two the renderer's boot-time `shelf.list()` rejects, the pane
      // paints its `unavailable` sentence, and every scene under it is a
      // picture of a shelf that failed to load rather than one that is empty
      // — the harness-fake lesson `verify:panels` paid a fix round for.
      shelf: () => layoutStore.shelf(),
      saveShelf: (shelf) => layoutStore.saveShelf(parseShelf(shelf, []))
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
      search: async (panelIds, query) => ({ hits: (await scrollbackLog.search(panelIds, query, { maxHits: 50, maxPerPanel: 5 })).map((h) => ({ ...h, kind: 'scrollback' })), capped: false, cap: 50, redacted: 0 })
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
    createBrowserHandlers({ guestOf: (id) => webContents.fromId(id) ?? null }),
    // M114. No scene dispatches; a lane asked for is a named refusal.
    { lane: async () => ({ kind: 'refused', reason: 'no lane in the shot harness' }), laneStatus: async () => ({ kind: 'lane', base: 'main', ahead: 2, behind: 0 }), openPr: async () => ({ kind: 'refused', reason: 'no PR door in the shot harness' }), commentPr: async () => ({ kind: 'refused', reason: 'no PR door in the shot harness' }),
      // M197. The start sheet's repository field, answered from the fixture
      // roster: ada's one place is the fixture repository, and bo has none —
      // the two arms the sheet's agent field renders. No walk happens here;
      // the shape is what the real lister would have returned, the rule the
      // plugin fixture below already follows.
      repositories: async (req) => (req.teammateId === 'ada'
        ? { kind: 'repos', repos: [{ path: REPO, repo: 'acme/api' }, { path: join(FIX, 'notes'), repo: null }] }
        : { kind: 'no-places', reason: 'bo has no places — add a folder in the Teammates pane before it can work anywhere' }) },
    // M127. No scene spawns the real CLI, so this is the ANSWER that CLI
    // would have given for the fixture plugin planted under the fenced home —
    // the shape `listPlugins` returns, never the walk itself, which is still
    // `toolbox-read.ts`'s over the real `installPath`.
    async () => ({ kind: 'ok', plugins: [{ id: PLUGIN_ID, installPath: PLUGIN_ROOT, enabled: true }] }),
    // M129. The details TEXT is a second call the skill panel makes and no
    // scene opens, so it stays the `unknown` an uninstalled `claude` produces.
    async (id) => ({ kind: 'unknown', why: `no plugin details for ${id} in the shot harness` }),
    // M129. Inert writers: a screenshot harness must never edit a skill file.
    {
      write: async () => ({ kind: 'refused', reason: 'the screenshot harness does not write' }),
      create: async () => ({ kind: 'refused', reason: 'the screenshot harness does not write' }),
      rename: async () => ({ kind: 'refused', reason: 'the screenshot harness does not write' }),
      remove: async () => ({ kind: 'refused', reason: 'the screenshot harness does not write' })
    },
    // M130. The REAL trail read over the fixture transcript above, so the
    // `trail` scene paints what the app paints.
    async (panelId) => (panelId === 'trail'
      ? trailFor({
        backend: 'claude',
        panelId,
        pinnedSession: () => 'shot-trail-session',
        resolveTranscript: () => TRAIL_LOG,
        readDelta: (path, from) => {
          let size
          try { size = statSync(path).size } catch { return undefined }
          const len = Math.max(0, size - from)
          const bytes = Buffer.alloc(len)
          if (len > 0) {
            const fd = openSync(path, 'r')
            try { readSync(fd, bytes, 0, len, from) } finally { closeSync(fd) }
          }
          return { bytes, size }
        }
      })
      : { kind: 'unreadable', why: 'only the trail scene has a transcript here' }),
    // M123. No harness reaches the network: the third state, by name.
    { check: async () => ({ kind: 'could-not-check', reason: 'no network in the harness' }) },
    // Positions 28–35 (preview … publisher) take their defaults. The counts
    // in this tail matter: the parameter list is POSITIONAL (src/main/CLAUDE.md
    // rule 3). Until M340 the two ledger functions below sat HERE, at 28/29,
    // so `preview` and `assets` received functions and the ledger doors kept
    // their empty defaults — every Artifacts and Timeline shot from M300 to
    // M338 photographed an unwired record.
    ...Array(8).fill(undefined),
    // M300. The durable record, so the Artifacts and Timeline tabs photograph
    // what they actually show rather than "the record could not be read". The
    // rows are the SCENE's own, written by the scene that needs them; an
    // unwired door here would have made every shot of those two tabs a
    // picture of an unwired build. Positions 36/37: ledgerTimeline, ledgerEvent.
    (filter, limit) => shotLedger.timeline(filter, limit),
    async (row) => { try { await shotLedger.append(row); return true } catch { return false } },
    // Position 38 (checkOutput) takes its default; 39 is the kit (M341, the
    // real setup read above); 40–42 (lastExit, jobs, tasks) take their
    // defaults, so the three below land at 43–45.
    undefined,
    shotKit,
    ...Array(3).fill(undefined),
    // M336–M338. See shotAccount above.
    shotAccountDoors,
    shotPresence,
    shotRelay
  )
  wc.on('did-finish-load', () => { ptyManager.resendStates() })
  wc.on('console-message', (_e, level, message) => { if (level >= 2) console.log('[renderer]', String(message).slice(0, 200)) })

  // ---------------------------------------------------------------------
  // The kit every scene drives the renderer through.
  // ---------------------------------------------------------------------
  const js = (code) => wc.executeJavaScript(code)
  const kit = {
    js,
    // M345. The shared-workspace scenes turn the share on through these.
    shared: { state: shotShared, store: layoutStore, share: SHOT_SHARE, sam: SHOT_SAM, org: SHOT_ORG, me: SHOT_ME, events: SHOT_EVENTS },
    // M149. The window's webContents, for the scenes that set a REAL
    // condition through the DevTools protocol (media, device scale).
    wc,
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
    // M106. The Workspace menu's Flip, sent the way main sends it (the harness is main here).
    flip: async () => { win.webContents.send(SHOT_EVENTS.CANVAS_FLIP); await sleep(500) },
    // Enter on the palette's INPUT: a window-level keydown never reaches the
    // palette's handler (the panels suite learned this first).
    enter: () => js(`(() => { const i = document.querySelector('.palette__input'); if (!i) return false; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return true })()`),
    click: (sel) => js(`(() => { const b = document.querySelector(${JSON.stringify(sel)}); if (!b) return false; b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); return true })()`),
    theme: async (name) => { await js(`window.canvas.settings.set('appearance.theme', ${JSON.stringify(name)})`); await sleep(700) },
    // The first real layout: the launcher scene runs on an EMPTY store, so
    // the fixture layout is written to disk first and loaded here, once.
    // M181. An EMPTY canvas with no starter record — the first run the
    // starter scene begins from. Saved through the store's own path (absent
    // stays absent), then reloaded the way loadMain reloads.
    // M336–M338. The harness's account switch, for the three scenes after the starter.
    accountOn: () => { shotAccount.on = true; wc.send(SHOT_EVENTS.AUTH_CHANGED, shotAccount.sessions) },
    emptyCanvas: async () => {
      layoutStore.save({ panels: [], groups: [], camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null, bookmarks: [], runs: [] })
      const loaded = new Promise((resolve) => wc.once('did-finish-load', resolve))
      wc.reload(); await loaded
      await sleep(1200)
      await js(`window.__m56ReducedMotion(true)`)
    },
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
    // M162. The content is pinned to `h - 32` (the title bar's height: a
    // setSize after creation is never clamped, and the resized goldens are
    // 900 → 868, 760 → 728) so a resized scene is as immune to the work-area
    // clamp as the first window is (the Act 0 critic). The FIRST window's 865
    // is a clamped 897 minus the same 32.
    resize: async (w, h) => { win.setSize(w, h); win.setContentSize(w, h - 32); await sleep(900) }
  }

  // M148. A renderer error is PRINTED with its scene: a scene that fails
  // with `Script failed to execute` says nothing about why, and the only
  // place the why lives is the renderer's console.
  win.webContents.on('console-message', (_e, level, message) => { if (level >= 2) console.log(`[renderer] ${String(message).slice(0, 300)}`) })
  await loadRenderer(win)
  await sleep(1500)

  const manifest = []
  // SHOT_ONLY=a,b narrows the run to the named scenes, in SCENES order — for
  // iterating on one surface. Scenes share a window and some lean on the one
  // before (orchestration-dark needs orchestration to have opened the page), so
  // name the pair; a filter matching nothing is an error, not an empty success.
  const only = (process.env.SHOT_ONLY || '').split(',').map((s) => s.trim()).filter(Boolean)
  if (only.length > 0 && !SCENES.some((s) => only.includes(s.name))) throw new Error(`SHOT_ONLY matched no scene: ${only.join(', ')}`)
  for (const scene of SCENES) {
    if (only.length > 0 && !only.includes(scene.name)) continue
    if (scene.size) await kit.resize(scene.size[0], scene.size[1])
    try {
      await scene.run(kit)
      manifest.push({ file: `${scene.name}.png`, intent: scene.intent, ...(scene.reference ? { reference: scene.reference } : {}) })
    } catch (error) {
      console.log(`scene ${scene.name} failed: ${error && error.message || error}`)
      manifest.push({ file: `${scene.name}.png`, intent: scene.intent, ...(scene.reference ? { reference: scene.reference } : {}), failed: String(error && error.message || error) })
    }
  }
  writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2))
  console.log(`wrote ${join(OUT, 'manifest.json')} (${manifest.length} scenes)`)
  // M297. A scene that names a `reference` (the art-direction PNG it is
  // meant to read as) also gets <scene>.vs-reference.png: reference over
  // golden-beside-capture, labelled, one image — so the critic handed this
  // directory is handed the comparison, not reminded to make it. Plain node
  // (scripts/shot-composite.cjs), so it can be re-run on an old shot dir
  // without Electron. A composite that cannot be written is printed, not
  // thrown: the captures are the primary output and must still be cleaned
  // up and reported.
  try {
    for (const p of composeManifest(OUT, manifest)) console.log(`wrote ${p}`)
  } catch (error) {
    console.log(`reference composite failed: ${error && error.message || error}`)
  }

  ptyManager.killAll()
  for (const p of [FIX, scrollbackDir, SHOT_HOME]) { try { if (existsSync(p)) rmSync(p, { recursive: true, force: true }) } catch { /* best effort */ } }
  app.quit()
}).catch((error) => {
  // A THROW IN A REAL-ELECTRON HARNESS HANGS WITHOUT THIS. `app.whenReady()
  // .then(async () => ...)` with no catch turns any throw into an unhandled
  // rejection: nothing calls app.exit, the hidden window stays open, and the
  // suite reads as a suite that is still running. CLAUDE.md names that shape
  // directly — "the trap manifests as a HANG, not a red suite" — and a chain
  // of ~40 suites that stops dead with no message is the most expensive
  // failure this harness can produce, because it does not even say which
  // suite stopped. Print the error, name the script, exit non-zero.
  console.log(`\n${SCRIPT_NAME} threw before it could report: ${(error && error.stack) || error}`)
  app.exit(1)
})
