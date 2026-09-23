import { useEffect, useRef, useState, type JSX, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { SetupReadResult } from '@shared/ipc-contract'
import { isEmptySetup, servicesFromText, servicesText, SETUP_PORT_BASE, SETUP_PORT_SPAN, type RepoSetup } from '@shared/repo-setup'
import { shortPath } from './panel-name'

/**
 * M312. THE REPOSITORY SETUP SHEET — how this repository installs, serves,
 * checks and previews, written once so every new lane inherits it.
 *
 * It opens on the saved record, or on a DRAFT detected from the repository's
 * own files, and says which: a draft has run nothing, and saving is the
 * person's decision that these commands may run in every new lane before its
 * agent starts (repo-setup.ts's first rule). Same overlay and keyboard rules
 * as the other sheets — Escape cancels, ⌘↵ saves (a plain Enter is a newline
 * in these multi-line fields).
 */
export interface SetupSheetModel {
  read: SetupReadResult
  save(setup: RepoSetup): Promise<{ ok: true } | { ok: false; reason: string }>
}

const lines = (t: string): string[] => t.split('\n').map((l) => l.trim()).filter((l) => l !== '')

export function SetupSheet({ model, onDone, onCancel }: { model: SetupSheetModel; onDone(): void; onCancel(): void }): JSX.Element {
  const initial = model.read.kind === 'not-a-repo' ? null : model.read.setup
  const [install, setInstall] = useState((initial?.install ?? []).join('\n'))
  const [services, setServices] = useState(servicesText(initial?.services ?? []))
  const [checks, setChecks] = useState((initial?.checks ?? []).join('\n'))
  const [previewPath, setPreviewPath] = useState(initial?.previewAt?.path ?? '/')
  const [base, setBase] = useState(String(initial?.ports.base ?? SETUP_PORT_BASE))
  const [refusal, setRefusal] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const first = useRef<HTMLTextAreaElement | null>(null)
  useEffect(() => { first.current?.focus({ preventScroll: true }) }, [])

  if (initial === null) {
    return (
      <div className="sheet" data-setup-sheet role="form" aria-label="Repository setup" onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); onCancel() } }}>
        <p className="sheet__refusal" role="alert">This folder is not inside a git repository, so there is no setup to save for it.</p>
        <div className="sheet__actions"><button type="button" className="sheet__button" onClick={onCancel}>Close</button></div>
      </div>
    )
  }

  const svc = servicesFromText(services)
  const draft: RepoSetup = {
    v: 1,
    root: initial.root,
    install: lines(install),
    services: svc,
    checks: lines(checks),
    ...(svc.length > 0 ? { previewAt: { service: svc[0]!.name, path: previewPath.startsWith('/') ? previewPath : `/${previewPath}` } } : {}),
    ports: { base: Number.isInteger(Number(base)) ? Number(base) : SETUP_PORT_BASE, span: initial.ports.span ?? SETUP_PORT_SPAN },
    updatedAt: initial.updatedAt
  }
  const submit = (): void => {
    if (busy) return
    setBusy(true); setRefusal(null)
    void model.save(draft).then((r) => {
      setBusy(false)
      if (!r.ok) { setRefusal(r.reason); return }
      onDone()
    })
  }
  const onKey = (e: ReactKeyboardEvent<HTMLElement>): void => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCancel(); return }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); e.stopPropagation(); submit() }
    // A plain Enter is a newline in a field; it must not reach the palette's own Enter.
    if (e.key === 'Enter') e.stopPropagation()
  }
  const area = (label: string, value: string, set: (v: string) => void, placeholder: string, attr: string, ref?: (el: HTMLTextAreaElement | null) => void): JSX.Element => (
    <label className="sheet__field">
      <span className="sheet__label">{label}</span>
      <textarea ref={ref} className="sheet__input sheet__textarea sheet__input--mono" rows={2} spellCheck={false} value={value} placeholder={placeholder}
        {...{ [attr]: '' }} onChange={(e) => { set(e.target.value); setRefusal(null) }} />
    </label>
  )

  return (
    <div className="sheet" data-setup-sheet role="form" aria-label="Repository setup" onKeyDown={onKey}>
      <div className="sheet__field sheet__field--how">
        <span className="sheet__label">Repository</span>
        <span className="sheet__defaults" title={initial.root}>{shortPath(initial.root, 2)}</span>
      </div>
      <p className="sheet__hint" data-setup-state={model.read.kind}>
        {model.read.kind === 'draft'
          ? 'Detected from the repository’s own files — nothing has run. Saving lets these commands run in every new lane before its agent starts.'
          : 'Saved. Every new lane of this repository is prepared with this before its agent starts; a failed step stops the start and shows its output.'}
      </p>
      {area('Install', install, setInstall, 'one command per line — e.g. npm ci', 'data-setup-install', (el) => { first.current = el })}
      {area('Services', services, setServices, 'name: command, one per line — e.g. web: npm run dev', 'data-setup-services')}
      {area('Checks', checks, setChecks, 'what decides “done” — e.g. npm test', 'data-setup-checks')}
      <label className="sheet__field">
        <span className="sheet__label">Preview</span>
        <input className="sheet__input sheet__input--mono" data-setup-preview value={previewPath} spellCheck={false} disabled={svc.length === 0}
          placeholder="/" onChange={(e) => setPreviewPath(e.target.value)} />
      </label>
      <label className="sheet__field">
        <span className="sheet__label">Ports from</span>
        <input className="sheet__input sheet__input--mono" data-setup-ports value={base} inputMode="numeric" spellCheck={false}
          onChange={(e) => setBase(e.target.value.replace(/[^0-9]/g, ''))} />
      </label>
      <div className="sheet__field sheet__field--how">
        <span className="sheet__label">Each lane</span>
        <span className="sheet__defaults" data-setup-port-line>
          {svc.length === 0 ? 'no services — no ports are allocated' : `gets its own ${draft.ports.span} ports from ${draft.ports.base + draft.ports.span} up (the main tree keeps ${draft.ports.base}); ${svc[0]!.name} is PORT, each service TC_PORT_<NAME>`}
        </span>
      </div>
      <div className="sheet__foot">
        {refusal !== null && <span className="sheet__refusal" role="alert">{refusal}</span>}
        {isEmptySetup(draft) && <span className="sheet__hint">An empty setup saves nothing a lane can use.</span>}
        <div className="sheet__actions">
          <span className="sheet__keys">⌘↵ · esc</span>
          <button type="button" className="sheet__button" data-setup-cancel onMouseDown={(e) => e.preventDefault()} onClick={onCancel}>Cancel</button>
          <button type="button" className="sheet__button is-primary" data-setup-save disabled={busy}
            onMouseDown={(e) => e.preventDefault()} onClick={submit}>{busy ? 'Saving…' : 'Save setup'}</button>
        </div>
      </div>
    </div>
  )
}
