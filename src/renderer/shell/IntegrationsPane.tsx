import { memo, type JSX } from 'react'
import { shellControl } from './shell-control'
import { ChevronLeft, Refresh } from '@renderer/icons'
import type { IntegrationRow } from './integration-model'

/**
 * M89. THE INTEGRATIONS PAGE — the navigator's fifth pane, and the seam
 * derived from Jira and GitHub: one section per service, its state in the
 * one vocabulary, one verb, the audit rows beneath.
 *
 * Presentational by construction like every pane here. Three states per
 * service come from the model (`connected as …`, `not connected — …`,
 * `token rejected — …`), and the audit under each has a named empty arm:
 * a service with no calls yet says so rather than showing a heading over
 * nothing.
 */
export interface IntegrationsPaneProps {
  onToggle: () => void
  rows: readonly IntegrationRow[]
  /** The audit read's three states: asked, failed (with why), answered. */
  audit: 'pending' | 'failed' | 'ready'
  auditFailure?: string
  /** Lines the audit could not read, from main's own count. */
  skipped: number
  /** What the canvas calls a panel (its honest label), for the audit's `who` column; undefined for an id no panel has. */
  panelLabel: (panelId: string) => string | undefined
  onConnect: (service: string) => void
  onVerify: (service: string) => void
  onRefresh: () => void
  /** M102. Which teammates may spend each service, by name — the roster's grants, read here. */
  grants?: Readonly<Record<string, readonly string[]>>
}

function when(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000))
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  return h < 48 ? `${h}h ago` : `${Math.round(h / 24)}d ago`
}

function IntegrationsPaneImpl(props: IntegrationsPaneProps): JSX.Element {
  const now = Date.now()
  return (
    <div className="shell__tree integrations-pane" aria-label="Integrations" data-integrations-pane>
      <div className="shell__region-title shell__region-title--action navigator__header">
        <span className="shell__tree-root">Integrations</span>
        <span className="navigator__header-actions">
          <button type="button" className="shell__region-add icon-button" title="Read again" aria-label="Refresh integrations" data-integrations-refresh {...shellControl(props.onRefresh)}><Refresh /></button>
          <button type="button" className="shell__rail-toggle icon-button" title="Hide the navigator (⌘\\)" aria-label="Hide the navigator" {...shellControl(props.onToggle)}><ChevronLeft /></button>
        </span>
      </div>
      {props.audit === 'pending' ? (
        <p className="rail-empty" data-integrations-arm="reading">reading…</p>
      ) : props.audit === 'failed' ? (
        <p className="rail-empty" data-integrations-arm="failed">the audit could not be read{props.auditFailure === undefined ? '' : ` — ${props.auditFailure}`}</p>
      ) : (
        <div className="integrations-pane__list">
          {props.rows.map((row) => (
            <section key={row.id} className="integration" data-integration={row.id} data-integration-state={row.state}>
              <div className="integration__head">
                <span className="integration__label">{row.label}</span>
                {/* Only the state WORD carries a tone; the rest is a sentence in the
                    text colour, so a hue reads as a status mark and not a highlighted
                    paragraph (M89's critic). */}
                <span className="integration__sentence" data-integration-sentence>
                  <span className="integration__word" data-tone={row.state === 'connected' ? 'idle' : row.state === 'rejected' ? 'exited' : row.state === 'stored' ? 'starting' : 'none'}>{row.word}</span>
                  {row.sentence.startsWith(row.word) ? row.sentence.slice(row.word.length) : ` — ${row.sentence}`}
                </span>
              </div>
              <div className="integration__verbs">
                <button type="button" className="pf__verb pf__verb--word" data-integration-verb
                  title={row.verb === 'verify' ? `Check the ${row.label} token again` : `Add a ${row.label} token (opens the palette's Credentials scope)`}
                  {...shellControl(() => (row.verb === 'verify' ? props.onVerify(row.id) : props.onConnect(row.id)))}>
                  {row.verb === 'verify' ? 'Verify' : row.verb === 'reconnect' ? 'Reconnect…' : 'Connect…'}
                </button>
              </div>
              {/* M102. Who may spend it: the roster's grants, said here so a
                  refused `tc api` has its fix on the same page as the token. */}
              {props.grants !== undefined && (
                <p className="integration__grants" data-integration-grants={row.id}>
                  {(props.grants[row.id] ?? []).length === 0 ? 'granted to no teammate — grant it in the Teammates pane' : `granted to ${(props.grants[row.id] ?? []).join(', ')}`}
                </p>
              )}
              {row.rows.length === 0 ? (
                <p className="integration__empty" data-integration-audit-arm="empty">no calls yet — an agent reaches {row.label} with <code className="integration__code">tc api {row.id} &lt;path&gt;</code></p>
              ) : (
                <ul className="integration__audit" aria-label={`${row.label} calls`}>
                  {row.rows.map((r, i) => (
                    <li key={i} className={`integration__row${r.status === 0 ? ' integration__row--refused' : ''}`} data-integration-row={`${r.method} ${r.path}`}>
                      <span className="integration__row-call">{r.method} {r.path}</span>
                      <span className="integration__row-meta">{r.status === 0 ? `refused${r.reason === undefined || r.reason === 'refused' ? '' : ` — ${r.reason}`}` : String(r.status)} · {r.panelId === undefined ? 'this app' : (props.panelLabel(r.panelId) ?? r.panelId)} · {when(r.at, now)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
          {props.skipped > 0 && <p className="pf__more" data-integrations-skipped>{props.skipped} audit line{props.skipped === 1 ? '' : 's'} could not be read</p>}
          <p className="integration__note">Jira's own panel reads Jira directly; only agents' calls to Jira, and every GitHub read, appear here.</p>
        </div>
      )}
    </div>
  )
}

export const IntegrationsPane = memo(IntegrationsPaneImpl)
