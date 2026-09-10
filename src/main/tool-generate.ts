/**
 * M252. Describe a tool — the ONE headless agent run behind it.
 *
 * Main runs it because main owns every process. It is deliberately NOT an
 * agent session (`agent-session-args.ts`): a session is a conversation with
 * tools and permission requests, and this is a single question whose answer
 * is DATA. So the argv is its own contract:
 *
 *   claude -p --output-format json --tools "" --json-schema <schema>
 *          --append-system-prompt <how to answer> -- <the description>
 *
 * `--tools ""` gives the agent NO tools (measured against claude 2.1.268's
 * help: "Use \"\" to disable all tools") — it cannot read, write or run
 * anything, so the only thing it can do is answer. This app then writes the
 * files itself, only under `<folder>/tools/<slug>/`, and runs nothing: the
 * renderer saves a workflow `reviewed: false` and opens an app's preview
 * without its page. `--` ends the options, so a description that starts
 * with a dash is a prompt, never a flag.
 *
 * Over an injected `AgentRunner`, so verify:tool counts spawns and kills with
 * a fake and the real `claudeCliRunner` is wired in index.ts.
 */
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve, sep } from 'node:path'
import type { AgentRunner } from './agent-runner'
import { TOOL_SCHEMA, TOOL_SYSTEM_PROMPT, parseToolReply, toolCapabilities, type ToolGenerateRequest, type ToolGenerateResult } from '../shared/tool-spec'

export interface ToolHandlers {
  generate(req: ToolGenerateRequest): Promise<ToolGenerateResult>
}

export const INERT_TOOLS: ToolHandlers = {
  generate: async () => ({ kind: 'refused', reason: 'describing a tool is not wired here' })
}

export const TOOL_TIMEOUT_MS = 180_000
export const TOOL_DESCRIPTION_MAX = 2000

export function toolArgs(description: string): string[] {
  return ['-p', '--output-format', 'json', '--tools', '', '--json-schema', JSON.stringify(TOOL_SCHEMA), '--append-system-prompt', TOOL_SYSTEM_PROMPT, '--', description]
}

export interface ToolGeneratorDeps {
  runner: AgentRunner
  /** The resolved `claude` binary — the SAME `claudePath` sessions use. */
  command: () => string
  env: () => Record<string, string>
  timeoutMs?: number
}

const waited = (ms: number): string => (ms < 1000 ? `${ms}ms` : `${Math.round(ms / 1000)}s`)

/** `tools/<slug>`, or `-2`, `-3`… — a second tool of one name never overwrites the first. */
function freshRoot(folder: string, slug: string): string {
  const base = join(folder, 'tools', slug)
  if (!existsSync(base)) return base
  for (let n = 2; ; n += 1) {
    const next = `${base}-${n}`
    if (!existsSync(next)) return next
  }
}

export function createToolGenerator(deps: ToolGeneratorDeps): ToolHandlers {
  const timeoutMs = deps.timeoutMs ?? TOOL_TIMEOUT_MS
  return {
    async generate(req) {
      const description = typeof req?.description === 'string' ? req.description.trim() : ''
      if (description === '') return { kind: 'refused', reason: 'describe the tool first — a sentence about what it should do' }
      if (description.length > TOOL_DESCRIPTION_MAX) return { kind: 'refused', reason: `describe it in under ${TOOL_DESCRIPTION_MAX} characters` }
      const folder = typeof req?.folder === 'string' ? req.folder : ''
      let isDir = false
      try { isDir = isAbsolute(folder) && statSync(folder).isDirectory() } catch { isDir = false }
      if (!isDir) return { kind: 'refused', reason: `${folder || 'the workspace folder'} is not a folder on this machine — a tool is made inside one` }

      const outcome = await new Promise<{ kind: 'answered'; stdout: string } | { kind: 'refused'; reason: string }>((settle) => {
        let stdout = ''
        let done = false
        const finish = (value: { kind: 'answered'; stdout: string } | { kind: 'refused'; reason: string }): void => {
          if (done) return
          done = true
          clearTimeout(timer)
          settle(value)
        }
        const proc = deps.runner({ command: deps.command(), args: toolArgs(description), cwd: folder, env: deps.env(), closeStdin: true })
        const timer = setTimeout(() => {
          proc.kill()
          finish({ kind: 'refused', reason: `the agent took longer than ${waited(timeoutMs)} — it was stopped and nothing was made` })
        }, timeoutMs)
        proc.onData((chunk) => { stdout += chunk })
        proc.onExit((info) => {
          if (info.code === 0) finish({ kind: 'answered', stdout })
          else finish({ kind: 'refused', reason: `the agent could not make the tool: ${info.stderr?.trim() || `it exited with ${info.code ?? info.signal ?? 'no code'}`}` })
        })
      })
      if (outcome.kind === 'refused') return outcome

      const spec = parseToolReply(outcome.stdout, folder)
      if (spec.kind === 'refused') return spec
      if (spec.kind === 'workflow') {
        return {
          kind: 'workflow',
          template: { name: spec.name, ...(spec.description === undefined ? {} : { description: spec.description }), nodes: spec.nodes, edges: spec.edges, reviewed: false },
          capabilities: toolCapabilities({ kind: 'workflow', nodes: spec.nodes }),
          dropped: spec.dropped
        }
      }
      const root = freshRoot(folder, spec.slug)
      try {
        for (const file of spec.files) {
          const target = resolve(root, file.path)
          // parseToolReply already refused `..` and absolute paths; this is
          // the belt to its braces, on the resolved path the write will use.
          if (!target.startsWith(root + sep)) return { kind: 'refused', reason: `${file.path} resolves outside the tool's folder — nothing more was written` }
          mkdirSync(dirname(target), { recursive: true })
          writeFileSync(target, file.text, { mode: 0o644 })
        }
        writeFileSync(join(root, 'package.json'), `${JSON.stringify({ name: spec.slug, private: true, scripts: { dev: spec.devScript } }, null, 2)}\n`, { mode: 0o644 })
      } catch (error: unknown) {
        return { kind: 'refused', reason: `the tool's files could not be written: ${error instanceof Error ? error.message : String(error)}` }
      }
      return {
        kind: 'app', name: spec.name, root, url: `http://localhost:${spec.port}`, devScript: spec.devScript,
        capabilities: toolCapabilities({ kind: 'app', root, devScript: spec.devScript, files: spec.files }),
        dropped: spec.dropped
      }
    }
  }
}
