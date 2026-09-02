import { useEffect, useState } from 'react'
import type { SettingRow } from '@shared/ipc-contract'
import type { ResolvedTheme } from '@renderer/terminal/themes'

/**
 * M45. Which theme is on screen, and the one place that stamps it.
 *
 * The SETTING is `appearance.theme`: system | light | dark. The THEME is one
 * of two: `system` resolves through `matchMedia('(prefers-color-scheme:
 * dark)')` and is followed LIVE, so a macOS "Auto" appearance flips the app
 * at sunset without a relaunch. What renders is
 * `document.documentElement.dataset.theme`, which the stylesheet's two
 * colour blocks select on — and bare `:root` carries the light block's
 * values, so the frame before this hook's first read is the light theme
 * rather than a flash of nothing (verify:styles theme.2).
 *
 * Read the same way glow and pips are read (`settings.list()` on
 * `settingsSignal`), plus `settings.onChanged`: the menu's radio group writes
 * through main with no palette open, and without that event the write would
 * land in layout.json and apply on the next Cmd+K — a theme picker that
 * appears to do nothing.
 */
export function useTheme(settingsSignal: unknown): ResolvedTheme {
  const [setting, setSetting] = useState<'system' | 'light' | 'dark'>('system')
  const [systemDark, setSystemDark] = useState<boolean>(() =>
    typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches)

  useEffect(() => {
    let live = true
    const read = (): void => {
      void window.canvas.settings.list().then((rows: SettingRow[]) => {
        if (!live) return
        const row = rows.find((r) => r.id === 'appearance.theme')
        const v = row?.value
        setSetting(v === 'light' || v === 'dark' ? v : 'system')
      })
    }
    read()
    const off = window.canvas.settings.onChanged(read)
    return () => { live = false; off() }
  }, [settingsSignal])

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: MediaQueryListEvent): void => setSystemDark(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const resolved: ResolvedTheme = setting === 'system' ? (systemDark ? 'dark' : 'light') : setting

  useEffect(() => {
    document.documentElement.dataset.theme = resolved
  }, [resolved])

  return resolved
}
