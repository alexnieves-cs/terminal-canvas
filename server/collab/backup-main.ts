/**
 * M347. `node backup.cjs <command>` on the VM (deploy/tc-collab-backup.service):
 *
 *   dump <dir> [--keep N]            write <dir>/collab-<utc stamp>.jsonl.gz (0600), with
 *                                    each room's snapshots, then keep the newest N dumps
 *                                    (default 14 — two weeks of the daily timer)
 *   restore <file> [--room R] [--force]
 *                                    put rooms back from a dump (backup.ts says when)
 *   list <file>                      the rooms a dump holds, and their sizes
 *
 * Reads TC_COLLAB_DATABASE_URL, the collab server's own. A failure exits 1,
 * logs a JSON line (log.ts), and posts TC_ALERT_WEBHOOK when it is set — a
 * backup that fails silently is the backup nobody has.
 */
import { chmodSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { hostname } from 'node:os'
import { join } from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'
import { Pool } from 'pg'
import { dumpRooms, restoreRooms, type BackupLine } from './backup'
import { alertBody } from './health'
import { createLog } from './log'
import { createPgDocStore } from './persistence'

const log = createLog()
const args = process.argv.slice(2)
const flag = (name: string): string | undefined => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined }

async function alert(text: string): Promise<void> {
  const hook = process.env['TC_ALERT_WEBHOOK'] ?? ''
  if (hook === '') return
  try { await fetch(hook, { method: 'POST', headers: { 'content-type': 'application/json' }, body: alertBody(text, hostname()) }) } catch (e) { log('alert.failed', { error: String(e) }) }
}

async function main(): Promise<void> {
  const [command, target] = args
  if (command === 'list' && target !== undefined) {
    for (const raw of gunzipSync(readFileSync(target)).toString('utf8').split('\n')) {
      if (raw.trim() === '') continue
      const line = JSON.parse(raw) as BackupLine
      if (line.kind === 'header') console.log(`taken ${line.takenAt} · ${line.rooms} rooms`)
      else console.log(`${line.kind === 'room' ? 'room    ' : 'snapshot'} ${line.name} ${Buffer.from(line.state, 'base64').length} bytes ${line.kind === 'room' ? line.updatedAt : `${line.takenAt} ${line.reason}`}`)
    }
    return
  }
  const url = process.env['TC_COLLAB_DATABASE_URL'] ?? ''
  if (url === '') throw new Error('set TC_COLLAB_DATABASE_URL (the collab server\'s own)')
  const pool = new Pool({ connectionString: url, max: 2 })
  try {
    const store = createPgDocStore((sql, params) => pool.query(sql, params))
    if (command === 'dump' && target !== undefined) {
      const keep = Math.max(1, Number(flag('--keep') ?? '14'))
      mkdirSync(target, { recursive: true, mode: 0o700 })
      const lines: string[] = []
      const t0 = Date.now()
      const result = await dumpRooms(store, (line) => lines.push(line), { snapshots: true })
      const file = join(target, `collab-${new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, 'Z')}.jsonl.gz`)
      writeFileSync(file, gzipSync(lines.join('\n') + '\n'), { mode: 0o600 })
      chmodSync(file, 0o600)
      const dumps = readdirSync(target).filter((n) => /^collab-\d{8}T\d{6}Z\.jsonl\.gz$/.test(n)).sort().reverse()
      for (const old of dumps.slice(keep)) rmSync(join(target, old))
      log('backup.done', { file, rooms: result.rooms, snapshots: result.snapshots, bytes: result.bytes, pruned: Math.max(0, dumps.length - keep), ms: Date.now() - t0 })
      return
    }
    if (command === 'restore' && target !== undefined) {
      const room = flag('--room')
      const result = await restoreRooms(store, gunzipSync(readFileSync(target)).toString('utf8').split('\n'), { ...(room === undefined ? {} : { room }), force: args.includes('--force') })
      log('restore.done', { file: target, restored: result.restored, skipped: result.skipped })
      for (const s of result.skipped) console.error(`skipped ${s.name}: ${s.why}`)
      return
    }
    throw new Error('usage: backup.cjs dump <dir> [--keep N] | restore <file> [--room R] [--force] | list <file>')
  } finally {
    await pool.end()
  }
}

main().catch(async (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  log('backup.failed', { error: message })
  await alert(`backup failed: ${message}`)
  process.exit(1)
})
