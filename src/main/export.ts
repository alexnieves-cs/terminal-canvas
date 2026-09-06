/**
 * M58 — the two doors out: a panel's text, and a picture of the canvas.
 *
 * Both run here against injected functions — the save dialog, the frame
 * capture, the write — so verify:file drives every arm against a scratch
 * log with a fake dialog. M112: text comes from the DURABLE log when
 * persistence is on and has bytes; otherwise from the live xterm buffer the
 * renderer serialized and handed over on the request — the second source
 * that lets a panel export with `scrollback.persist` off, rather than
 * answering `off` for text the user is looking at right now. It is stripped
 * of ANSI and scrubbed by the same redactor the diagnostics bundle uses, and
 * the result carries the redaction COUNT and which source won, because a
 * file that quietly differs from the screen is the failure #31 is about.
 * Cancel writes nothing; off (persistence off AND no buffer) reads nothing.
 */
import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { ScrollbackLog } from './scrollback-log'
import { stripAnsi } from '../shared/ansi'
import { outward } from '../shared/outward'
import type { CanvasPngExportResult, PanelTextExportRequest, PanelTextExportResult } from '../shared/export'

export interface ExporterDeps {
  log: Pick<ScrollbackLog, 'readAll'>
  persistOn: () => boolean
  /** The save dialog: a path, or null when the user cancelled. */
  askPath: (suggested: string) => Promise<string | null>
  /** The composited frame as PNG bytes. */
  capture: () => Promise<Buffer>
  /** Injected so the plain-node tier can count writes; the default is atomic. */
  write?: (path: string, data: string | Buffer) => void
  now?: () => Date
}

export interface Exporters {
  panelText(req: PanelTextExportRequest): Promise<PanelTextExportResult>
  canvasPng(): Promise<CanvasPngExportResult>
}

const atomicWrite = (path: string, data: string | Buffer): void => {
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.tmp`
  writeFileSync(tmp, data, { mode: 0o600 })
  renameSync(tmp, path)
}

const stamp = (d: Date): string => d.toISOString().replace(/[:.]/g, '-').slice(0, 19)

export const INERT_EXPORTERS: Exporters = {
  panelText: async () => ({ kind: 'failed', reason: 'export is not wired' }),
  canvasPng: async () => ({ kind: 'failed', reason: 'export is not wired' })
}

export function createExporters(deps: ExporterDeps): Exporters {
  const write = deps.write ?? atomicWrite
  const now = deps.now ?? (() => new Date())
  return {
    async panelText(req) {
      const { panelId, buffer } = req
      const on = deps.persistOn()
      let raw = ''
      let source: 'log' | 'buffer' | null = null
      if (on) {
        try {
          raw = await deps.log.readAll(panelId)
        } catch (error: unknown) {
          return { kind: 'failed', reason: error instanceof Error ? error.message : String(error) }
        }
        if (raw.length > 0) source = 'log'
      }
      // M112. The buffer is the second source: the log when persistence is on
      // and has bytes; otherwise what the renderer serialized from the live
      // terminal. `off` is reserved for persistence off AND no buffer — a
      // never-spawned card with the log switched off — so its sentence can
      // name the fix without lying about text that was on screen.
      if (source === null && typeof buffer === 'string' && buffer.length > 0) {
        raw = buffer
        source = 'buffer'
      }
      if (source === null) return on || typeof buffer === 'string' ? { kind: 'empty' } : { kind: 'off' }
      const stripped = stripAnsi(raw)
      // M96. Through the ONE outward gate (the scrubber plus its note).
      const { text, redacted: count } = outward(stripped, `panel ${panelId}`)
      const path = await deps.askPath(`${panelId}-${stamp(now())}.txt`)
      if (path === null) return { kind: 'cancelled' }
      try {
        write(path, text)
      } catch (error: unknown) {
        return { kind: 'failed', reason: error instanceof Error ? error.message : String(error) }
      }
      const lines = text.split('\n').filter((l) => l.length > 0).length
      return { kind: 'written', path, lines, redacted: count, source }
    },
    async canvasPng() {
      let bytes: Buffer
      try {
        bytes = await deps.capture()
      } catch (error: unknown) {
        return { kind: 'failed', reason: error instanceof Error ? error.message : String(error) }
      }
      const path = await deps.askPath(`canvas-${stamp(now())}.png`)
      if (path === null) return { kind: 'cancelled' }
      try {
        write(path, bytes)
      } catch (error: unknown) {
        return { kind: 'failed', reason: error instanceof Error ? error.message : String(error) }
      }
      return { kind: 'written', path }
    }
  }
}
