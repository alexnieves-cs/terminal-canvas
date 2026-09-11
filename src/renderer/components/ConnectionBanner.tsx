import type { JSX } from 'react'
import { shellControl } from '@renderer/shell/shell-control'
import { Refresh, Warn } from '@renderer/icons'

/**
 * M259. A CONNECTION FAILURE, CONTAINED: one bordered banner that says what
 * broke in a headline, the provider's own reason beneath it, and ONE primary
 * recovery — the credential door for a missing or rejected token, a retry
 * for everything else — with Try again beside a credential fix as the quiet
 * second. GitHub and Jira rendered this three different ways (a bare note, a
 * note plus a button for one arm, no button for another), so the same fault
 * had a fix on one panel and none on the other.
 *
 * The reason stays a `p` carrying the caller's class and data attributes:
 * every check that reads a panel's failure reads that element, and a restyle
 * never renames the hooks roughly two hundred checks select on.
 */
export type ConnectionFault = 'no-credential' | 'invalid-credential' | 'rejected' | 'unavailable' | 'malformed'

const HEADLINE: Record<ConnectionFault, (service: string) => string> = {
  'no-credential': (s) => `${s} isn't connected`,
  'invalid-credential': (s) => `${s}'s saved credential is incomplete`,
  rejected: (s) => `${s} rejected the token`,
  unavailable: (s) => `${s} couldn't be reached`,
  malformed: (s) => `${s} sent an answer this app couldn't read`
}

export function ConnectionBanner(props: {
  service: string
  fault: ConnectionFault
  reason: string
  /** The reason's element — the class and data attributes the panel's checks read. */
  noteClass: string
  noteAttrs?: Record<string, string>
  /** The credential door (the palette's Credentials scope). */
  onConnect: () => void
  onRetry: () => void
  /** The connect button's own class and data attribute, kept per panel. */
  connectClass: string
  connectAttrs: Record<string, string>
}): JSX.Element {
  const credential = props.fault !== 'unavailable' && props.fault !== 'malformed'
  const connectLabel = props.fault === 'rejected' || props.fault === 'invalid-credential' ? `Reconnect ${props.service}…` : `Connect ${props.service}…`
  return (
    <div className="connection-banner" data-connection-fault={props.fault} role="alert">
      <span className="connection-banner__glyph"><Warn size={14} /></span>
      <div className="connection-banner__text">
        <p className="connection-banner__headline">{HEADLINE[props.fault](props.service)}</p>
        <p className={`pf__note connection-banner__reason ${props.noteClass}`} {...props.noteAttrs}>{props.reason}</p>
        <div className="connection-banner__verbs">
          {credential ? (
            <>
              <button type="button" className={`pf__verb pf__verb--word is-primary ${props.connectClass}`} {...props.connectAttrs}
                title={`${props.fault === 'no-credential' ? 'Add' : 'Replace'} the ${props.service} token (opens the palette's Credentials scope)`}
                {...shellControl(props.onConnect)}>{connectLabel}</button>
              <button type="button" className="pf__verb pf__verb--word connection-banner__retry" data-connection-retry title={`Read ${props.service} again`} {...shellControl(props.onRetry)}>Try again</button>
            </>
          ) : (
            <button type="button" className="pf__verb pf__verb--word is-primary connection-banner__retry" data-connection-retry title={`Read ${props.service} again`} {...shellControl(props.onRetry)}>
              <Refresh size={13} /><span>Try again</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
