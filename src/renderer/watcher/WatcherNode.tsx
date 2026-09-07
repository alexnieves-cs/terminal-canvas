import { memo, useEffect, type JSX, type MouseEvent as ReactMouseEvent } from 'react'
import type { WatcherPanel } from '@renderer/panels/panels'
import type { DragState } from '@renderer/canvas/panel-interaction'
import { PanelFrame } from '@renderer/components/PanelFrame'
import { shellControl } from '@renderer/shell/shell-control'
import { triggerWord } from '@shared/watch-trigger'
import { panelState } from '@renderer/panels/panel-state'
import { useWatch, watchStateInput, setDisarmed, clearDisarmed } from './watcher-store'
import { workflowWatchLabel, workflowWatchWord } from '@renderer/workflow/workflow-diagram'

/**
 * M84. THE WATCHER NODE — the eighth kind, and the second process node that
 * is not a terminal.
 *
 * Its body is the LAST RUN's output tail and nothing else: a watcher is not
 * a terminal, and a scrollback here would be a second, worse terminal with
 * no keyboard. What is durable is the run ledger, which the context pane
 * already renders.
 *
 * The state comes from `panel-state.ts` like every other panel's, so a green
 * watcher and a green agent are the same word in the same tone — which is
 * what lets a person read a wall of nodes without opening any of them.
 */
export interface WatcherNodeProps {
  panel: WatcherPanel
  selected: boolean
  onSelect: (id: string, additive?: boolean) => void
  onFocus: (id: string) => void
  onBeginDrag: (state: DragState) => void
  onClose: (id: string) => void
  readOnly?: boolean
  onBeginLink: (panelId: string, event: ReactMouseEvent) => void
  linkTarget: boolean
  /** The label of a `panel` trigger's source, when the canvas has one. */
  sourceLabel?: string
  /**
   * M132. What template this watcher instantiates, when it is one of those.
   *
   * DISCRIMINATED, not `string | null | undefined`, because a JSX prop cannot
   * carry three states through an optional field: `props.workflowName ?? null`
   * — which is what an optional prop forces at the read site — collapsed the
   * `gone` arm into `none` and made "runs a workflow that no longer exists"
   * unreachable from this panel. The rail and the inspector pass the resolver
   * result straight into `workflowWatchWord` and never had the problem.
   */
  workflowWord?: { kind: 'none' } | { kind: 'gone' } | { kind: 'named'; name: string }
  /** M84. Arm or disarm this watcher — a persisted fact, so it survives a relaunch. */
  onSetArmed: (id: string, armed: boolean) => void
}

/**
 * The discriminated prop back into `workflowWatchWord`'s own three arms:
 * `null` nobody asked, `undefined` asked and the template is gone, a name
 * otherwise. One conversion, in one place.
 */
function workflowNameArg(word: WatcherNodeProps['workflowWord']): string | undefined | null {
  if (word === undefined || word.kind === 'none') return null
  if (word.kind === 'gone') return undefined
  return word.name
}

function WatcherNodeImpl(props: WatcherNodeProps): JSX.Element {
  const { panel } = props
  const id = panel.rect.id
  const snapshot = useWatch(id)
  const state = panelState({ kind: 'watcher', status: undefined, dormant: false, watch: watchStateInput(id) }, undefined)
  const running = snapshot.status === 'running'
  const armed = panel.watch.armed !== false

  // Arming is idempotent at an id in main, which is what makes this safe to
  // run on every mount: a workspace switch back, a React re-key and a reload
  // each re-create the same watcher rather than doubling its trigger.
  // The key is a STRING, not the record's objects: `layout-adapt` mints a
  // fresh `args` array and `trigger` object on every load, so an
  // identity-keyed effect re-arms on renders that changed nothing — and a
  // re-arm tears down the directory watch and rebuilds it, losing every
  // change that lands in the gap.
  const armKey = JSON.stringify([panel.watch.cwd, panel.watch.command, panel.watch.args, panel.watch.trigger, panel.watch.armed])
  useEffect(() => {
    // The REFUSAL is the whole point of reading this answer: a watcher whose
    // path is gone is disarmed in main, and a node that discarded the reason
    // would sit at `not started` forever, still runnable by hand, with
    // nothing anywhere saying why it never triggers (M84's verifier).
    void window.canvas.watcher.create({
      id, cwd: panel.watch.cwd, command: panel.watch.command, args: [...panel.watch.args], trigger: panel.watch.trigger, ...(panel.watch.armed === false ? { armed: false } : {})
    }).then((answer) => {
      if (answer.ok) { clearDisarmed(id); return }
      setDisarmed(id, answer.reason)
    })
  }, [id, armKey])

  const when = triggerWord(panel.watch.trigger, props.sourceLabel)

  return (
    <PanelFrame
      id={id}
      kind="watcher"
      rect={panel.rect}
      z={panel.z}
      selected={props.selected}
      linkTarget={props.linkTarget}
      readOnly={props.readOnly ?? false}
      className="watcher-node"
      state={state}
      rootAttrs={{ 'data-watcher-node': id, 'data-watcher-status': snapshot.status, 'data-tone': state.tone }}
      // M132. A workflow trigger names the WORKFLOW, never `/usr/bin/true` —
      // the binary is an implementation detail of main's arming and reads as
      // a command the user never typed.
      title={panel.title ?? (panel.watch.templateId === undefined
        ? `watcher · ${panel.watch.command.split('/').pop() ?? panel.watch.command}`
        : `watcher · ${workflowWatchLabel(workflowNameArg(props.workflowWord))}`)}
      // The chrome row is the terminal's and the chat's: title, then the
      // PILL carrying the state word in its tone (M84's critic — a process
      // node without one reads as a document), then the trigger phrase, then
      // one named verb. The verb is a WORD, not a glyph: `▶` beside `on a
      // change in src` reads equally as "run now" and as "resume watching".
      chrome={<>
        <span className="badge pf__word" data-tone={state.tone} data-state-word data-watcher-state>{state.word}</span>
        <span className="pf__summary watcher-node__when" data-watcher-when>{armed ? when : 'not watching'}</span>
        {props.readOnly === true ? null : (<>
          {/* The toggle says which it WILL do, never which it is: a control
              labelled with its own current state is the one every review of
              this app has caught. */}
          <button type="button" className="pf__verb pf__verb--word" data-watcher-arm
            title={armed ? `Stop watching — ${when}` : `Watch again — ${when}`} aria-label={armed ? 'Disarm' : 'Arm'}
            {...shellControl(() => props.onSetArmed(id, !armed))}>{armed ? 'Disarm' : 'Arm'}</button>
          {/* BOTH verbs, always, with the one that cannot act DISABLED and
              saying why: a control that disappears is indistinguishable from
              a feature that was never built, which is this repo's rule and
              the spec's own words (M84's verifier). */}
          <button type="button" className="pf__verb pf__verb--word" data-watcher-run
            disabled={running}
            title={running ? 'it is already running' : 'Run now'} aria-label="Run now"
            {...shellControl(() => { void window.canvas.watcher.run(id) })}>Run now</button>
          <button type="button" className="pf__verb pf__verb--word" data-watcher-stop
            disabled={!running}
            title={running ? 'Stop this run' : 'nothing is running'} aria-label="Stop this run"
            {...shellControl(() => { void window.canvas.watcher.stop(id) })}>Stop</button>
        </>)}
      </>}
      close={props.readOnly === true ? null : {
        armed: false,
        title: 'Close',
        armedText: 'close?',
        onMouseDown: (e: ReactMouseEvent) => { e.stopPropagation(); e.preventDefault(); props.onClose(id) }
      }}
      onSelect={props.onSelect}
      onBeginDrag={props.onBeginDrag}
      onBeginLink={props.onBeginLink}
    >
      <div className="pf__body watcher-node__body" onMouseDown={(e) => { e.stopPropagation(); props.onFocus(id) }}>
        <p className="watcher-node__command" title={panel.watch.templateId === undefined ? `${panel.watch.command} ${panel.watch.args.join(' ')} in ${panel.watch.cwd}` : `${workflowWatchWord(workflowNameArg(props.workflowWord))} in ${panel.watch.cwd}`}>
          {panel.watch.templateId === undefined ? [panel.watch.command, ...panel.watch.args].join(' ') : workflowWatchWord(workflowNameArg(props.workflowWord))}
        </p>
        {snapshot.disarmed !== undefined && (
          <p className="pf__note watcher-node__refusal" data-watcher-disarmed role="alert">{snapshot.disarmed}</p>
        )}
        {/* Three states, never two: never run, running with nothing printed
            yet, and a finished run's output. A blank body under a `working`
            pill reads as a watcher that is broken rather than one that is
            busy. */}
        {snapshot.status === 'not-started' ? (
          <p className="pf__note" data-watcher-arm="never">{armed ? `has not run yet — it runs ${when}, or press Run now` : 'not watching — press Arm to watch again, or Run now to run it once'}</p>
        ) : snapshot.tail === '' ? (
          <p className="pf__note" data-watcher-arm="quiet">{running ? 'running — nothing printed yet' : 'that run printed nothing'}</p>
        ) : (
          <pre className="watcher-node__tail" data-watcher-tail>{snapshot.tail}</pre>
        )}
        {/* The RUN's own fact, in plain lower case. `idle` is the NODE's
            state and the pill above says it; a run passed or failed, and
            using the state word here would make one word mean two things on
            one panel (M84's critic). */}
        {snapshot.status !== 'not-started' && (
          <p className="watcher-node__last" data-watcher-last>
            {running
              ? (snapshot.pending ? 'running — another run is queued' : 'running')
              : snapshot.status === 'passed' ? 'last run passed'
                : snapshot.signal !== undefined && snapshot.signal !== null ? `last run was stopped (${snapshot.signal})`
                  : `last run failed — exit ${snapshot.exitCode ?? 0}`}
          </p>
        )}
      </div>
    </PanelFrame>
  )
}

export const WatcherNode = memo(WatcherNodeImpl)
