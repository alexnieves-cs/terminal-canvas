# OSS Beta Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take `terminal-canvas` from a private, undocumented-for-outsiders repository to a public, licensed, CI-verified `v0.1.0-beta` that a stranger can understand in sixty seconds, build in one command, and download as a working `.app`.

**Architecture:** No product code changes. Every gap here is licensing, presentation or release plumbing, and each one is closed the way this repo closes everything else — as a check in a suite. A new plain-node suite, `verify:meta`, is created in Task 1 and grows through the plan, so "the README still documents every IPC channel" and "a LICENSE exists" become facts `npm run verify` enforces rather than facts a human remembers. The one thing that cannot be automated (screenshots, an icon source, flipping the repository public) is isolated into explicitly human-gated tasks at the end.

**Tech Stack:** Node 20, plain CJS verify suites (no runner, no linter), GitHub Actions on `macos-latest`, electron-builder. No new runtime dependency and no new devDependency — `verify:meta` is import-free plain CJS like `build/builder-config.cjs`.

**Spec:** None separate. This plan is its own spec; the `## Findings` section below is the audit it argues from, captured against `main` at `ac35041` on 2026-08-29. Read it before Task 1.

---

## Findings

Audited against `main` at commit `ac35041` (M9c done; M10 in flight in a worktree). Every item below was verified, not assumed.

**What is already good, and must not be broken:**

- `main` typechecks clean (both projects) and the 17 verify suites are the quality story.
- ~17,200 lines of source in `src/`, ~17,400 lines of verification in `scripts/`. That near-1:1 ratio is the repository's single strongest signal and the README currently does not mention it.
- No secrets, no credentials, no hardcoded personal paths in shipped code. The only `/Users/...` strings in `scripts/` are test fixtures (`/Users/x/proj`), which are fine.
- Zero `TODO`/`FIXME`/`HACK` markers in `src/`.

**Blocking gaps (repository cannot go public as-is):**

1. **No `LICENSE` file.** `package.json` declares `"license": "MIT"` but no license text exists anywhere in the tree. Without the file GitHub reports no license and the work is legally all-rights-reserved — nobody may use it. Task 1.
2. **`.claude/settings.json` is tracked** and contains the author's absolute home path (`/Users/alexnieves/.claude/plugins/cache/...`) plus nine ad-hoc permission entries that are one-off debugging detritus, including two `perl -0pi -e` commands that mutate `src/renderer/palette/Palette.tsx`. Task 2.
3. **The README is written for the implementer, not a visitor.** Its headings are Stack, Prerequisites, Getting started, Architecture, Things that are non-obvious, Milestones. There is no statement of what the application does from a user's point of view, no feature list, no keyboard reference, and no image. For a project whose premise is visual this is the largest single gap. Tasks 3 and 9.
4. **The README's architecture section is stale.** It documents roughly 20 IPC channels; `src/shared/ipc-contract.ts` on `main` declares **31 invoke channels and 12 events**. Missing entirely: the five `workspace:*` invokes, `preset:save-panel`, and all five `review:*` channels. The architecture diagram is the first technical claim a reader checks. Task 4.

**Should-have gaps (a beta is not credible without them):**

5. **No CI.** ~640 checks exist and nothing runs them automatically. This is the highest-leverage single addition in the plan: it converts a claim into a badge. Task 5.
6. **No community files** — no `CONTRIBUTING.md`, no `SECURITY.md`, no issue or PR templates. Task 6.
7. **No `engines` field.** The README says Node 20+; nothing enforces it. Task 1.
8. **No application icon.** `build/` holds only `builder-config.cjs`; electron-builder looks for `build/icon.icns`, so the packaged app ships the default Electron icon. Task 7.
9. **Distribution is undocumented.** `npm run package` produces a deliberately **unsigned** `.app`/`.dmg` (`identity: null` in `build/builder-config.cjs`, by decision). Every downloader hits Gatekeeper's unidentified-developer block and concludes the app is broken. Task 9.
10. **`CLAUDE.md` is 2,605 lines / ~43,000 words against a 338-line README** — the contributor document is eight times the visitor document, and at the repository root it reads as agent configuration rather than as the engineering-decisions log it actually is. Task 8 reframes it in place rather than moving it, because moving it risks the repository's own working setup for a cosmetic gain.

**Also true, and out of scope for this plan:** `main` is currently 9 commits ahead of `origin/main`. Pushing is Task 9's business and is a human decision.

## Global Constraints

- **Work from `main`, in a dedicated worktree.** A parallel session is actively developing `m10-visual-system` in `.claude/worktrees/m10-visual-system`. Do not touch that worktree, that branch, or any `src/` file it owns. This plan changes no product code, so there is no legitimate reason to edit anything under `src/`.
- **`npm run verify` must be green at the end of every task.** No exceptions. If a task cannot leave it green, the task is not finished.
- **Never hardcode a count this repository can derive.** Check totals, LOC figures and channel lists go stale — `CLAUDE.md` documents its own prose going stale as a recurring hazard. Where a number must appear in prose, derive it with a command in the same step and paste the real output. Where a list must appear, add a `verify:meta` check that compares it to the source of truth.
- **Commits are conventional and scoped `oss`:** `feat(oss): …`, `docs(oss): …`, `ci(oss): …`, `chore(oss): …`, `test(oss): …`. Milestone scopes (`m9c`, `m10`) belong to other work.
- **No new npm dependency, runtime or dev.** `verify-meta.cjs` is import-free plain CJS beyond Node built-ins (`node:fs`, `node:path`, `node:child_process`).
- **Do not delete or rewrite `CLAUDE.md`'s body, and do not restructure `README.md`'s `### Things that are non-obvious` section.** Both are load-bearing prose that took milestones to accumulate. This plan adds around them.
- **Tasks 7 and 9 require a human.** They are marked. An agent must stop at their gate rather than improvise an icon or publish a release.
- **Author and year for all licensing text:** `Alex Nieves`, `2026`.
- **Run every suite with `TC_VERIFY_SUFFIX` set.** This plan is executed in a worktree alongside at least one other active worktree, and `verify:pty-manager`, `verify:panels` and `verify:packaged` all call `shutdown()` — `kill-server` — on a tmux socket. `scripts/verify-socket.cjs` exists for exactly this case; see Task 0.
- **`package.json`'s `"verify"` chain WILL conflict at merge, and that is expected.** The parallel `m10-visual-system` branch prepends `npm run verify:styles && ` to the same line this plan prepends `npm run verify:meta && ` to. The resolution is to keep both, never to pick one side. See Task 0's closing note.

## File Structure

**Created:**

| Path | Responsibility |
|---|---|
| `scripts/verify-meta.cjs` | The release-hygiene suite. Asserts licensing, packaging metadata, README structure and README/IPC agreement as values read off disk. Plain node, import-free, cheapest tier — runs first in the chain. |
| `LICENSE` | MIT, matching `package.json`'s declared license. |
| `CONTRIBUTING.md` | How to build, how to verify, what a check is expected to look like. |
| `SECURITY.md` | Where to report a vulnerability, and the app's threat posture (it runs arbitrary local commands by design). |
| `.github/workflows/verify.yml` | CI: typecheck, build, and every verify suite on `macos-latest`. |
| `.github/ISSUE_TEMPLATE/bug_report.md` | Bug template carrying the fields that actually matter here (backend, tmux presence, packaged vs dev). |
| `.github/ISSUE_TEMPLATE/feature_request.md` | Feature template pointing at `docs/ideas-backlog.md`. |
| `.github/pull_request_template.md` | PR template whose one required box is "`npm run verify` is green". |
| `docs/assets/` | Screenshot and icon-source home. Populated by a human in Tasks 7 and 9. |

**Modified:**

| Path | Change |
|---|---|
| `package.json` | `engines`, `repository`, `bugs`, `homepage`; `verify:meta` script; `verify:meta` added to the head of the `verify` chain. |
| `.gitignore` | Stop tracking `.claude/settings.json`. |
| `README.md` | New visitor-facing top half; corrected architecture channel lists; verification section; contributing and license sections. |
| `build/builder-config.cjs` | `mac.icon` pointing at `build/icon.icns`. |
| `scripts/verify-package.cjs` | One check that the icon is configured. |
| `CLAUDE.md` | A short framing preamble; the `verify:meta` row in the suite table. |

**Check numbering.** `verify:meta` is new, so it numbers from 1. `verify:package`'s last check today is 10, so Task 7 adds 11.

| Suite | Last today | This plan adds |
|---|---|---|
| `verify:meta` | — (new) | 1–18 |
| `verify:package` | 10 | 11 |

---

### Task 0: The worktree, and isolating it from the parallel session

**Files:** none committed. This task creates the workspace the other nine run in.

**Interfaces:**
- Produces: an isolated checkout on branch `oss-beta`, and the environment variable `TC_VERIFY_SUFFIX=oss` under which every later task's `npm run verify` must run.

At least one other worktree (`m10-visual-system`) is active on this machine, and `main` is moving under both — it advanced twice during the audit that produced this plan. Two things must be true before Task 1 starts: this work must not share a branch with anything else, and its verify runs must not reach into another checkout's tmux sessions.

The second one is not hypothetical. `verify:pty-manager`, `verify:panels` and `verify:packaged` each end by calling `shutdown()`, which is `tmux kill-server`. Two checkouts verifying at the same moment on the same socket kill each other's sessions mid-run, and `scripts/verify-socket.cjs` says why that is worse than an ordinary conflict: *"the loser gets a red check in whichever suite happened to be mid-run, in a branch that is fine, pointing at code that is correct. Re-running makes it go away."*

- [ ] **Step 1: Branch from the current `main`, in its own worktree**

```bash
git -C /Users/alexnieves/Documents/terminal-canvas fetch origin
git -C /Users/alexnieves/Documents/terminal-canvas worktree add \
  .claude/worktrees/oss-beta -b oss-beta main
cd /Users/alexnieves/Documents/terminal-canvas/.claude/worktrees/oss-beta
```

`.claude/` is gitignored, so the worktree itself is never committed. Branch from `main`, not from the current checkout's HEAD, which may be another milestone's branch.

- [ ] **Step 2: Give the worktree a node_modules**

The verify suites invoke the Electron binary by path (`node_modules/electron/dist/...`) and `node-pty` is compiled natively, so an empty worktree cannot run anything. Sharing the parent's is faster than a fresh install and was confirmed working:

```bash
ln -s /Users/alexnieves/Documents/terminal-canvas/node_modules node_modules
node -e "require('electron'); console.log('electron resolves')"
```

Nothing in this plan changes `dependencies` or `devDependencies`, so a shared tree is safe. **Do not run `npm install` or `npm ci` in this worktree** — through the symlink it would rewrite the parent's `node_modules` under the other session. If a real install is ever needed, remove the symlink and run `npm ci` for a private copy.

- [ ] **Step 3: Isolate the tmux sockets**

```bash
export TC_VERIFY_SUFFIX=oss
```

This must be set in **every shell** that runs a verify suite for the rest of the plan. It appends `-oss` to each suite's socket name, leaving the other worktree — which sets nothing and therefore uses the historic names — completely undisturbed.

- [ ] **Step 4: Prove the isolation before trusting it**

```bash
npm run verify:pty-manager 2>&1 | grep -iE "socket|passed" | head
```

Expected: the run reports a socket ending in `-oss`, and finishes green. If the socket name has **no** `-oss` suffix, the export did not reach this process — fix that before running anything else, or the first full `npm run verify` will kill the other session's tmux sessions.

- [ ] **Step 5: Establish the baseline**

```bash
npm run verify
```

Expected: every suite green. This is the "before" reading. If it is red **now**, the problem belongs to `main` and to another session, not to this plan — report it and stop rather than fixing product code here.

> **Closing note, for whoever merges.** The only conflict this plan is expected to produce is one line: `package.json`'s `"verify"` chain, where `m10-visual-system` prepends `npm run verify:styles && ` and this branch prepends `npm run verify:meta && `. Keep **both**, in either order — they are independent suites and the chain is ordered cheapest-first by convention, so `verify:meta && verify:styles && verify:viewport && …` is the natural resolution. Everything else this plan touches is either a new file or a region of `README.md` and `CLAUDE.md` that M10 does not edit. Rebase onto `main` immediately before merging — `main` moves fast — and re-run `npm run verify` after resolving, because a conflict resolution in the verify chain is exactly the kind that still parses and silently drops a suite.

---

### Task 1: `verify:meta`, the LICENSE, and package metadata

**Files:**
- Create: `scripts/verify-meta.cjs`
- Create: `LICENSE`
- Modify: `package.json`

**Interfaces:**
- Consumes: nothing.
- Produces: `scripts/verify-meta.cjs` with the `ok(label, pass, detail)` helper and the standard footer, plus the module-level constants `ROOT` (repository root as an absolute path) and `read(rel)` (returns file text or `null` if absent). Tasks 2–8 append checks to this file and reuse both. `npm run verify:meta` becomes the first link of the `verify` chain.

- [ ] **Step 1: Write the failing suite**

Create `scripts/verify-meta.cjs`. This is checks 1–6 only; later tasks append.

```js
/* Verifies the repository's RELEASE HYGIENE as values read off disk.
   Run with: npm run verify:meta

   Plain node, import-free beyond built-ins, no esbuild entry, no electron, no
   build — the same tier as verify:package, and first in the chain because it
   is the cheapest thing here that can be wrong.

   Everything this suite guards fails SILENTLY and LATE. A missing LICENSE does
   not break a build; it makes the work legally unusable, and the only symptom
   is a GitHub sidebar nobody on this side of the repository ever reads. A
   README that has drifted from the IPC contract does not fail a typecheck; it
   misleads the first engineer who trusts it. Prose has no compiler, so these
   are the compiler. */
'use strict'
const { readFileSync, existsSync } = require('node:fs')
const { join } = require('node:path')

const ROOT = join(__dirname, '..')
const read = (rel) => {
  const p = join(ROOT, rel)
  return existsSync(p) ? readFileSync(p, 'utf8') : null
}

const results = []
const ok = (n, pass, detail) => {
  results.push({ n, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${detail ? ' — ' + detail : ''}`)
}

const pkg = JSON.parse(read('package.json'))

// 1. THE ONE THAT MATTERS MOST. package.json has declared "license": "MIT"
// since the first commit, with no LICENSE file anywhere in the tree. A license
// FIELD is metadata; a license FILE is the grant. Without the file GitHub
// reports no license, and "no license" means all rights reserved — a public
// repository nobody may legally copy, build on, or contribute to.
{
  const text = read('LICENSE')
  ok('1 a LICENSE file exists and is not empty', text !== null && text.trim().length > 200,
    text === null ? 'absent' : `${text.length} bytes`)
}

// 2. The file and the field must AGREE. Two declarations of one fact drift the
// first time one of them is wrong, and a package.json saying MIT beside an
// Apache LICENSE is a question no downstream user can answer for themselves.
{
  const text = read('LICENSE') ?? ''
  ok('2 the LICENSE text matches the declared license',
    pkg.license === 'MIT' && /MIT License/i.test(text), `field=${pkg.license}`)
}

// 3. A licence with no copyright holder grants nothing to anyone. The year and
// the name are the operative clause, not the boilerplate around them.
{
  const text = read('LICENSE') ?? ''
  ok('3 the LICENSE names a holder and a year',
    /Alex Nieves/.test(text) && /20\d\d/.test(text))
}

// 4. The README says Node 20+ and nothing enforces it. node-pty is compiled
// natively against the local ABI at postinstall, so an unsupported Node does
// not fail with a version message — it fails inside node-gyp, several hundred
// lines deep, and reads as a broken repository rather than a wrong toolchain.
{
  const engines = pkg.engines ?? {}
  ok('4 package.json declares a Node engine floor',
    typeof engines.node === 'string' && /\d\d/.test(engines.node), JSON.stringify(engines))
}

// 5. `repository` is what makes `npm ls`, security advisories and every
// third-party mirror able to point back here. Absent, a published artifact is
// an orphan with no route home.
{
  const r = pkg.repository
  const url = typeof r === 'string' ? r : (r && r.url) || ''
  ok('5 package.json points at the repository',
    /github\.com[/:]alexnieves-cs\/terminal-canvas/.test(url), url || 'absent')
}

// 6. `private: true` stays. It is NOT a statement about the licence and must
// not be removed as though it were one: it is npm's guard against `npm
// publish`, and this is a desktop application that must never be published as
// a package. Asserted so a future reader does not "fix" it on the way past.
{
  ok('6 private stays true — an app, never an npm package', pkg.private === true)
}

console.log('\n' + '='.repeat(60))
const failed = results.filter((r) => !r.pass)
console.log(`${results.length - failed.length}/${results.length} passed`)
if (failed.length) console.log('FAILED: ' + failed.map((f) => f.n).join(', '))
process.exit(failed.length ? 1 : 0)
```

- [ ] **Step 2: Wire the script and run it to watch it fail**

Add to `package.json` `scripts`, immediately above `"verify:package"`:

```json
    "verify:meta": "node scripts/verify-meta.cjs",
```

Run: `npm run verify:meta`

Expected: **FAIL** on checks 1, 2, 3, 4 and 5. Check 6 passes (`private` is already `true`). Confirm you see `2/6 passed`-style output naming the failures before writing anything else. If checks 1–5 pass at this point, something is already on disk that should not be — stop and inspect.

- [ ] **Step 3: Write the LICENSE**

Create `LICENSE`:

```
MIT License

Copyright (c) 2026 Alex Nieves

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 4: Add the package metadata**

In `package.json`, immediately after the `"license": "MIT",` line, insert:

```json
  "repository": {
    "type": "git",
    "url": "git+https://github.com/alexnieves-cs/terminal-canvas.git"
  },
  "bugs": {
    "url": "https://github.com/alexnieves-cs/terminal-canvas/issues"
  },
  "homepage": "https://github.com/alexnieves-cs/terminal-canvas#readme",
  "engines": {
    "node": ">=20"
  },
```

Leave `"private": true` exactly as it is — check 6 asserts it, and its reason is in that check's comment.

- [ ] **Step 5: Run the suite to verify it passes**

Run: `npm run verify:meta`
Expected: `6/6 passed`

- [ ] **Step 6: Add `verify:meta` to the chain and run the whole thing**

In `package.json`, edit the aggregate `"verify"` script so that `npm run verify:meta && ` is the **first** link, before `npm run verify:viewport`. It is the cheapest suite in the repository and a licensing failure should be the first thing reported, not the last.

Run: `npm run verify`
Expected: every suite green, ending in `verify:panels`. This is the full chain including a build; allow several minutes.

- [ ] **Step 7: Commit**

```bash
git add LICENSE package.json scripts/verify-meta.cjs
git commit -m "feat(oss): the LICENSE the license field always claimed, and a suite that checks it"
```

---

### Task 2: Untrack the agent settings

**Files:**
- Modify: `.gitignore`
- Delete from the index (not from disk): `.claude/settings.json`
- Modify: `scripts/verify-meta.cjs`

**Interfaces:**
- Consumes: `ok`, `read`, `ROOT` from Task 1.
- Produces: check 7.

`.claude/settings.json` is tracked and carries the author's absolute home directory plus nine one-off permission grants accumulated during development — including `perl -0pi -e` invocations that rewrite `src/renderer/palette/Palette.tsx` in place. None of it is meaningful to a contributor, and the home path is gratuitous personal information in a public repository. The directory itself stays ignored-but-present so local agent configuration keeps working; only the tracking stops.

- [ ] **Step 1: Write the failing check**

Append to `scripts/verify-meta.cjs`, immediately before the `console.log('\n' + '='.repeat(60))` footer:

```js
// 7. .claude/settings.json was tracked until this check existed, carrying the
// author's absolute home path (/Users/<name>/.claude/plugins/cache/...) and
// nine ad-hoc permission grants from development sessions — including perl
// one-liners that rewrite Palette.tsx in place. It is local tool
// configuration, not source: it means nothing to a contributor, and the home
// path is personal information a public repository has no reason to carry.
// Asserted against `git ls-files` rather than the filesystem, because the file
// SHOULD still exist locally; what must not happen is it being tracked again.
{
  const { execFileSync } = require('node:child_process')
  let tracked = ''
  try {
    tracked = execFileSync('git', ['ls-files', '.claude/'], { cwd: ROOT, encoding: 'utf8' })
  } catch {
    // Not a git checkout (a downloaded tarball). Nothing to assert.
    tracked = ''
  }
  ok('7 no .claude/ file is tracked', tracked.trim() === '', tracked.trim() || 'none')
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run verify:meta`
Expected: **FAIL** on `7 no .claude/ file is tracked — .claude/settings.json`, with `6/7 passed`.

- [ ] **Step 3: Untrack the file and ignore the directory**

```bash
git rm --cached .claude/settings.json
```

The file stays on disk; only the index entry goes. Then in `.gitignore`, replace the existing `.claude/worktrees/` line with this block, keeping the surrounding comment style the repository already uses:

```
# Local Claude Code configuration and scratch. settings.json accumulates
# machine-specific permission grants with absolute home paths in them, and a
# worktree committed to the repository would put the whole tree in twice.
# Local tooling state, never source.
.claude/
```

- [ ] **Step 4: Run the suite to verify it passes**

Run: `npm run verify:meta`
Expected: `7/7 passed`

Then confirm the file survived locally — the point is to stop tracking it, not to lose it:

Run: `test -f .claude/settings.json && echo "still on disk"`
Expected: `still on disk`

- [ ] **Step 5: Commit**

```bash
git add .gitignore scripts/verify-meta.cjs
git commit -m "chore(oss): untrack local agent settings, and pin that they stay untracked"
```

---

### Task 3: The README a stranger reads

**Files:**
- Modify: `README.md`
- Modify: `scripts/verify-meta.cjs`

**Interfaces:**
- Consumes: `ok`, `read` from Task 1.
- Produces: checks 8–13, and the constant `REQUIRED_HEADINGS` (an array of exact heading strings) which Task 5 extends by one.

The README opens with a dependency list. A visitor needs, in this order: what this is, whether it runs on their machine, what it looks like, how to get it, and what the keys do. All of that is added **above** the existing `## Stack` section, and the licence and contributing pointers are added at the very bottom. **Nothing existing is deleted in this task** — `### Things that are non-obvious` in particular is milestones of accumulated reasoning and must survive untouched.

Screenshots are deliberately NOT referenced here. An image tag pointing at a file that does not exist renders as a broken image on GitHub, which is worse than no image. A human captures them in Task 9, which adds both the files and the tags together.

- [ ] **Step 1: Write the failing checks**

Append to `scripts/verify-meta.cjs`, before the footer:

```js
// 8–13. The README's STRUCTURE, asserted as a set of required headings.
//
// The failure this guards is not a typo — it is drift. Every milestone in this
// repository has added a feature and left the README's visitor-facing half
// alone, because the author already knows what the app does and the file that
// gets updated is the one that hurts when it is wrong. Nothing hurts when a
// README is missing a features list, so nothing ever fixed it. A check is the
// only thing that makes an absent section as loud as a failing build.
const README = read('README.md') ?? ''
const REQUIRED_HEADINGS = [
  '## What it does',
  '## Install',
  '## Keyboard',
  '## Verification',
  '## Contributing',
  '## License'
]
for (const [i, heading] of REQUIRED_HEADINGS.entries()) {
  ok(`${8 + i} README has "${heading}"`, README.includes('\n' + heading + '\n'))
}
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm run verify:meta`
Expected: **FAIL** on checks 8 through 13, all six. `7/13 passed`.

- [ ] **Step 3: Replace the README's opening**

Replace the current first five lines of `README.md` — the `# Terminal Canvas` title through the `Think Figma, but the objects are terminals.` line, stopping **before** the blank line preceding `## Stack` — with exactly this:

````markdown
# Terminal Canvas

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform: macOS](https://img.shields.io/badge/platform-macOS-lightgrey.svg)](#requirements)

An infinite canvas where every node is a live terminal running a coding-agent CLI.
Think Figma, but the objects are terminals — and the terminals are running `claude`,
`codex`, or anything else you would type into a shell.

> **Status: beta (`v0.1.0`).** macOS only, Apple Silicon by default. The app is
> unsigned, so Gatekeeper will object the first time you open it — see
> [Install](#install). It is used daily by its author and has not been used by
> anyone else, which is the entire reason it is now public.

## What it does

- **An infinite canvas of real terminals.** Pan, zoom, drag and resize panels in
  world space. Every panel is a genuine PTY — not a re-implementation, not a
  wrapper — so any TUI that works in Terminal works here.
- **More panels than a browser can afford.** Off-screen and over-budget panels
  demote to cheap cards while their processes keep running. A fixed budget of
  live WebGL terminals is what stops the twentieth panel taking down the
  nineteen before it.
- **Agents survive the window.** With `tmux` installed, panel processes outlive
  a `Cmd+R` reload, a closed window, and a quit — you come back to the agent
  mid-sentence rather than to a dead pane.
- **A canvas that says who needs you.** Each panel's border reports what its
  agent is doing — starting, working, idle, or waiting on you. Panels that want
  attention while off screen get an edge pip pointing at them, and `Cmd+J`
  flies to the next one.
- **Workspaces.** Named canvases you switch between without killing anything;
  the agents in the canvas you left keep working.
- **A command palette.** `Cmd+K` for panels, presets, saved prompts, settings
  and workspaces, with drill-in scopes and fuzzy matching.
- **A review layer.** Each panel is diffed against the snapshot taken when its
  agent started, so you can see what that agent — specifically that one —
  changed, and commit it without leaving the canvas.
- **Project prompts.** `.claude/commands/*.md` in a panel's working directory
  are read and offered as insertable prompts, in Claude Code's own format, so
  they version-control with the project rather than with this app.

## Install

### Download the beta

Grab the `.dmg` from [Releases](https://github.com/alexnieves-cs/terminal-canvas/releases),
open it, and drag **Terminal Canvas** to Applications.

The build is **unsigned** — signing requires a paid Apple Developer account, and
this is a beta. macOS will refuse the first launch with *"Terminal Canvas is
damaged"* or *"cannot be opened because the developer cannot be verified"*. To
get past it, either:

- **Right-click the app → Open**, then confirm in the dialog; or
- clear the quarantine flag:

  ```sh
  xattr -dr com.apple.quarantine /Applications/Terminal\ Canvas.app
  ```

Only do this because you have read the source or trust its author. That warning
exists for a reason and this app, by design, runs whatever commands you give it.

### Build from source

See [Getting started](#getting-started) below. It is three commands and needs no
Apple Developer account.

## Keyboard

Every canvas shortcut requires **Cmd**. That is deliberate: agent TUIs claim
essentially every bare key, so a bare keystroke always belongs to the terminal.

| Chord | Action |
|---|---|
| `Cmd+N` | New panel, from the default preset |
| `Cmd+K` | Command palette |
| `Cmd+J` | Jump to the next panel waiting on you |
| `Cmd+0` | Reset the camera |
| `Cmd+1` | Fit every panel on screen |
| `Cmd+=` / `Cmd+-` | Zoom in / out |
| `Cmd+\` | Toggle the side rail |
| `Cmd+Shift+\` | Toggle the inspector |
| `Cmd+C` / `Cmd+V` | Copy / paste in the focused terminal |
| `Cmd+Z` / `Cmd+Shift+Z` | Undo / redo a canvas gesture |
| **`Ctrl+C`, `Ctrl+Z`, `Ctrl+B`** | **Untouched — these reach the agent**, as SIGINT, SIGTSTP, and tmux's own prefix respectively |

Trackpad: two-finger drag pans, pinch zooms. A wheel over the focused panel
scrolls that terminal instead of the camera.
````

Everything from `## Stack` onward stays exactly where it is.

- [ ] **Step 4: Append the closing sections**

At the very end of `README.md`, after the `Unscheduled ideas …` paragraph that currently closes the file, append:

````markdown

## Verification

There is no unit-test runner and no linter here. `npm run verify` is the entire
quality signal: it chains every suite, runs a typecheck and a build in the
middle, and exits non-zero on any failure.

The suites are tiered by cost. Anything with no native dependency, no DOM and no
`electron` import runs under plain `node` in seconds — canvas math, the session
registry, the on-disk layout format, the palette's matching and ranking, the
tmux argv builders, the bell/idle state machine, the git review engine. That
tier is large on purpose, and it is why several modules take their dependencies
as parameters rather than importing them: `layout-store.ts` takes filesystem
paths instead of calling `app.getPath`, `presets.ts` takes `which` instead of
importing the login-shell probe, `review-engine.ts` takes a git runner instead
of spawning one. Everything that genuinely needs `node-pty` runs under the
Electron binary as Node; everything that needs real input against real pixels
opens a hidden Electron window.

To see the current suite list and check counts:

```sh
npm run verify
```

Individual suites are listed in [`package.json`](package.json) and described
check-by-check in [`CLAUDE.md`](CLAUDE.md).

## Contributing

Issues and pull requests are welcome. The one hard requirement is that
`npm run verify` is green — see [CONTRIBUTING.md](CONTRIBUTING.md) for what a
check is expected to look like and why nearly every one of them carries a
comment explaining the failure it guards.

## License

[MIT](LICENSE) © 2026 Alex Nieves
````

- [ ] **Step 5: Run the checks to verify they pass**

Run: `npm run verify:meta`
Expected: `13/13 passed`

- [ ] **Step 6: Read the rendered result before committing**

Open `README.md` and read it top to bottom as though you had never seen this repository. Confirm three things by eye, none of which a check can see: the anchor links `#install`, `#requirements` and `#getting-started` point at headings that actually exist; the table renders as a table; and no heading now appears twice.

`#requirements` is the one most likely to be wrong — the existing heading is `## Prerequisites`. If it is, fix the **badge link** to `#prerequisites` rather than renaming the heading, because renaming would break links from elsewhere.

- [ ] **Step 7: Commit**

```bash
git add README.md scripts/verify-meta.cjs
git commit -m "docs(oss): a README for someone who has never seen this, and checks that keep it"
```

---

### Task 4: The architecture section stops lying

**Files:**
- Modify: `README.md`
- Modify: `scripts/verify-meta.cjs`

**Interfaces:**
- Consumes: `ok`, `read` from Task 1.
- Produces: checks 14–15.

The README documents roughly twenty IPC channels. `src/shared/ipc-contract.ts` declares **31 invokes and 12 events**. Missing from the README: the five `workspace:*` invokes, `preset:save-panel`, and all five `review:*` channels. Rather than fix the list by hand and let it drift again next milestone, check 14 parses both files and asserts every declared channel appears in the README — so the next milestone that adds a channel gets a failing check instead of a quietly-wrong diagram.

Do not hardcode the channel list into this plan's check. Derive it.

- [ ] **Step 1: Write the failing checks**

Append to `scripts/verify-meta.cjs`, before the footer:

```js
// 14. The README's architecture diagram versus the ACTUAL contract.
//
// This is the check that pays for the suite. Every milestone since M7 has added
// channels and left the diagram alone, so it documented ~20 of 43 by the time
// anyone looked. A stale architecture diagram is worse than an absent one: it
// is the first technical claim a reader checks, and it fails by omission, which
// nothing else in this repository can see. Parsed out of ipc-contract.ts rather
// than restated here, so this check cannot itself go stale.
const CONTRACT = read('src/shared/ipc-contract.ts') ?? ''
const channels = [...CONTRACT.matchAll(/^\s+[A-Z_]+: '([a-z]+:[a-z-]+)'/gm)].map((m) => m[1])
{
  const missing = channels.filter((c) => !README.includes(c))
  ok('14 every IPC channel appears in the README',
    channels.length > 20 && missing.length === 0,
    missing.length ? `missing: ${missing.join(', ')}` : `${channels.length} channels`)
}

// 15. Non-vacuity guard for 14. If the regex above ever stops matching — a
// reformat of ipc-contract.ts, a rename, a prettier pass that moves the quotes
// — `channels` becomes an empty array and check 14 passes triumphantly while
// asserting nothing at all. This is the same shape as the `othersAreReal`
// clause in verify:panels 83: prove the input was real before trusting the
// conclusion drawn from it.
{
  ok('15 the contract parse found the channels it should',
    channels.includes('pty:create') && channels.includes('review:panel'),
    `${channels.length} parsed`)
}
```

- [ ] **Step 2: Run to verify check 14 fails**

Run: `npm run verify:meta`
Expected: **FAIL** on check 14, listing the missing channels by name — the five `workspace:*`, `preset:save-panel`, and the `review:*` set. Check 15 passes. `14/15 passed`.

Copy the failure's `missing:` list; Step 3 needs it.

- [ ] **Step 3: Derive the true channel lists**

Run these two commands and keep the output — this is what goes into the README, rather than anything typed from memory:

```sh
sed -n '/export const IPC = {/,/^}/p' src/shared/ipc-contract.ts | grep -oE "'[a-z]+:[a-z-]+'" | tr -d "'"
sed -n '/export const IPC_EVENTS = {/,/^}/p' src/shared/ipc-contract.ts | grep -oE "'[a-z]+:[a-z-]+'" | tr -d "'"
```

The first is renderer→main invokes; the second is main→renderer events.

- [ ] **Step 4: Rewrite the diagram**

In `README.md`'s `## Architecture` section, replace the fenced code block containing the `renderer  --invoke-->  …` diagram with a block built from Step 3's real output, grouped by prefix. Keep the existing shape and arrows so the section still reads the same way:

```
renderer  --invoke-->  pty:create / pty:write / pty:resize / pty:kill / pty:list   -->  main
                       layout:load / layout:save
                       session:backend
                       preset:list / preset:rename / preset:delete
                       preset:set-default / preset:spawn-by-id / preset:save-panel
                       prompt:list / prompt:save / prompt:delete
                       settings:list / settings:set
                       canvas:request-reset
                       agent:acknowledge
                       workspace:list / workspace:create / workspace:rename
                       workspace:delete / workspace:activate
                       review:panel / review:baseline / review:at
                       review:diff / review:commit
renderer  <--send---   pty:data (batched ~16ms) / pty:exit                         <--  main
                       agent:state
main      --send-->    edit:copy / edit:paste / edit:undo / edit:redo              -->  renderer
                       canvas:counts / canvas:reset
                       preset:spawn / preset:default / preset:capture
```

**Verify this block against Step 3's output before moving on** — if the two disagree, Step 3 is right and the block above is stale. Check 14 is the arbiter, not this plan.

Immediately below the block, replace the paragraph beginning *"The last three invoke groups above — the preset mutations…"* with:

```markdown
The invoke direction is the load-bearing part. Preset and prompt mutations, the
workspace verbs and the review reads are all renderer→main because main is the
only process that can answer them: only main can resolve an absent `command`
into the user's real login shell, only main owns the reset confirmation dialog,
and only main can reach a git binary. A renderer-side reconstruction of any of
them would drift from main's answer silently, and the two would then disagree
only in the cases nobody tests.
```

- [ ] **Step 5: Run the checks to verify they pass**

Run: `npm run verify:meta`
Expected: `15/15 passed`

- [ ] **Step 6: Commit**

```bash
git add README.md scripts/verify-meta.cjs
git commit -m "docs(oss): the diagram matches the contract, and a check that keeps it matching"
```

---

### Task 5: Continuous integration

**Files:**
- Create: `.github/workflows/verify.yml`
- Modify: `README.md`
- Modify: `scripts/verify-meta.cjs`

**Interfaces:**
- Consumes: `ok`, `read`, `README` from Tasks 1 and 3.
- Produces: check 16.

Roughly 640 checks exist and nothing runs them automatically. This is the single highest-return change in the plan: it turns "there is a large verification harness" from a claim into a green badge, and it catches the one failure mode a local-only harness cannot — a repository that only builds on the author's machine.

The workflow is split into two jobs on purpose. `verify` is the plain-node tier plus typecheck and build: fast, hermetic, and the job that must never be allowed to go red. `verify-electron` is the tier that needs the real Electron runtime and a hidden window. They are separated so that an environment problem in the Electron tier is legible as an environment problem rather than as "the project is broken".

- [ ] **Step 1: Write the failing check**

Append to `scripts/verify-meta.cjs`, before the footer:

```js
// 16. CI exists, and the README says so.
//
// Both halves matter and neither implies the other. A workflow nobody can see
// is a workflow nobody trusts — the badge IS the deliverable for a reader — and
// a badge with no workflow behind it is a broken image making a false claim.
{
  const workflow = read('.github/workflows/verify.yml')
  const badged = README.includes('workflows/verify.yml/badge.svg')
  ok('16 CI runs verify, and the README carries its badge',
    workflow !== null && /npm run verify/.test(workflow) && badged,
    `workflow=${workflow !== null} badge=${badged}`)
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run verify:meta`
Expected: **FAIL** on check 16 with `workflow=false badge=false`. `15/16 passed`.

- [ ] **Step 3: Write the workflow**

Create `.github/workflows/verify.yml`:

```yaml
# The whole quality signal, on every push and pull request.
#
# macOS only, and not as a preference: node-pty is compiled natively against
# Electron's ABI at postinstall, the session backend shells out to tmux, and the
# app is a macOS desktop application. A Linux runner could not build it, let
# alone exercise it.
name: verify

on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch:

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  # The cheap, hermetic tier: pure logic, plus the typecheck and build that
  # everything downstream depends on. This job must stay green.
  verify:
    name: plain node + typecheck + build
    runs-on: macos-latest
    timeout-minutes: 25
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      # The tmux suites skip loudly rather than failing when no binary is
      # found, so this is what makes them actually run.
      - name: Install tmux
        run: brew install tmux

      # postinstall runs electron-rebuild against node-pty. This is the step
      # that fails first if the native toolchain is wrong.
      - name: Install dependencies
        run: npm ci

      - name: Release hygiene
        run: npm run verify:meta

      - name: Pure logic suites
        run: |
          npm run verify:viewport
          npm run verify:registry
          npm run verify:layout
          npm run verify:palette
          npm run verify:rail
          npm run verify:review
          npm run verify:tmux
          npm run verify:agent-state
          npm run verify:package

      - name: Typecheck
        run: npm run typecheck

      - name: Build
        run: npm run build

  # The tier that needs a real Electron runtime. Every suite here opens a
  # window with `show: false`, so no display server is required — but this is
  # the job most exposed to runner-image drift, which is why it is its own job:
  # a failure here should read as "the Electron tier had a problem", not as
  # "the project is broken".
  verify-electron:
    name: electron runtime suites
    runs-on: macos-latest
    timeout-minutes: 35
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install tmux
        run: brew install tmux

      - name: Install dependencies
        run: npm ci

      - name: Build the renderer the suites load
        run: npm run build

      - name: node-pty under Electron's ABI
        run: |
          npm run verify:pty
          npm run verify:pty-manager

      - name: Real Electron lifecycle
        run: |
          npm run verify:window
          npm run verify:ipc
          npm run verify:canvas
          npm run verify:xterm

      # The big one: real input into the built renderer.
      - name: Panels
        run: npm run verify:panels
```

- [ ] **Step 4: Add the badge**

In `README.md`, add the CI badge as the **first** badge, immediately above the existing License badge:

```markdown
[![verify](https://github.com/alexnieves-cs/terminal-canvas/actions/workflows/verify.yml/badge.svg)](https://github.com/alexnieves-cs/terminal-canvas/actions/workflows/verify.yml)
```

- [ ] **Step 5: Run the checks to verify they pass**

Run: `npm run verify:meta`
Expected: `16/16 passed`

- [ ] **Step 6: Validate the workflow locally, as far as is possible**

CI cannot be truly tested until it runs on GitHub, but two failures are catchable now. Confirm the YAML parses and every `npm run` target in it exists:

```sh
node -e "const y=require('fs').readFileSync('.github/workflows/verify.yml','utf8'); const s=Object.keys(require('./package.json').scripts); const used=[...y.matchAll(/npm run ([a-z:-]+)/g)].map(m=>m[1]); const bad=used.filter(u=>!s.includes(u)); console.log(bad.length? 'UNKNOWN SCRIPTS: '+bad.join(', ') : 'all '+used.length+' script references exist')"
```

Expected: `all N script references exist`. A typo here is otherwise discovered only after a push, in a red badge.

- [ ] **Step 7: Commit**

```bash
git add .github/workflows/verify.yml README.md scripts/verify-meta.cjs
git commit -m "ci(oss): run the whole harness on macOS, in two tiers"
```

> **Note for the human, at Task 9:** the first CI run is the first time this has ever executed anywhere but one laptop. If `verify-electron` fails on the runner for environment reasons rather than real ones, do not delete the job — add `continue-on-error: true` to it with a comment saying why, keep `verify` as the required check, and open an issue. A red badge on day one is worse than an honest two-tier one.

---

### Task 6: Contributing, security, and the templates

**Files:**
- Create: `CONTRIBUTING.md`
- Create: `SECURITY.md`
- Create: `.github/ISSUE_TEMPLATE/bug_report.md`
- Create: `.github/ISSUE_TEMPLATE/feature_request.md`
- Create: `.github/pull_request_template.md`
- Modify: `scripts/verify-meta.cjs`

**Interfaces:**
- Consumes: `ok`, `read` from Task 1.
- Produces: checks 17–18. This is the last task that adds to `verify:meta`.

- [ ] **Step 1: Write the failing checks**

Append to `scripts/verify-meta.cjs`, before the footer:

```js
// 17. CONTRIBUTING exists and names the one thing a contributor must do.
// A CONTRIBUTING that does not name the verification command is decoration:
// this repository has no test runner and no linter, so a newcomer has no way
// to guess that `npm run verify` is the entire gate.
{
  const text = read('CONTRIBUTING.md') ?? ''
  ok('17 CONTRIBUTING names the verify command',
    text.includes('npm run verify'), text ? `${text.length} bytes` : 'absent')
}

// 18. SECURITY exists and is honest about what this app IS. Terminal Canvas
// spawns arbitrary local commands with the user's own login environment —
// that is the product, not a vulnerability — and a security policy that does
// not say so invites reports about the feature while burying real ones.
{
  const text = read('SECURITY.md') ?? ''
  ok('18 SECURITY exists and states the threat posture',
    text.length > 300 && /arbitrary/i.test(text), text ? `${text.length} bytes` : 'absent')
}
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm run verify:meta`
Expected: **FAIL** on 17 and 18, both `absent`. `16/18 passed`.

- [ ] **Step 3: Write `CONTRIBUTING.md`**

````markdown
# Contributing

Thanks for looking. This is a beta and the surface is still moving, so an issue
describing what you were trying to do is more useful than a large pull request
against something that may be about to change.

## The one hard rule

```sh
npm run verify
```

must be green. That is the entire gate — there is no unit-test runner and no
linter in this repository, and `npm run verify` chains every suite with a
typecheck and a build in the middle. A change that leaves it red is not
finished, and CI runs the same thing.

## Setup

macOS, Node 20+, Xcode Command Line Tools (`node-pty` compiles natively).
`tmux` is optional but recommended — without it, several suites skip and the
app loses session persistence.

```sh
npm install     # postinstall rebuilds node-pty against Electron's ABI
npm run dev
```

## How checks are written here

Suites are tiered by cost, and where a new check goes is a design decision
rather than a convenience:

- **Plain node** (`scripts/verify-{viewport,registry,layout,palette,rail,review,tmux,agent-state,package,meta}.cjs`)
  for anything with no DOM, no `electron` import and no native dependency. Most
  logic belongs here, and several modules take their dependencies as
  parameters specifically so they can stay in this tier.
- **Electron as node** for anything that touches `node-pty`.
- **Real Electron** for anything that needs input against real pixels.

Two conventions matter more than style:

1. **A check's comment explains the failure it guards, not what it asserts.**
   The assertion is already in the code. What a future reader needs is why the
   naive implementation is wrong, and most of the failures guarded here are
   silent — a panel that renders nothing with no error, a diagram that is
   quietly out of date, an exit code of 0 printed as a failure.
2. **Watch a new check fail before you make it pass.** A check that has never
   been red is a check that has never been shown to test anything. Note that
   these suites have no per-check isolation: an uncaught exception ends the
   process, so every check after it silently never runs. If a check throws,
   confirm its neighbours separately.

`CLAUDE.md` documents the load-bearing invariants check by check. It is long,
and it is the best available answer to "why is this written so strangely" — the
answer is usually "because the obvious version fails silently".

## Commits

Conventional, scoped to the milestone: `feat(m9c): …`, `fix(m8a): …`,
`docs(oss): …`.
````

- [ ] **Step 4: Write `SECURITY.md`**

```markdown
# Security Policy

## Reporting a vulnerability

Please report privately via
[GitHub Security Advisories](https://github.com/alexnieves-cs/terminal-canvas/security/advisories/new)
rather than in a public issue. This is a beta maintained by one person; expect
an acknowledgement within a week.

## What this application is

Terminal Canvas spawns **arbitrary local commands** — whatever you configure a
panel to run — inside real PTYs, using your own login shell environment
resolved from `$SHELL -ilc env`. That is the product, not a defect. Reports
along the lines of "the app can run any command" or "it reads my PATH and
dotfiles" describe intended behaviour and will be closed as such.

Two consequences are worth stating plainly, because they are properties of the
design rather than bugs:

- **Panel processes can outlive the window.** With `tmux` installed, closing or
  reloading the window deliberately leaves sessions running so agents survive.
  Quitting the app tears them down.
- **The review layer runs `git` against your working tree.** It takes a
  snapshot object with `git stash create` and reads diffs against it. It never
  checks anything out, never pops a stash, and never modifies the working tree.

## What is in scope

Genuinely interesting reports would include: escaping the renderer's context
isolation, an IPC channel that performs an action its caller should not be able
to request, the preload bridge exposing more than the declared contract, path
handling that escapes the intended directory when reading
`.claude/commands/*.md`, or anything that causes the app to run a command the
user did not configure.

## Releases are unsigned

Beta builds are unsigned and un-notarized, by decision — signing needs a paid
Apple Developer account. Verify what you are running, or build from source.
```

- [ ] **Step 5: Write the templates**

`.github/ISSUE_TEMPLATE/bug_report.md`:

```markdown
---
name: Bug report
about: Something behaved differently than it should have
labels: bug
---

**What happened, and what you expected instead**

**Steps to reproduce**
1.
2.

**Environment**
- macOS version:
- Apple Silicon or Intel:
- Installed from the `.dmg`, or built from source:
- `tmux --version` (or "not installed"):
- Session backend named in the HUD (`tmux` or `direct`), and the reason shown:

**Was `npm run verify` green?** (source builds only)

**Anything in the terminal or Console.app**
```

`.github/ISSUE_TEMPLATE/feature_request.md`:

```markdown
---
name: Feature request
about: Something that should exist and does not
labels: enhancement
---

**What you were trying to do, and what got in the way**

Describe the situation rather than the solution where you can — the constraint
behind a request is usually more useful than the proposed shape of it.

**Have you checked the backlog?**

`docs/ideas-backlog.md` holds unscheduled ideas, each recorded next to the
invariant it would have to survive. If yours is there, say so and add what your
use case adds.
```

`.github/pull_request_template.md`:

```markdown
**What this changes, and why**

**How it was verified**

- [ ] `npm run verify` is green
- [ ] New behaviour has a check, and that check was watched failing first
- [ ] `CLAUDE.md` / `README.md` updated if an invariant or a channel changed
```

- [ ] **Step 6: Run the checks to verify they pass**

Run: `npm run verify:meta`
Expected: `18/18 passed`

- [ ] **Step 7: Run the full chain**

Run: `npm run verify`
Expected: every suite green.

- [ ] **Step 8: Commit**

```bash
git add CONTRIBUTING.md SECURITY.md .github/ scripts/verify-meta.cjs
git commit -m "docs(oss): how to contribute, how to report, and what this app is by design"
```

---

### Task 7: The application icon — **requires a human to supply one image**

**Files:**
- Create: `docs/assets/icon-1024.png` (**human-supplied**)
- Create: `build/icon.icns` (generated from it)
- Modify: `build/builder-config.cjs`
- Modify: `scripts/verify-package.cjs`

**Interfaces:**
- Consumes: `buildConfig(opts)` from `build/builder-config.cjs`.
- Produces: `mac.icon` on the returned config, and `verify:package` check 11.

Without `build/icon.icns` the packaged app ships the default Electron icon — the clearest possible signal that a build is a toy. electron-builder would pick the file up by convention, but this config states things explicitly on purpose (see the `identity: null` comment in the same file), and an explicit value is the only kind a check can read.

> **HUMAN GATE.** An agent cannot invent a visual identity. Before this task can run, a human must place a **1024×1024 PNG** at `docs/assets/icon-1024.png`. Square, no rounded corners and no drop shadow — macOS applies its own mask. Anything deliberate is fine: a monogram, a terminal glyph on a flat field, a shape from the canvas itself. If none exists yet, **skip this task and continue to Task 8**; it is the only task nothing else depends on.

- [ ] **Step 1: Confirm the source image exists and is square**

```sh
sips -g pixelWidth -g pixelHeight docs/assets/icon-1024.png
```

Expected: `pixelWidth: 1024` and `pixelHeight: 1024`. If the file is absent, stop — this is the human gate above, not a failure to work around.

- [ ] **Step 2: Write the failing check**

Append to `scripts/verify-package.cjs`, immediately before the `console.log('\n' + '='.repeat(60))` footer:

```js
// 11. The icon is CONFIGURED, not merely present. electron-builder would find
// build/icon.icns by convention, but a convention is not something a check can
// read, and the difference shows up only in the built artifact — an app wearing
// the stock Electron icon, which no test and no typecheck can see. Both halves
// are asserted because either alone is satisfiable while the app still ships
// wrong: a path with no file behind it builds a default-icon app, and a file no
// config names is one rename away from being ignored.
{
  const { existsSync } = require('node:fs')
  const { join } = require('node:path')
  const icon = config.mac && config.mac.icon
  ok('11 the mac icon is configured and the file exists',
    typeof icon === 'string' && icon.endsWith('.icns') &&
      existsSync(join(__dirname, '..', icon)),
    icon || 'unset')
}
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm run verify:package`
Expected: **FAIL** on `11 the mac icon is configured and the file exists — unset`. `10/11 passed`.

- [ ] **Step 4: Generate the `.icns`**

```sh
set -e
ICONSET=$(mktemp -d)/tc.iconset
mkdir -p "$ICONSET"
for s in 16 32 128 256 512; do
  sips -z $s $s docs/assets/icon-1024.png --out "$ICONSET/icon_${s}x${s}.png" >/dev/null
  sips -z $((s*2)) $((s*2)) docs/assets/icon-1024.png --out "$ICONSET/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o build/icon.icns
ls -la build/icon.icns
```

`sips` and `iconutil` both ship with macOS, so this needs no new dependency. The `512x512@2x` entry is the 1024px original, which is why the source must be exactly that size.

- [ ] **Step 5: Name it in the config**

In `build/builder-config.cjs`, inside the `mac: { … }` block, add the `icon` key immediately above the existing `category` line:

```js
      // EXPLICIT rather than left to electron-builder's build/icon.icns
      // convention, for the same reason `identity` below is explicit: a
      // convention is invisible to verify:package, and an app that silently
      // falls back to the stock Electron icon is a defect no check, typecheck
      // or build failure can see — only a human looking at the Dock.
      icon: 'build/icon.icns',
```

- [ ] **Step 6: Run the check to verify it passes**

Run: `npm run verify:package`
Expected: `11/11 passed`

- [ ] **Step 7: Commit**

```bash
git add build/icon.icns build/builder-config.cjs docs/assets/icon-1024.png scripts/verify-package.cjs
git commit -m "feat(oss): an icon, named explicitly so a check can see it"
```

---

### Task 8: Frame `CLAUDE.md` as what it is

**Files:**
- Modify: `CLAUDE.md`
- Modify: `README.md`

**Interfaces:** none. This task adds no check.

`CLAUDE.md` is 2,605 lines against a 338-line README. At the root of a public repository, with that name, a reader's first assumption is "generated agent configuration" — and they will skim past the single most substantial engineering document here. It is in fact a decisions log where nearly every entry explains why the obvious implementation fails silently, which is unusual and worth reading.

The fix is framing, not relocation. Moving the body to `docs/` and leaving an import behind would risk the working setup of a repository under active parallel development for a cosmetic gain; a preamble costs nothing and recovers most of the benefit.

- [ ] **Step 1: Add the preamble**

Insert at the very top of `CLAUDE.md`, above the existing `# CLAUDE.md` line, and keep everything below it untouched:

```markdown
> **What this file is.** An engineering decisions log, kept alongside the code
> it explains. It is named `CLAUDE.md` because Claude Code loads it
> automatically, but nothing in it is addressed only to a machine: nearly every
> entry records a load-bearing invariant and the *silent* failure that would
> follow from undoing it — a panel that renders nothing with no error, an exit
> code of `0` printed as a failure, a diagram that quietly stopped matching the
> contract. If you are wondering why some line in this repository is written so
> strangely, the answer is almost certainly here, and it is almost always
> "because the obvious version fails without saying anything".
>
> New to the project? Start with [README.md](README.md); come here when you need
> to change something and want to know what it is holding up. The
> `## Load-bearing details` section is the heart of it.

```

- [ ] **Step 2: Point at it from the README**

In `README.md`'s `### Things that are non-obvious` section, immediately below that heading, insert:

```markdown
A fuller version of this list — every load-bearing invariant in the codebase,
each recorded next to the silent failure that follows from undoing it — lives in
[`CLAUDE.md`](CLAUDE.md), which is the project's engineering decisions log
rather than tool configuration.

```

- [ ] **Step 3: Verify nothing else moved**

The body of `CLAUDE.md` is load-bearing prose and this task must add to it and nothing else. Confirm the only change is an addition:

```sh
git diff --numstat CLAUDE.md
```

Expected: a line of the form `N	0	CLAUDE.md` — **the deletions column must be `0`.** If it is not, the preamble replaced something; restore with `git checkout CLAUDE.md` and redo Step 1 as a pure insertion.

- [ ] **Step 4: Run the full chain**

Run: `npm run verify`
Expected: every suite green.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md README.md
git commit -m "docs(oss): say what CLAUDE.md is, so a reader does not skim past it"
```

---

### Task 9: Cut the beta — **human-driven throughout**

**Files:**
- Create: `docs/assets/screenshot-canvas.png` (**human-captured**)
- Modify: `README.md`

> **HUMAN GATE — an agent must not perform Steps 4 through 7.** Making a repository public, pushing commits, and publishing a release are irreversible, outward-facing actions. Once the repository is public, the entire commit history is public with it. An agent executing this plan should stop here, report that Tasks 1–8 are complete, and hand back.

- [ ] **Step 1: Verify the packaged application actually runs** *(agent may do this)*

This is the pre-release gate and it is deliberately excluded from `npm run verify` because it rebuilds native modules and reaches electron-builder's cache.

Run: `npm run verify:packaged`
Expected: `9/9 passed`. This is the only check that proves the `.app` survives startup with a stripped PATH — the asar/`node-pty` proof that the whole packaging config exists for.

Then build the artifacts:

Run: `npm run package`
Expected: a `.app` and a `.dmg` in `release/`.

Open the `.app` from `release/` by hand and confirm the icon is yours (Task 7) and a panel spawns.

- [ ] **Step 2: Capture the screenshots** *(human)*

The README currently has no image, and for a visual application that is the largest remaining gap. Capture at least one, at a retina resolution, with `Cmd+Shift+4` then Space to grab the window:

1. **`docs/assets/screenshot-canvas.png`** — the money shot. Four or five panels at a readable zoom, at least two running a real agent with visibly different border states (one working, one waiting on you), the side rail open showing the panel outline, and the inspector open on a selected panel. If a review node with real diff content can be on screen too, include it.

Use a real repository with real output. A canvas of empty shells demonstrates nothing, and a reader can tell.

- [ ] **Step 3: Put the image in the README** *(human or agent)*

In `README.md`, immediately below the `> **Status: beta …**` blockquote and above `## What it does`, insert:

```markdown
![The canvas: five agent panels, the side rail, and the inspector](docs/assets/screenshot-canvas.png)
```

Then run `npm run verify:meta` (expected `18/18 passed`) and commit:

```bash
git add docs/assets/screenshot-canvas.png README.md
git commit -m "docs(oss): show the thing"
```

- [ ] **Step 4: Push** *(human)*

`main` is ahead of `origin/main` by several commits from parallel milestone work as well as this plan's. Review what is about to become public — permanently — before pushing:

```sh
git log --oneline origin/main..main
git push origin main
```

Watch the Actions tab. The first CI run is the first time this harness has executed anywhere but one laptop; see Task 5's closing note if `verify-electron` fails for environment reasons.

**Do not proceed to Step 5 until CI is green.** A public repository with a red badge on its first day is worse than a private one.

- [ ] **Step 5: Make it public** *(human, irreversible)*

```sh
gh repo edit alexnieves-cs/terminal-canvas --visibility public --accept-visibility-change-consequences
```

- [ ] **Step 6: Description and topics** *(human)*

These are what makes the repository findable and what a recruiter reads first in a list:

```sh
gh repo edit alexnieves-cs/terminal-canvas \
  --description "An infinite canvas where every node is a live terminal running a coding-agent CLI. Electron + React + node-pty, macOS." \
  --homepage "https://github.com/alexnieves-cs/terminal-canvas#readme" \
  --add-topic electron --add-topic typescript --add-topic terminal \
  --add-topic xterm-js --add-topic node-pty --add-topic tmux \
  --add-topic infinite-canvas --add-topic ai-agents --add-topic developer-tools
```

- [ ] **Step 7: Publish the release** *(human)*

```sh
gh release create v0.1.0-beta release/*.dmg \
  --title "v0.1.0-beta" \
  --notes "First public beta. macOS, Apple Silicon.

The build is unsigned — macOS will refuse the first launch. Right-click the app and choose Open, or run:

    xattr -dr com.apple.quarantine /Applications/Terminal\\ Canvas.app

See the README for what it does and the keyboard reference. Issues and reports very welcome; this has been used by exactly one person so far."
```

- [ ] **Step 8: Read your own repository as a stranger** *(human)*

Open the public URL in a logged-out browser window. Give it sixty seconds and check: does the badge render green, is the screenshot visible, is it obvious within two sentences what this is and that it is macOS-only, and does the Releases link have a downloadable file behind it. Fix whatever fails that pass — that is the entire audience this plan was written for.

---

## Self-Review

Run against the `## Findings` section:

| Finding | Task | Covered |
|---|---|---|
| 1. No LICENSE | 1 | Yes — file, plus checks 1–3 |
| 2. `.claude/settings.json` tracked | 2 | Yes — untracked, plus check 7 |
| 3. README not for a visitor | 3, 9 | Yes — sections in 3, screenshot in 9 |
| 4. Stale architecture diagram | 4 | Yes — plus check 14, which prevents recurrence |
| 5. No CI | 5 | Yes — two jobs, plus check 16 |
| 6. No community files | 6 | Yes — plus checks 17–18 |
| 7. No `engines` | 1 | Yes — check 4 |
| 8. No icon | 7 | Yes — `verify:package` check 11 |
| 9. Distribution undocumented | 3, 9 | Yes — Install section, release notes |
| 10. `CLAUDE.md` unframed | 8 | Yes — preamble, no relocation |

**Numbering consistency:** `verify:meta` checks run 1–18 with no gaps and no duplicates (1–6 T1, 7 T2, 8–13 T3, 14–15 T4, 16 T5, 17–18 T6). `verify:package` gains exactly one, 11, following its existing 10.

**Cross-task interfaces:** `ok`, `read`, `ROOT` and the `README` constant are defined once in Task 1 / Task 3 and reused by name in every later task. `REQUIRED_HEADINGS` is defined in Task 3; Task 5 asserts the CI badge separately rather than extending it, because a badge is not a heading.

**Known ordering constraints:** Task 3 must precede Tasks 4 and 5, which both read the `README` constant it defines. Task 7 is independent and skippable. Task 9 depends on everything. Tasks 1, 2 and 6 are independent of each other.

**Deliberately not done here**, and each is a decision rather than an oversight:

- **Code signing and notarization** — needs a paid Apple Developer account. The unsigned path is documented instead.
- **Moving `CLAUDE.md`'s body into `docs/`** — considered and rejected in Task 8; the risk to a repository under active parallel development outweighs a cosmetic gain.
- **Intel / universal builds** — `arch` is already a parameter in `build/builder-config.cjs`, so this is a call site rather than a change, but nobody has tested one.
- **Linux or Windows support** — out of scope; the app is macOS-specific from `shell-env.ts` down.
