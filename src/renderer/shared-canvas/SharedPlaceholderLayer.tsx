import { useEffect, useState, type CSSProperties, type JSX, type MouseEvent } from 'react'
import { CodeEditor } from '../file/CodeEditor'
import type { SharedPanel } from '@shared/canvas-ops'
import { colorOf } from '@shared/presence'
import { useRosterNames } from '../presence/useRosterNames'
import { Close } from '../icons'

/**
 * A teammate's panel on the shared canvas, drawn where the doc says it is and
 * INERT: nothing about it runs here, and nothing here can make it run — no
 * command, cwd or transcript ever crosses (canvas-ops.ts's SharedPanel). What
 * arrives from outside is inert until a person looks, and a placeholder never
 * stops being one; it is a card, not a panel, and joins none of the panel
 * machinery (tiering, the registry, isTerminalPanel's lists).
 *
 * It keeps its header, by the frame rule (CLAUDE.md, M236): the header carries
 * the one fact the body cannot — whose it is — in that person's colour.
 *
 * The one thing a placeholder opens is a SHARED FILE's draft (view.files): the
 * text rides the doc, so editing it here runs nothing and reads nothing from
 * the owner's disk. It has no save — the file is on the owner's machine, and
 * what is typed here reaches them as unsaved changes they choose to keep.
 *
 * M392. A teammate's flowchart SHAPE is not drawn here: Canvas hands this
 * layer only the placeholders shared-shapes.ts left as cards, and the shape
 * itself is drawn read-only in the ShapeLayer, a diamond as a diamond. A shape
 * whose record did not survive the wire stays a card here, named by its title
 * (the label's first line).
 */
export interface SharedPlaceholderLayerProps {
  placeholders: readonly SharedPanel[]
  workspaceId: string | undefined
  mayArrange: boolean
  mayRemove(p: SharedPanel): boolean
  onBeginDrag(p: SharedPanel, event: MouseEvent<HTMLElement>): void
  onRemove(p: SharedPanel): void
  /** view.files: placeholders whose file text is shared. */
  files: readonly string[]
  /**
   * M343. Open a relay panel HERE attached to a teammate's relay session. The
   * person's click is the look: nothing attaches until then, and the relay
   * itself decides — by the share's role, on its side — whether they may.
   */
  onAttachRelay?(p: SharedPanel): void
}

/** A teammate's shared file, open here. Local state only: the text itself is the doc's (shared-text/binding.ts). */
function SharedDraft({ p, workspaceId, who, onClose }: { p: SharedPanel; workspaceId: string; who: string; onClose(): void }): JSX.Element {
  const [text, setText] = useState('')
  const [note, setNote] = useState<string | null>(null)
  return (
    <div className="shared-placeholder__draft" data-shared-draft={p.id}>
      <CodeEditor
        value={text}
        onChange={setText}
        // No disk here to write: say whose save it is rather than doing nothing.
        onSave={() => setNote(`Only ${who} can save this file — your edits reach them as unsaved changes.`)}
        onEscape={onClose}
        path={p.title}
        shared={{ workspaceId, panelId: p.id, hosted: false, preferLocal: () => false }}
      />
      {note !== null && <div className="shared-placeholder__note" role="status">{note}</div>}
    </div>
  )
}

const KIND_WORD: Record<string, string> = { terminal: 'Terminal', chat: 'Agent', file: 'File', note: 'Note', browser: 'Preview', workflow: 'Workflow', image: 'Picture', relay: 'Relay terminal', shape: 'Shape' }

export function SharedPlaceholderLayer(props: SharedPlaceholderLayerProps): JSX.Element | null {
  const names = useRosterNames(props.workspaceId)
  const [openId, setOpenId] = useState<string | null>(null)
  const workspaceId = props.workspaceId
  // A share that went away (unshared, tombstoned) closes the draft with it.
  useEffect(() => { if (openId !== null && !props.files.includes(openId)) setOpenId(null) }, [openId, props.files])
  if (props.placeholders.length === 0) return null
  return (
    <>
      {props.placeholders.map((p) => {
        const who = names.get(p.owner) ?? 'a teammate'
        const style = { left: p.x, top: p.y, width: p.w, height: p.h, zIndex: p.z, '--owner': colorOf(p.owner) } as CSSProperties
        return (
          <div key={p.id} className="shared-placeholder" data-shared-placeholder={p.id} data-kind={p.kind} style={style}>
            <div
              className="shared-placeholder__head"
              data-arrange={props.mayArrange ? '' : undefined}
              onMouseDown={props.mayArrange ? (e) => { if (e.button === 0) { e.stopPropagation(); props.onBeginDrag(p, e) } } : undefined}
            >
              <span className="shared-placeholder__owner" aria-hidden="true" />
              <span className="shared-placeholder__title">{p.title || KIND_WORD[p.kind] || p.kind}</span>
              <span className="shared-placeholder__who">{who}</span>
              {props.mayRemove(p) && (
                <button type="button" className="shared-placeholder__remove" aria-label={`Remove ${p.title || 'this panel'} from the shared canvas`}
                  onMouseDown={(e) => e.stopPropagation()} onClick={() => props.onRemove(p)}><Close /></button>
              )}
            </div>
            {openId === p.id && workspaceId !== undefined ? (
              <SharedDraft p={p} workspaceId={workspaceId} who={who} onClose={() => setOpenId(null)} />
            ) : (
              <div className="shared-placeholder__body">
                {p.kind === 'relay'
                  // A relay terminal runs on the team relay, not on anyone's Mac.
                  ? (p.relay === undefined ? `${who}’s relay terminal — no session yet.` : `${who}’s terminal on the team relay · ${p.relay.program}.`)
                  : `${KIND_WORD[p.kind] ?? p.kind} on ${who}’s machine — nothing runs here.`}
                {p.kind === 'relay' && p.relay !== undefined && props.onAttachRelay !== undefined && (
                  <button type="button" className="shared-placeholder__open" data-shared-relay-attach={p.id}
                    title="Open this session here — the relay decides by your role whether you may watch or type"
                    onMouseDown={(e) => e.stopPropagation()} onClick={() => props.onAttachRelay?.(p)}>Attach</button>
                )}
                {props.files.includes(p.id) && (
                  <button type="button" className="shared-placeholder__open" data-shared-draft-open={p.id}
                    onMouseDown={(e) => e.stopPropagation()} onClick={() => setOpenId(p.id)}>Edit shared draft</button>
                )}
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}
