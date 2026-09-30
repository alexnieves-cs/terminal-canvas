import { memo, useEffect, useRef, useState, type JSX } from 'react'
import { shellControl } from './shell-control'
import { ChevronLeft, Refresh, Check, KindGithub, KindJira } from '@renderer/icons'
import type { IntegrationRow } from './integration-model'
import { describeCall } from './integration-model'

/** (this redesign) One glyph per declared service — the same kind glyph a panel of that kind already draws. */
const SERVICE_GLYPH: Record<string, (p: { size?: number }) => JSX.Element> = { github: KindGithub, jira: KindJira }

/**
 * M89 (redesigned). THE INTEGRATIONS PAGE — the navigator's fifth pane,
 * and the seam derived from Jira and GitHub: one COMPACT row per service —
 * icon, account, state, one action — with the account's activity, its
 * permission line and the raw calls one disclosure down, so scanning every
 * service never scrolls past a single call's detail.
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
  /** M102 (this redesign adds `places`). Which teammates may spend each service, and the folders — workspaces — each may spend it from; an empty list is granted the service with nowhere yet to use it. */
  grants?: Readonly<Record<string, readonly { name: string; places: readonly string[] }[]>>
}

function when(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000))
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  return h < 48 ? `${h}h ago` : `${Math.round(h / 24)}d ago`
}

function whenIso(iso: string | undefined, now: number): string {
  if (iso === undefined) return 'never'
  const t = Date.parse(iso)
  return Number.isNaN(t) ? 'never' : when(t, now)
}

function folderName(path: string): string {
  const trimmed = path.replace(/\/+$/, '')
  const last = trimmed.split('/').pop()
  return last === undefined || last === '' ? trimmed : last
}

function permissionLine(grants: readonly { name: string; places: readonly string[] }[] | undefined): string {
  if (grants === undefined || grants.length === 0) return 'usable by no teammate yet — grant it in the Teammates pane'
  return `usable by ${grants.map((g) => `${g.name} (${g.places.length === 0 ? 'no workspace granted' : g.places.map(folderName).join(', ')})`).join('; ')}`
}

function IntegrationsPaneImpl(props: IntegrationsPaneProps): JSX.Element {
  const now = Date.now()
  return (
    <div className="shell__tree integrations-pane" aria-label="Connections" data-integrations-pane>
      <div className="shell__region-title shell__region-title--action navigator__header">
        <span className="shell__tree-root">Connections</span>
        <span className="navigator__header-actions">
          <button type="button" className="shell__region-add icon-button" title="Read again" aria-label="Refresh connections" data-integrations-refresh {...shellControl(props.onRefresh)}><Refresh /></button>
          <button type="button" className="shell__rail-toggle icon-button" title="Hide Connections (⌘\)" aria-label="Hide Connections" {...shellControl(props.onToggle)}><ChevronLeft /></button>
        </span>
      </div>
      {props.audit === 'pending' ? (
        <p className="rail-empty" data-integrations-arm="reading">reading…</p>
      ) : props.audit === 'failed' ? (
        <p className="rail-empty" data-integrations-arm="failed">the audit could not be read{props.auditFailure === undefined ? '' : ` — ${props.auditFailure}`}</p>
      ) : (
        <div className="integrations-pane__list">
          {props.rows.map((row) => (
            <IntegrationCard
              key={row.id}
              row={row}
              now={now}
              grants={props.grants?.[row.id]}
              panelLabel={props.panelLabel}
              onConnect={props.onConnect}
              onVerify={props.onVerify}
            />
          ))}
          {props.skipped > 0 && <p className="pf__more" data-integrations-skipped>{props.skipped} audit line{props.skipped === 1 ? '' : 's'} could not be read</p>}
          <p className="integration__note">Jira's own panel reads Jira directly; only agents' calls to Jira, and every GitHub read, appear here.</p>
        </div>
      )}
    </div>
  )
}

function IntegrationCard({ row, now, grants, panelLabel, onConnect, onVerify }: {
  row: IntegrationRow
  now: number
  grants: readonly { name: string; places: readonly string[] }[] | undefined
  panelLabel: (panelId: string) => string | undefined
  onConnect: (service: string) => void
  onVerify: (service: string) => void
}): JSX.Element {
  const tone = row.state === 'connected' ? 'idle' : row.state === 'rejected' ? 'exited' : row.state === 'stored' ? 'starting' : 'none'
  const Glyph = SERVICE_GLYPH[row.id]
  // (this redesign) A brief confirmation on the transition INTO `connected` — the
  // success transition the redesign asked for. Tracked by ref rather than
  // diffed from a previous-props comparison: this card only ever sees ITS
  // own row, so the ref is the whole history a flash needs.
  const prevState = useRef(row.state)
  const [justVerified, setJustVerified] = useState(false)
  useEffect(() => {
    if (prevState.current !== 'connected' && row.state === 'connected') {
      setJustVerified(true)
      const t = setTimeout(() => setJustVerified(false), 2200)
      prevState.current = row.state
      return () => clearTimeout(t)
    }
    prevState.current = row.state
  }, [row.state])

  return (
    <section className="integration" data-integration={row.id} data-integration-state={row.state} {...(justVerified ? { 'data-integration-fresh': '' } : {})}>
      <div className="integration__head">
        {Glyph !== undefined && <span className="integration__icon" data-tone={tone} aria-hidden="true"><Glyph size={16} /></span>}
        <div className="integration__identity">
          <span className="integration__label">{row.label}</span>
          {/* (this redesign) Suppressed when `who` merely echoes the service's own label
              — the pre-verify fallback `credential-schema.ts` documents,
              never a real account — so the row does not repeat "GitHub"
              under "GitHub" for a token that has not verified yet. */}
          {row.who !== undefined && row.who !== row.label && <span className="integration__account">{row.who}</span>}
        </div>
        <span className="integration__pill" data-tone={tone} data-integration-pill>
          {justVerified ? <><Check size={11} /> verified</> : row.word}
        </span>
        <button
          type="button"
          className="integration__cta"
          data-integration-verb
          data-cta={row.verb === 'reconnect' ? 'primary' : 'secondary'}
          title={row.verb === 'verify' ? `Check the ${row.label} token again` : `Add a ${row.label} token (opens the palette's Credentials scope)`}
          {...shellControl(() => (row.verb === 'verify' ? onVerify(row.id) : onConnect(row.id)))}
        >
          {row.verb === 'verify' ? 'Verify' : row.verb === 'reconnect' ? 'Reconnect…' : 'Connect…'}
        </button>
      </div>
      {/*
        (this redesign) The one sentence every door shares, now the fix line rather than
        a red inline paragraph: on `rejected` it sits inside a BOUNDED error
        state (a tinted, bordered box, role="alert") instead of merely
        colouring the word inline — the exact class of thing #17 asked to
        replace. Every other state keeps it as a plain caption; it is the
        only place a first-time `not-connected` row says WHERE to fix it
        (⌘K › Credentials), so it stays visible rather than folding into the
        pill above.
      */}
      {row.state === 'rejected' ? (
        <p className="integration__error" role="alert" data-integration-sentence>
          <span className="integration__word" data-tone={tone}>{row.word}</span>
          {row.sentence.startsWith(row.word) ? row.sentence.slice(row.word.length) : ` — ${row.sentence}`}
          {' '}— Reconnect to add a new one; nothing that calls {row.label} will work until then.
        </p>
      ) : (
        <p className="integration__sentence" data-integration-sentence>
          <span className="integration__word" data-tone={tone}>{row.word}</span>
          {row.sentence.startsWith(row.word) ? row.sentence.slice(row.word.length) : ` — ${row.sentence}`}
        </p>
      )}
      <p className="integration__permission" data-integration-grants={row.id}>{permissionLine(grants)}</p>
      <p className="integration__meta-line" data-integration-meta={row.id}>
        Last verified {whenIso(row.verifiedAt, now)} · Last used {row.lastUsedAt === undefined ? 'never' : when(row.lastUsedAt, now)}
      </p>
      <details className="integration__details">
        <summary className="integration__details-summary">Activity{row.rows.length > 0 ? ` (${row.rows.length})` : ''}</summary>
        {row.rows.length === 0 ? (
          <p className="integration__empty" data-integration-audit-arm="empty">no calls yet — an agent reaches {row.label} with <code className="integration__code">tc api {row.id} &lt;path&gt;</code></p>
        ) : (
          <>
            <ul className="integration__activity" aria-label={`${row.label} activity`}>
              {row.rows.map((r, i) => (
                <li key={i} className={`integration__activity-row${r.status === 0 ? ' integration__activity-row--refused' : ''}`}>
                  <span className="integration__activity-text">{describeCall(row.id, r)}</span>
                  <span className="integration__row-meta">{r.panelId === undefined ? 'this app' : (panelLabel(r.panelId) ?? r.panelId)} · {when(r.at, now)}</span>
                </li>
              ))}
            </ul>
            {/* Raw request details, behind their own disclosure — for debugging, never the default read. */}
            <details className="integration__raw">
              <summary>Raw requests</summary>
              <ul className="integration__audit" aria-label={`${row.label} raw calls`}>
                {row.rows.map((r, i) => (
                  <li key={i} className={`integration__row${r.status === 0 ? ' integration__row--refused' : ''}`} data-integration-row={`${r.method} ${r.path}`}>
                    <span className="integration__row-call">{r.method} {r.path}</span>
                    <span className="integration__row-meta">{r.status === 0 ? `refused${r.reason === undefined || r.reason === 'refused' ? '' : ` — ${r.reason}`}` : String(r.status)} · {r.panelId === undefined ? 'this app' : (panelLabel(r.panelId) ?? r.panelId)} · {when(r.at, now)}</span>
                  </li>
                ))}
              </ul>
            </details>
          </>
        )}
      </details>
    </section>
  )
}

export const IntegrationsPane = memo(IntegrationsPaneImpl)
