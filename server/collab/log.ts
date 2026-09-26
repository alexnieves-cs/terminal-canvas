/**
 * M346. The collab server's log: one JSON object per line on stdout, which
 * journald keeps (deploy/tc-collab.service) and `journalctl -u tc-collab -o
 * cat | jq` reads. Structured so an alert can match an EVENT, never a phrase.
 *
 * What goes in a line is the operator's business, never a room's content: an
 * event name, a room's name (a share's uuid), user ids, sizes, timings and an
 * error's message. A refused update is logged by its reason, not its bytes.
 */
export type Level = 'info' | 'warn' | 'error'

export function createLog(write: (line: string) => void = (line) => { process.stdout.write(`${line}\n`) }, now: () => Date = () => new Date()) {
  const levelOf = (event: string): Level => (/failed|error/.test(event) ? 'error' : /refused|denied/.test(event) ? 'warn' : 'info')
  return (event: string, fields: Record<string, unknown> = {}): void => {
    write(JSON.stringify({ ts: now().toISOString(), level: levelOf(event), event, ...fields }))
  }
}
