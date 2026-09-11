import { buildPack, type PackFile } from './pack'
import type { Preset, Prompt } from './layout-schema'
import type { PersistedTemplate } from './templates'

/**
 * M255. THE SAMPLE DEV-RELATIONS PACK — the first integration pack, and its
 * ONE source: `docs/packs/dev-relations.tcpack` is this, serialised, and the
 * copy "Import the sample dev-relations pack…" writes under userData is this
 * too (`verify:file devrel.pack.2` fails the moment they differ).
 *
 * Everything here DRAFTS. The workflows' chats write RELEASE_NOTES.md,
 * CHANGELOG.md, ANNOUNCEMENT.md and PR_COMMENT.md; the terminals and presets
 * only READ (git log, gh pr list/view). Publishing is a person's act through
 * ⌘K › Publish… (`main/github-publish.ts`), which shows the text first. No
 * executable surface may hold a GitHub write — a `gh` write uses gh's own
 * login and would bypass the broker and the publisher both
 * (`devrel.pack.1` asserts it on every preset and terminal node).
 *
 * Terminal nodes are hole-free on purpose: a workflow fills `{{holes}}` in a
 * node's cwd, command, title and message, never in `args`, so a PR number
 * lives in the chat's message, where it is filled.
 */

const DRAFT_ONLY = 'Draft only. Never call `tc api` or `gh` to write anything — a person publishes the file with ⌘K › Publish…, which shows them the text first.'
const SINCE_TAG = 'git log $(git describe --tags --abbrev=0)..HEAD --oneline --no-merges'

const templates: PersistedTemplate[] = [
  {
    id: 'devrel-release-notes',
    name: 'release notes',
    description: 'the commits since the last tag, and a chat that drafts RELEASE_NOTES.md from them',
    nodes: [
      { key: 'commits', kind: 'terminal', cwd: '{{repository}}', command: '/bin/sh', args: ['-lc', SINCE_TAG], title: 'commits since the last tag', dx: -280, dy: 0 },
      { key: 'draft', kind: 'chat', cwd: '{{repository}}', title: 'release notes', message: `Draft release notes for the commits since the last tag (the terminal beside you lists them; run \`${SINCE_TAG}\` yourself if it is gone). Group them under Added, Changed and Fixed, in the voice the "release notes voice" prompt describes, and write RELEASE_NOTES.md with the version as its first # heading. ${DRAFT_ONLY}`, dx: 280, dy: 0 }
    ],
    edges: []
  },
  {
    id: 'devrel-changelog-entry',
    name: 'changelog entry',
    description: 'one merged pull request, and a chat that adds its entry to CHANGELOG.md',
    nodes: [
      { key: 'merged', kind: 'terminal', cwd: '{{repository}}', command: '/bin/sh', args: ['-lc', 'gh pr list --state merged --limit 20'], title: 'recently merged', dx: -280, dy: 0 },
      { key: 'draft', kind: 'chat', cwd: '{{repository}}', title: 'changelog entry', message: `Read pull request #{{pr}} with \`gh pr view {{pr}}\`, then add one entry for it at the top of CHANGELOG.md in the format the "changelog entry format" prompt describes. ${DRAFT_ONLY}`, dx: 280, dy: 0 }
    ],
    edges: []
  },
  {
    id: 'devrel-release-announcement',
    name: 'release announcement',
    description: 'a chat that turns RELEASE_NOTES.md into ANNOUNCEMENT.md, for a release body or a GitHub Discussion',
    nodes: [
      { key: 'tag', kind: 'terminal', cwd: '{{repository}}', command: '/bin/sh', args: ['-lc', 'git describe --tags --abbrev=0 && git log -1 --format=%cd'], title: 'the last tag', dx: -280, dy: 0 },
      { key: 'draft', kind: 'chat', cwd: '{{repository}}', title: 'announcement', message: `From RELEASE_NOTES.md, draft ANNOUNCEMENT.md in the shape the "announcement format" prompt describes: a # title naming the release, then a short announcement a person could post as a GitHub Discussion. ${DRAFT_ONLY}`, dx: 280, dy: 0 }
    ],
    edges: []
  },
  {
    id: 'devrel-pr-comment',
    name: 'PR comment',
    description: 'a pull request and its discussion, and a chat that drafts PR_COMMENT.md',
    nodes: [
      { key: 'status', kind: 'terminal', cwd: '{{repository}}', command: '/bin/sh', args: ['-lc', 'gh pr status'], title: 'pull requests', dx: -280, dy: 0 },
      { key: 'draft', kind: 'chat', cwd: '{{repository}}', title: 'PR comment', message: `Read pull request #{{pr}} and its discussion with \`gh pr view {{pr}} --comments\`, then draft a reply in PR_COMMENT.md in the tone the "PR comment tone" prompt describes. ${DRAFT_ONLY}`, dx: 280, dy: 0 }
    ],
    edges: []
  }
]

const prompts: Prompt[] = [
  { id: 'devrel-voice', name: 'release notes voice', body: 'Write for the people who use this project, not the people who built it. Lead each line with what changed for them, in plain words; name the pull request in brackets at the end. No marketing adjectives, no internal ticket jargon.' },
  { id: 'devrel-changelog', name: 'changelog entry format', body: 'One line per change under the version heading: `- <what changed, for the user> ([#<pr>](<url>))`. Keep a Changelog\'s sections — Added, Changed, Fixed, Removed — and put the entry in the one it belongs to.' },
  { id: 'devrel-announcement', name: 'announcement format', body: 'A # title with the project and version. One paragraph on the headline change and why it matters. A short list of the other notable changes. One line on how to upgrade. Under 250 words.' },
  { id: 'devrel-pr-comment', name: 'PR comment tone', body: 'Thank the author once, specifically. Say what you checked. Name anything that blocks merging as a question with a suggested fix. End with the next step. Plain, kind, brief.' }
]

const presets: Preset[] = [
  { id: 'devrel-merged-prs', name: 'merged PRs', cwd: '~', command: '/bin/sh', args: ['-lc', 'gh pr list --state merged --limit 20'] },
  { id: 'devrel-since-tag', name: 'commits since last tag', cwd: '~', command: '/bin/sh', args: ['-lc', SINCE_TAG] }
]

export const DEVREL_PACK_FILE = 'dev-relations.tcpack'

export function devrelPack(): PackFile {
  return buildPack({
    manifest: {
      name: 'dev relations',
      version: '1.0.0',
      description: 'Draft release notes, changelog entries, release announcements and PR comments from your repository. Every workflow drafts into a file; you publish it yourself with ⌘K › Publish…, which shows you the text first.',
      credentials: [{ service: 'github', fields: [{ id: 'token', label: 'personal access token' }] }],
      tools: [
        { command: 'gh', why: 'lists and reads pull requests' },
        { command: 'git', why: 'reads the commits since the last tag' }
      ]
    },
    templates,
    prompts,
    presets,
    // Fixed, so the shipped file is byte-for-byte what this builds.
    app: 'terminal-canvas',
    now: 0
  })
}

/** The file as shipped and as written for "Import the sample dev-relations pack…". */
export function devrelPackText(): string {
  return `${JSON.stringify(devrelPack(), null, 2)}\n`
}
