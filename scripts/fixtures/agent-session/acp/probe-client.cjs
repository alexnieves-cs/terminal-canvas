// Records a copilot --acp conversation raw. Each line in the log is prefixed
// "<- " (agent -> client) or "-> " (client -> agent). Usage:
//   node acp-client.cjs <cwd> <out.log> <prompt> [terminal:true|false]
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const [cwd, out, prompt, termArg] = process.argv.slice(2);
const terminal = termArg !== 'false';
const log = fs.createWriteStream(out);
const child = spawn('copilot', ['--acp'], { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
child.stderr.on('data', (d) => log.write('## stderr ' + JSON.stringify(String(d)) + '\n'));
let nextId = 1; const pending = new Map();
function send(obj) { const s = JSON.stringify(obj); log.write('-> ' + s + '\n'); child.stdin.write(s + '\n'); }
function request(method, params) { return new Promise((res, rej) => { const id = nextId++; pending.set(id, { res, rej }); send({ jsonrpc: '2.0', id, method, params }); }); }
let buf = '';
child.stdout.on('data', (d) => {
  buf += d; let i;
  while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (line.trim()) onLine(line); }
});
function onLine(line) {
  log.write('<- ' + line + '\n');
  let msg; try { msg = JSON.parse(line); } catch { return; }
  if (msg.id !== undefined && msg.method === undefined) { const p = pending.get(msg.id); if (p) { pending.delete(msg.id); msg.error ? p.rej(msg.error) : p.res(msg.result); } return; }
  if (msg.method && msg.id !== undefined) {
    // an agent -> client REQUEST
    const reply = (result, error) => send(error ? { jsonrpc: '2.0', id: msg.id, error } : { jsonrpc: '2.0', id: msg.id, result });
    if (msg.method === 'session/request_permission') {
      const opts = msg.params.options || []; const allow = opts.find((o) => o.kind === 'allow_once') || opts[0];
      reply({ outcome: { outcome: 'selected', optionId: allow.optionId } });
    } else if (msg.method === 'fs/read_text_file') {
      try { reply({ content: fs.readFileSync(msg.params.path, 'utf8') }); } catch (e) { reply(null, { code: -32603, message: String(e) }); }
    } else if (msg.method === 'fs/write_text_file') {
      try { fs.writeFileSync(msg.params.path, msg.params.content); reply({}); } catch (e) { reply(null, { code: -32603, message: String(e) }); }
    } else if (msg.method === 'terminal/create') {
      reply(null, { code: -32601, message: 'terminal/create declined by this client' });
    } else { reply(null, { code: -32601, message: 'method not supported: ' + msg.method }); }
  }
}
(async () => {
  try {
    const init = await request('initialize', { protocolVersion: 1, clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal }, clientInfo: { name: 'terminal-canvas-probe', version: '0' } });
    const s = await request('session/new', { cwd, mcpServers: [] });
    const r = await request('session/prompt', { sessionId: s.sessionId, prompt: [{ type: 'text', text: prompt }] });
    log.write('## prompt result ' + JSON.stringify(r) + '\n');
    log.write('## init ' + JSON.stringify(init).slice(0, 2000) + '\n');
  } catch (e) { log.write('## ERROR ' + JSON.stringify(e) + '\n'); }
  child.stdin.end(); setTimeout(() => { child.kill(); log.end(); }, 1500);
})();
child.on('exit', (c, sig) => log.write('## exit ' + c + ' ' + sig + '\n'));
