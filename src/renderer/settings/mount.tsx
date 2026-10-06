/**
 * M446. Mount Settings beside the app root.
 *
 * Canvas owns the shell and this lane does not own Canvas, so the page
 * cannot be a child of that tree. A second root, created the first time the
 * palette-actions module loads, is the mount. It renders nothing until
 * `openSettingsPage` runs, so the empty host does not cover the canvas.
 */

import { useSyncExternalStore, type JSX } from 'react'
import { createRoot } from 'react-dom/client'
import {
  chooseSettingsPane,
  closeSettingsPage,
  openSettingsPage,
  settingsOpen,
  settingsPaneId,
  subscribeSettings
} from './open'
import type { SettingsPaneId } from './panes'
import { SettingsView } from './SettingsView'

const PANE_IDS: readonly SettingsPaneId[] = ['general', 'appearance', 'agents', 'sessions', 'keyboard', 'integrations', 'privacy']

function isPane(value: string | undefined): value is SettingsPaneId {
  return value !== undefined && (PANE_IDS as readonly string[]).includes(value)
}

function SettingsHost(): JSX.Element | null {
  const open = useSyncExternalStore(subscribeSettings, settingsOpen, () => false)
  const pane = useSyncExternalStore(subscribeSettings, settingsPaneId, () => 'keyboard' as const)
  if (!open) return null
  return <SettingsView pane={pane} onPane={chooseSettingsPane} onClose={closeSettingsPage} />
}

export function installSettingsHost(): void {
  if (typeof document === 'undefined' || document.body === null) return
  const host = window as Window & { __tcOpenSettings?: (pane?: string) => void }
  host.__tcOpenSettings = (next) => openSettingsPage(isPane(next) ? next : 'keyboard')
  if (document.querySelector('[data-rd-settings-host]') !== null) return
  const el = document.createElement('div')
  el.setAttribute('data-rd-settings-host', '')
  document.body.appendChild(el)
  createRoot(el).render(<SettingsHost />)
}
