/** M54 — the real entry for `tc`: a socket connect and the process's own io. */
import { createConnection } from 'node:net'
import { runCli, type Connect } from './tc'

const connect: Connect = (path, line) => new Promise((resolve, reject) => {
  const sock = createConnection(path)
  let buf = ''
  sock.setEncoding('utf8')
  sock.on('data', (d: string) => { buf += d })
  sock.on('end', () => resolve(buf))
  sock.on('error', reject)
  sock.write(line)
})

void runCli(process.argv.slice(2), process.env, connect, {
  stdout: (s) => process.stdout.write(s),
  stderr: (s) => process.stderr.write(s)
}).then((code) => { process.exitCode = code })
