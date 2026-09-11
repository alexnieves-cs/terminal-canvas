import { useEffect, useState } from 'react'
import type { PackFile, PackRequirements } from '@shared/pack'
import type { PackAddResult } from '@shared/ipc-contract'

/**
 * M251. THE PACK PREVIEW — what a pack holds and what it needs, shown BEFORE
 * anything is added. Main already holds the parse under `token`; Add sends
 * only that token, so this sheet can confirm what it shows and nothing else.
 *
 * Unmet requirements EXPLAIN and never block: nothing a pack adds runs (every
 * workflow and preset arrives unread), so a missing credential is a fact
 * about what will not work yet, not a reason to refuse the add.
 *
 * It lives inside the palette's own container (`.palette`), which already
 * carries the overlay's position, elevation and tokens, with the spawn
 * sheet's `.sheet` grammar inside — a dialog of its own would be a second
 * overlay style to keep in step.
 */

export interface PackPreviewState {
  token: string
  path: string
  pack: PackFile
  warnings: string[]
  requirements: PackRequirements
}

const KIND_WORDS: Record<string, string> = { workflow: 'Workflows', prompt: 'Prompts', preset: 'Presets' }

export function PackPreview({ preview, onAdd, onClose }: { preview: PackPreviewState; onAdd: (token: string) => Promise<PackAddResult>; onClose: () => void }) {
  const [result, setResult] = useState<PackAddResult | null>(null)
  const [busy, setBusy] = useState(false)
  const { manifest } = preview.pack
  const total = manifest.contents.length
  const unmet = preview.requirements.credentials.filter((r) => r.sentence !== undefined)
  const tools = preview.requirements.tools.filter((t) => t.sentence !== undefined)

  // Escape leaves without adding — the same key that closes the palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') { e.preventDefault(); onClose() } }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const add = async (): Promise<void> => {
    setBusy(true)
    setResult(await onAdd(preview.token))
    setBusy(false)
  }

  return (
    <div className="palette pack-preview" role="dialog" aria-label={`Pack ${manifest.name}`} data-pack-preview>
      <div className="sheet">
        <div className="sheet__title">{manifest.name} <span className="pack-preview__version">{manifest.version}</span></div>
        {manifest.description !== undefined && <p className="pack-preview__line">{manifest.description}</p>}

        {(['workflow', 'prompt', 'preset'] as const).map((kind) => {
          const items = manifest.contents.filter((c) => c.kind === kind)
          if (items.length === 0) return null
          return (
            <div className="sheet__field sheet__field--where" key={kind} data-pack-contents={kind}>
              <span className="sheet__label">{KIND_WORDS[kind]}</span>
              <ul className="pack-preview__list">{items.map((c) => <li key={c.id}>{c.name}</li>)}</ul>
            </div>
          )
        })}

        {(unmet.length > 0 || tools.length > 0) && (
          <div className="sheet__field sheet__field--where" data-pack-needs>
            <span className="sheet__label">Needs</span>
            <ul className="pack-preview__list">
              {unmet.map((r) => <li key={`${r.service}.${r.field}`} data-pack-need={r.state}>{r.sentence}</li>)}
              {tools.map((t) => <li key={t.command} data-pack-need={t.state}>{t.sentence}</li>)}
            </ul>
          </div>
        )}

        {preview.warnings.length > 0 && (
          <div className="sheet__field sheet__field--where" data-pack-warnings>
            <span className="sheet__label">Warnings</span>
            <ul className="pack-preview__list">{preview.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
          </div>
        )}

        {/* Inert, said once and plainly: this is the promise the add keeps. */}
        <p className="pack-preview__line">Nothing in a pack runs when it is added — every workflow and preset arrives unread, and is refused until you have read it.</p>

        {result !== null && <p className="pack-preview__line" data-pack-result={result.kind}>{result.kind === 'added' ? result.sentence : result.reason}</p>}

        <div className="pack-preview__foot">
          {result === null
            ? <>
                <button type="button" className="pack-preview__button" data-pack-cancel onClick={onClose}>Cancel</button>
                <button type="button" className="pack-preview__button pack-preview__button--primary" data-pack-add disabled={busy || total === 0} onClick={() => { void add() }}>
                  {total === 0 ? 'Nothing to add' : `Add ${total} object${total === 1 ? '' : 's'}`}
                </button>
              </>
            : <button type="button" className="pack-preview__button pack-preview__button--primary" data-pack-close onClick={onClose}>Close</button>}
        </div>
      </div>
    </div>
  )
}
