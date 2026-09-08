import { discoveryOf, parseDevScripts, parseListeningPorts, type Discovery } from '../shared/preview'

/**
 * M185. DISCOVERY EXECUTES NOTHING.
 *
 * This module answers "what project is this panel pointed at, and is anything
 * of it listening" — and the whole of its design is what it refuses to do to
 * find out. It asks the system ONE question (`lsof` over the pids the caller
 * already holds) and reads ONE file (`package.json` at the panel's directory).
 * A dev script is REPORTED with its command; running it to see what port it
 * opens would start a server on a person's machine from a hover, and is the
 * failure `verify:file preview.1` counts the runner's calls to prevent.
 *
 * Every dependency is injected, so the whole module runs under plain node:
 * `run` is the process seam (`agent-runner.ts`'s shape), `readText` reads a
 * file and answers `undefined` when there is none — a missing package.json is
 * a fact about the project, not a failure of the question.
 */
export interface DiscoverDeps {
  /**
   * The panel's OWN pids — a shell, or a tmux client. The tree below them is
   * expanded here through `descendants`, because the process holding the
   * listening socket is `npm run dev`'s child and never the shell itself
   * (M185's critic, finding 1: without this every real dev server answered
   * `nothing is listening`).
   */
  pids: readonly number[]
  /** The pids' descendants, including themselves. Absent = ask about the roots alone. */
  descendants?: (roots: readonly number[]) => Promise<readonly number[]>
  cwd: string
  run: (command: string, args: readonly string[]) => Promise<{ code: number; stdout: string }>
  readText: (path: string) => Promise<string | undefined>
}

/** `-F pn` is the machine-readable field form: `p<pid>` then one `n<address>` per socket. */
export function buildLsofArgs(pids: readonly number[]): string[] {
  return ['-nP', '-iTCP', '-sTCP:LISTEN', '-F', 'pn', '-a', '-p', pids.join(',')]
}

export async function discoverPreview(deps: DiscoverDeps): Promise<Discovery> {
  const project = await deps.readText(`${deps.cwd.replace(/\/$/, '')}/package.json`)
  const parsed = project === undefined ? undefined : parseDevScripts(project)
  // No pid: nothing of this panel is running, so there is nothing to ask about
  // and `lsof` is not asked. (An `lsof -p` with an empty list answers for EVERY
  // process on the machine, which would offer a person their mail client.)
  if (deps.pids.length === 0) {
    return discoveryOf({ ports: [], asked: false, where: deps.cwd, ...(parsed?.name === undefined ? {} : { project: parsed.name }), scripts: parsed?.scripts ?? [] })
  }
  const asked = deps.descendants === undefined ? [...deps.pids] : [...await deps.descendants(deps.pids)]
  if (asked.length === 0) {
    return discoveryOf({ ports: [], asked: false, where: deps.cwd, ...(parsed?.name === undefined ? {} : { project: parsed.name }), scripts: parsed?.scripts ?? [] })
  }
  let stdout = ''
  try {
    const answer = await deps.run('lsof', buildLsofArgs(asked))
    // A non-zero exit is lsof's ordinary answer for "none of these pids is
    // listening"; its stdout is then empty and the parse says the same thing.
    stdout = answer.stdout
  } catch {
    stdout = ''
  }
  return discoveryOf({
    ports: parseListeningPorts(stdout),
    where: deps.cwd,
    ...(parsed?.name === undefined ? {} : { project: parsed.name }),
    scripts: parsed?.scripts ?? []
  })
}
