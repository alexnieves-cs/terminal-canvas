/* M619. Split out of OrchestrationView.tsx: the selected task's detail parts —
   its criteria, the follow-up box and the brief editor. The editor patches
   the work item and launches nothing (verify:orchestration workbench.2). */
import { useEffect, useRef, useState, type JSX } from 'react'
import type { PersistedWorkItem } from '@shared/work-items'


/** M294. A platform's label plate: its backing width, height and the gap above the diamond's top tip. */

/**
 * M299. Acceptance criteria as rows. The marker is a neutral ring, never a tick: no
 * criterion carries a verdict, and drawing one would claim a check that was not made.
 */
export function OrchCriteria({ criteria }: { criteria: readonly string[] }): JSX.Element {
  return (
    <div className="orch__criteria" data-orch-criteria={criteria.length}>
      <div className="orch__section-title">Acceptance criteria</div>
      <ul className="orch__criteria-list" title="Written by a person on the task; no verdict is recorded per criterion — the workbench's Checks tab reads the ledger">
        {criteria.map((c, i) => <li key={i} className="orch__criterion"><span className="orch__criterion-mark" aria-hidden="true" />{c}</li>)}
      </ul>
    </div>
  )
}

/**
 * M299. The follow-up composer: one line to the selected chat through the SAME
 * door its canvas composer uses (`onSend`, wired by the canvas), never a second path. The
 * draft clears only on an accepted send; a refusal is shown beside the field in main's
 * own sentence. The menu's Paste arrives as `edit:paste` (not a native paste — the
 * gotcha in CLAUDE.md), so the field subscribes while it has focus, as Palette does.
 */
export function OrchFollowUp({ panelId, title, onSend }: { panelId: string; title: string; onSend: (panelId: string, text: string) => Promise<string | null> }): JSX.Element {
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  useEffect(() => window.canvas.edit.onPaste((text) => {
    if (document.activeElement !== inputRef.current) return
    setDraft((d) => d + text)
  }), [])
  const send = (): void => {
    const text = draft.trim()
    if (text === '' || busy) return
    setBusy(true)
    setRefusal(null)
    void onSend(panelId, text).then((why) => {
      setBusy(false)
      if (why === null) setDraft('')
      else setRefusal(why)
    })
  }
  return (
    <form className="orch__followup" data-orch-followup={panelId} onSubmit={(e) => { e.preventDefault(); send() }}>
      <input
        ref={inputRef}
        data-edit-owner
        type="text"
        className="orch__followup-input"
        data-orch-followup-input
        value={draft}
        placeholder={`Follow up with ${title}…`}
        aria-label={`Follow up with ${title}`}
        disabled={busy}
        onChange={(e) => setDraft(e.target.value)}
      />
      <button type="submit" className="orch__mini orch__followup-send" data-orch-followup-send disabled={busy || draft.trim() === ''}>Send</button>
      {refusal !== null && <p className="orch__caption orch__followup-refusal" role="status" data-orch-followup-refusal>{refusal}</p>}
    </form>
  )
}

/**
 * M287. Two fields, saved on blur or Enter-less commit — never on every
 * keystroke, so a half-typed brief is not written twenty times, and never
 * sent anywhere: the only call out of here is `onPatchWorkItem`.
 */
export function OrchBriefEditor({ itemId, brief, criteria, onPatchWorkItem }: {
  itemId: string
  brief: string
  criteria: readonly string[]
  onPatchWorkItem: (itemId: string, fields: Partial<PersistedWorkItem>) => void
}): JSX.Element {
  const [briefDraft, setBriefDraft] = useState(brief)
  const [criteriaDraft, setCriteriaDraft] = useState(criteria.join('\n'))
  const commitBrief = (): void => { if (briefDraft.trim() !== brief) onPatchWorkItem(itemId, { brief: briefDraft.trim() }) }
  const commitCriteria = (): void => {
    const next = criteriaDraft.split('\n').map((c) => c.trim()).filter((c) => c !== '')
    if (next.join('\n') !== criteria.join('\n')) onPatchWorkItem(itemId, { criteria: next })
  }
  // A <details>, FOLDED at rest (M299; M287 opened it when something was written, and its
  // two textareas then repeated the criteria the card now shows as rows). The summary says
  // whether anything is written; the fields open on demand.
  return (
    <details className="orch__brief" data-orch-brief-editor={itemId}>
      <summary className="orch__brief-summary orch__brief-summary--quiet">{brief === '' && criteria.length === 0 ? 'Brief & acceptance criteria · none yet' : 'Edit brief & acceptance criteria'}</summary>
      <label className="orch__brief-field">
        <span className="orch__section-title">Brief</span>
        <textarea className="orch__brief-input" data-orch-brief rows={2} value={briefDraft} placeholder="What should be done, in your words. Editing this starts nothing."
          onChange={(e) => setBriefDraft(e.target.value)} onBlur={commitBrief} />
      </label>
      <label className="orch__brief-field">
        <span className="orch__section-title">Acceptance criteria</span>
        <textarea className="orch__brief-input" data-orch-criteria rows={2} value={criteriaDraft} placeholder="One per line."
          onChange={(e) => setCriteriaDraft(e.target.value)} onBlur={commitCriteria} />
      </label>
    </details>
  )
}

