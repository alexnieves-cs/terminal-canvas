/**
 * M446. Whether Settings is open, outside React.
 *
 * The palette row and the shot hook both open the page, and neither of them
 * is inside the component. Canvas is another lane's file, so this store is
 * the seam: the host subscribes, the row writes.
 */

import type { SettingsPaneId } from './panes'

const listeners = new Set<() => void>()
let open = false
let pane: SettingsPaneId = 'keyboard'

function emit(): void {
  for (const listener of listeners) listener()
}

export function settingsOpen(): boolean {
  return open
}

export function settingsPaneId(): SettingsPaneId {
  return pane
}

export function subscribeSettings(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function openSettingsPage(next: SettingsPaneId = 'keyboard'): void {
  pane = next
  open = true
  emit()
}

export function chooseSettingsPane(next: SettingsPaneId): void {
  pane = next
  emit()
}

export function closeSettingsPage(): void {
  if (!open) return
  open = false
  emit()
}
