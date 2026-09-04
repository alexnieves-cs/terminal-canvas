import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { VaultNoteRow } from '@shared/ipc-contract'
import { buildVaultIndex, type VaultIndex } from '@shared/vault'

/**
 * M85. The vault, as Canvas holds it: main's read, the pure index built from
 * it, and one refresh verb.
 *
 * The READ is main's (the renderer has no `fs`) and the INDEX is pure, which
 * is the whole split this milestone rests on — the backlinks a note shows and
 * the rows the pane lists come from one index built once per read, not from
 * a walk each surface does for itself.
 *
 * The re-read rides main's OWN watch on the root (`vault:changed`, debounced
 * there), never `file:changed`: that event is per open file panel and
 * basename-filtered, so a note an agent wrote into the folder never fired it,
 * while an agent editing a source file elsewhere re-walked the whole vault on
 * every save (M85's verifier).
 *
 * `root` is the root as MAIN resolved it — `~` expanded, symlinks followed —
 * because every panel path it is compared against is absolute and real. The
 * setting stays as typed; this is what it means.
 */
export interface VaultModel {
  /** The effective root: '' with no setting, else main's resolved path. */
  root: string
  notes: VaultNoteRow[]
  index: VaultIndex
  pending: boolean
  reason?: string
  skipped: number
  refresh: () => void
}

export function useVault(setting: string): VaultModel {
  const [state, setState] = useState<{ root: string; notes: VaultNoteRow[]; skipped: number; reason?: string; pending: boolean }>({ root: '', notes: [], skipped: 0, pending: false })
  // The read in flight, so a slower answer for an OLD root can never land on
  // top of a newer one — the stale-render rule check 100b states.
  const epochRef = useRef(0)

  const read = useCallback(() => {
    if (setting === '') { epochRef.current += 1; setState({ root: '', notes: [], skipped: 0, pending: false }); return }
    const epoch = ++epochRef.current
    setState((s) => ({ ...s, pending: true }))
    void window.canvas.vault.read(setting).then((answer) => {
      if (epoch !== epochRef.current) return
      setState({ root: answer.root, notes: answer.notes, skipped: answer.skipped, pending: false, ...(answer.reason === undefined ? {} : { reason: answer.reason }) })
    }).catch((error: unknown) => {
      if (epoch !== epochRef.current) return
      setState({ root: setting, notes: [], skipped: 0, pending: false, reason: `the vault could not be read: ${String(error)}` })
    })
  }, [setting])

  useEffect(() => { read() }, [read])
  useEffect(() => window.canvas.vault.onChanged(() => read()), [read])

  const signature = useMemo(() => state.notes.map((n) => `${n.path}:${n.at}:${n.body.length}`).join('\n'), [state.notes])
  const notes = useMemo(() => state.notes, [signature])
  const index = useMemo(() => buildVaultIndex(notes.map((n) => ({ path: n.path, body: n.body, title: n.title }))), [notes])

  return {
    root: setting === '' ? '' : (state.root === '' ? setting : state.root),
    notes,
    index,
    pending: state.pending,
    skipped: state.skipped,
    ...(state.reason === undefined ? {} : { reason: state.reason }),
    refresh: read
  }
}
