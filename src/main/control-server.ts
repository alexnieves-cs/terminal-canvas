/**
 * M54 — the Unix-domain socket main listens on.
 *
 * One JSON request per connection, newline-terminated; one JSON reply; the
 * server ends the connection. A malformed line is ANSWERED (`ok: false`)
 * and the server keeps listening — a client that can take the server down
 * with a typo is a client that can take the app's control surface down.
 *
 * The socket file is unlinked before listen (a stale file from a crashed
 * instance would refuse the bind, and the app would come up without its
 * door and no symptom) and chmod'd 0600 after (a Unix socket honours file
 * permissions on darwin; the default would let any local user open panels).
 * No network, ever: there is no `port` here and no way to add one without
 * changing this module's one listen call.
 */
import { createServer, type Server, type Socket } from 'node:net'
import { chmodSync, rmSync } from 'node:fs'
import { parseControlLine, type ControlRequest } from './control-protocol'

export interface ControlReply {
  /** M81. `status`'s model. */
  canvas?: import('./control-handler').ControlCanvasModel
  ok: boolean
  error?: string
  [key: string]: unknown
}

export interface ControlServer {
  path: string
  close(): Promise<void>
}

/** A request longer than this is a client that is not speaking the protocol. */
const LINE_MAX = 64 * 1024

export function createControlServer(deps: {
  path: string
  handle: (req: ControlRequest) => Promise<ControlReply>
}): Promise<ControlServer> {
  const { path, handle } = deps
  const server: Server = createServer((sock: Socket) => {
    let buf = ''
    let answered = false
    const reply = (r: ControlReply): void => {
      if (answered) return
      answered = true
      sock.end(`${JSON.stringify(r)}\n`)
    }
    sock.setEncoding('utf8')
    sock.on('data', (chunk: string) => {
      if (answered) return
      buf += chunk
      if (buf.length > LINE_MAX) { reply({ ok: false, error: 'request too long' }); return }
      const nl = buf.indexOf('\n')
      if (nl === -1) return
      const parsed = parseControlLine(buf.slice(0, nl))
      if (parsed.kind === 'bad') { reply({ ok: false, error: parsed.error }); return }
      handle(parsed.req)
        .then(reply)
        .catch((error: unknown) => reply({ ok: false, error: String(error) }))
    })
    // A client that closes without a newline gets what it sent parsed anyway.
    sock.on('end', () => {
      if (answered || buf.length === 0) return
      const parsed = parseControlLine(buf)
      if (parsed.kind === 'bad') { reply({ ok: false, error: parsed.error }); return }
      handle(parsed.req).then(reply).catch((error: unknown) => reply({ ok: false, error: String(error) }))
    })
    sock.on('error', () => { /* a client that vanished mid-line is not our problem */ })
  })

  rmSync(path, { force: true })
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(path, () => {
      server.off('error', reject)
      try { chmodSync(path, 0o600) } catch (error: unknown) { console.warn(`[control] could not chmod ${path}: ${String(error)}`) }
      resolve({
        path,
        close: () => new Promise<void>((done) => {
          server.close(() => { rmSync(path, { force: true }); done() })
        })
      })
    })
  })
}
