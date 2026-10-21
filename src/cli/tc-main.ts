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

// M487. `tc mcp` owns stdin and stdout for the protocol, so it never reaches
// runCli, which writes a reply to stdout. The SDK is loaded only on this
// path: a plain `tc list` must not pay for (or break on) a module it never uses.
if (process.argv[2] === 'mcp') {
  void (async () => {
    const [{ createMcpServer }, { StdioServerTransport }] = await Promise.all([import('./mcp'), import('@modelcontextprotocol/sdk/server/stdio.js')])
    const server = createMcpServer({ env: process.env, connect, version: '6' })
    await server.connect(new StdioServerTransport())
  })().catch((error: unknown) => {
    process.stderr.write(`tc mcp: ${String(error)}\n`)
    process.exitCode = 2
  })
} else {
  void runCli(process.argv.slice(2), process.env, connect, {
    stdout: (s) => process.stdout.write(s),
    stderr: (s) => process.stderr.write(s)
  }).then((code) => { process.exitCode = code })
}
