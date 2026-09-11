import { readFileSync, writeFileSync } from 'node:fs'
import { basename } from 'node:path'
import { randomUUID } from 'node:crypto'
import { buildPack, packRequirements, packSentence, parsePack, remapPack, type PackParse } from '../shared/pack'
import type { CredentialMeta } from '../shared/credential-schema'
import type { PackAddResult, PackReadResult, PackWriteResult } from '../shared/ipc-contract'
import type { LayoutStore } from './layout-store'
import { mintPresetId, mintPromptId } from './presets'

/**
 * M253. A PACK'S THREE DOORS, as one factory production and the panels
 * harness both build — so `verify:panels:product pack.import.*` drives THIS
 * code, not a harness copy that would prove the harness right and production
 * still unchecked (the rule `pushDefaultPreset` lives in presets.ts for).
 *
 * The choosers are injected: production asks the system's own dialogs, the
 * harness answers a path it planted. Everything else — the held parse, the
 * token, the requirement probe, the minting and the build — is here once.
 */

/** What a chooser answered: a path, a cancelled dialog (never a refusal), or why it could not ask. */
export type Chosen = { kind: 'path'; path: string } | { kind: 'cancelled' } | { kind: 'refused'; reason: string }

export interface PackHandlerDeps {
  store: Pick<LayoutStore, 'presets' | 'prompts' | 'templates' | 'routines' | 'saveTemplate' | 'addPrompt' | 'addPreset'>
  /** Metadata only — `CredentialMeta` has no cipher and no token, so no plaintext reader is added. */
  credentials: () => CredentialMeta[]
  /** The login-PATH probe the preset availability rows already use; null is "not found". */
  which: (command: string) => string | null
  chooseOpen: () => Promise<Chosen>
  chooseSave: (suggested: string) => Promise<Chosen>
  /** The menu labels and disables an unread preset, so an add that made presets must rebuild it. */
  afterPresetChange: () => void
  app: string
}

export interface PackHandlers {
  read(req: { path?: string }): Promise<PackReadResult>
  add(req: { token: string }): Promise<PackAddResult>
  write(req: { path?: string; name: string; suggested?: string }): Promise<PackWriteResult>
}

const named = (req: { path?: string } | undefined): string | undefined =>
  typeof req?.path === 'string' && req.path.trim() !== '' ? req.path : undefined

export function createPackHandlers(deps: PackHandlerDeps): PackHandlers {
  /**
   * The pack a person is looking at, held under the token `read` answered.
   * `add` takes only the token, so what is added is exactly what was parsed
   * and shown — the renderer has no way to hand main a different payload.
   * One at a time: a second read replaces the first, and an add consumes its
   * token, so a stale preview cannot add twice.
   */
  const pending = new Map<string, PackParse>()

  return {
    async read(req) {
      let path = named(req)
      if (path === undefined) {
        const chosen = await deps.chooseOpen()
        if (chosen.kind !== 'path') return chosen
        path = chosen.path
      }
      let text: string
      try {
        text = readFileSync(path, 'utf8')
      } catch (error) {
        return { kind: 'refused', reason: `that file could not be read: ${error instanceof Error ? error.message : String(error)}` }
      }
      const parse = parsePack(text)
      const token = randomUUID()
      pending.clear()
      pending.set(token, parse)
      if (parse.kind !== 'pack') return { kind: 'read', path, token, parse }
      const tools: Record<string, boolean> = {}
      for (const t of parse.pack.manifest.tools ?? []) tools[t.command] = deps.which(t.command) !== null
      return { kind: 'read', path, token, parse, requirements: packRequirements(parse.pack.manifest, deps.credentials(), tools) }
    },

    async add(req) {
      const token = typeof req?.token === 'string' ? req.token : ''
      const held = pending.get(token)
      if (held === undefined) return { kind: 'refused', reason: 'that pack is no longer open — read it again' }
      pending.delete(token)
      if (held.kind !== 'pack') return { kind: 'refused', reason: held.reason }
      const fresh = (): string => randomUUID().replace(/-/g, '').slice(0, 12)
      const pack = remapPack(held.pack, (prefix) => `${prefix}${fresh()}`)
      let workflows = 0
      for (const template of pack.templates) if (deps.store.saveTemplate(template).kind === 'saved') workflows += 1
      // Minted against the store each time, so a preset can never take a
      // built-in's id and a prompt never collides with one already saved.
      for (const prompt of pack.prompts) deps.store.addPrompt({ ...prompt, id: mintPromptId(deps.store.prompts()) })
      for (const preset of pack.presets) deps.store.addPreset({ ...preset, id: mintPresetId(deps.store.presets()) })
      if (pack.presets.length > 0) deps.afterPresetChange()
      return { kind: 'added', sentence: packSentence(pack), workflows, prompts: pack.prompts.length, presets: pack.presets.length }
    },

    async write(req) {
      const name = typeof req?.name === 'string' ? req.name.trim() : ''
      if (name === '') return { kind: 'refused', reason: 'a pack needs a name — it is the first thing the person you send it to reads' }
      // Built HERE from the store: the renderer's preset rows carry no args,
      // env or options, so a pack it assembled would be a lossy copy of a
      // record only main holds. Tools are the presets' own command words — a
      // pack that spawns `gh` needs `gh`, and says so on the other machine.
      const presets = deps.store.presets()
      const tools = [...new Set(presets.map((p) => (p.command === undefined ? '' : basename(p.command))).filter((c) => /^[A-Za-z0-9._-]+$/.test(c)))].map((command) => ({ command }))
      const file = buildPack({
        manifest: { name, version: '1.0.0', ...(tools.length === 0 ? {} : { tools }) },
        templates: deps.store.templates(),
        prompts: deps.store.prompts(),
        presets,
        app: deps.app,
        now: Date.now(),
        ...(deps.store.routines().length > 0 ? { hasRoutines: true } : {})
      })
      if (file.manifest.contents.length === 0) return { kind: 'refused', reason: 'there is nothing to put in a pack yet — save a workflow, a prompt or a preset first' }
      let path = named(req)
      if (path === undefined) {
        const suggested = typeof req?.suggested === 'string' && req.suggested.trim() !== '' ? req.suggested : `${name.replace(/[^a-zA-Z0-9-_ ]/g, '') || 'pack'}.tcpack`
        const chosen = await deps.chooseSave(suggested)
        if (chosen.kind !== 'path') return chosen
        path = chosen.path
      }
      const text = `${JSON.stringify(file, null, 2)}\n`
      try {
        writeFileSync(path, text, 'utf8')
      } catch (error) {
        return { kind: 'refused', reason: `that file could not be written: ${error instanceof Error ? error.message : String(error)}` }
      }
      return { kind: 'written', path, bytes: Buffer.byteLength(text, 'utf8'), sentence: packSentence(file) }
    }
  }
}
