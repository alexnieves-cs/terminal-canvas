/**
 * M447. The renderer's copy of the recovery model. It does not poll. Main
 * samples on the live tick; this store changes when something applies an
 * event, including the shot door `window.__rdLF`.
 */
import {
  catalogView,
  initialRecovery,
  offlineToast,
  reduceRecovery,
  viewOf,
  viewOn,
  type CatalogInput,
  type OfflineToast,
  type RecoveryEvent,
  type RecoveryModel,
  type RecoveryView
} from '@shared/exit-explain'

type Listener = () => void

let model: RecoveryModel = initialRecovery()
let view: RecoveryView = viewOf(model, 0)
let catalog = false
let toast: OfflineToast | null = null
let toastRev = 0
const listeners = new Set<Listener>()

function emit(): void {
  for (const listener of listeners) listener()
}

export function getRecoveryView(): RecoveryView {
  return view
}

export function subscribeRecovery(listener: Listener): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function applyRecovery(event: RecoveryEvent): void {
  const prev = model
  catalog = false
  model = reduceRecovery(model, event)
  const at = 'at' in event && typeof event.at === 'number' ? event.at : 0
  view = viewOf(model, at)
  if (event.type === 'offline') {
    const was = event.source === 'github' ? prev.offline.github : prev.offline.jira
    if (was === null) {
      toast = offlineToast(event.source === 'github' ? 'GitHub' : 'Jira')
      toastRev += 1
    }
  }
  emit()
}

export function toastRevision(): number {
  return toastRev
}

/** The finished offline notice, once. A second read is null. */
export function takeOfflineToast(): OfflineToast | null {
  const pending = toast
  toast = null
  return pending
}

/** The mockup shows several states at once. `catalogView` is that picture. */
export function showCatalog(input: CatalogInput): boolean {
  catalog = true
  view = catalogView(input)
  if (input.offline.length > 0) {
    const source = input.offline[0].source === 'github' ? 'GitHub' : 'Jira'
    toast = offlineToast(source)
    toastRev += 1
  }
  emit()
  return catalog
}

function installDoor(): void {
  if (typeof window === 'undefined') return
  const door = {
    mount: (input: CatalogInput) => showCatalog(input),
    apply: (event: RecoveryEvent) => { applyRecovery(event); return true },
    snapshot: () => getRecoveryView()
  }
  ;(window as unknown as { __rdLF?: typeof door }).__rdLF = door
}

installDoor()

export function recoveryVisible(next: RecoveryView = view): boolean {
  return viewOn(next)
}
