import { memo, type JSX } from 'react'
import type { RunCall } from '@shared/agent-run'
import { toolArgument, toolVerb } from '@renderer/chat/chat-model'
import { CALL_TONE, CALL_WORD, asText, spanWords } from './run-words'

/**
 * M671. ONE TOOL CALL, READ WHOLE — the Run tab's detail card.
 *
 * Adapted from Creance's `ToolCallCard` (MIT, © 2026 Amit Shrivastava,
 * commit c8bfae4; `NOTICE.md` beside this file). Kept from it: the header
 * is the tool, its state and its span; the input and the result are
 * `<details>` (closed by default, so a long Write does not push the error
 * off the card); an error is said in a sentence and announced
 * politely; a failed call never hides what went wrong.
 *
 * Changed for this app: the state is a Tone through `[data-tone]` (never a
 * hue of its own); the header leads with the chat's own verb and argument
 * (`toolVerb`, `toolArgument`), so the card reads like the row it expands;
 * there is no Retry — this app's agent CLIs retry on their own, and a Retry
 * the app cannot honour would be a door that is only declared; and a call
 * whose step ended without a result says `No result`, never `Succeeded`.
 */

export interface ToolCallCardProps {
  call: RunCall
  /** Open the input section at first. */
  defaultOpen?: boolean
  /** Announce a failure in a live region. Off where a parent already does. */
  announce?: boolean
}

function ToolCallCardImpl({ call, defaultOpen = false, announce = true }: ToolCallCardProps): JSX.Element {
  const span = spanWords(call.startedAt, call.endedAt)
  const input = asText(call.input)
  const argument = toolArgument(call.input)
  return (
    <article className="sv-card" data-sv-card={call.id} data-sv-status={call.status} aria-label={`${call.tool} call`}>
      <header className="sv-card__head">
        <span className="sv-card__verb" title={call.tool}>{toolVerb(call.tool)}</span>
        {argument !== '' && <code className="sv-card__arg" title={argument}>{argument}</code>}
        <span className="sv-badge" data-tone={CALL_TONE[call.status]}>
          <span className="status-dot" data-tone={CALL_TONE[call.status]} aria-hidden="true" />{CALL_WORD[call.status]}{span === '' ? '' : ` · ${span}`}
        </span>
      </header>
      {input !== '{}' && (
        <details className="sv-card__section" open={defaultOpen}>
          <summary>Input</summary>
          <pre className="sv-card__code"><code>{input}</code></pre>
        </details>
      )}
      {call.status === 'success' && call.output !== undefined && call.output !== '' && (
        <details className="sv-card__section" data-sv-card-result>
          <summary>Result</summary>
          <pre className="sv-card__code"><code>{call.output}</code></pre>
        </details>
      )}
      {call.status === 'error' && (
        <p className="sv-card__error" data-sv-card-error>
          <span className="sr-only">Error: </span>{call.error ?? 'The tool call failed.'}
        </p>
      )}
      {call.status === 'no-result' && <p className="sv-card__note">The turn ended before this call returned.</p>}
      {announce && <span className="sr-only" role="status" aria-live="polite">{call.status === 'error' ? `Tool call ${call.tool} failed: ${call.error ?? ''}` : ''}</span>}
    </article>
  )
}

export const ToolCallCard = memo(ToolCallCardImpl)
