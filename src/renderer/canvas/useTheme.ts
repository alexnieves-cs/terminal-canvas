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
/**
 * M256. Stronger borders and no translucency, one set per theme so a hairline
 * still clears the same ground it always sat on. `--frame-line` is included
 * because its base rule (styles.css) already points it at --line (light) or
 * --line-strong (dark) — an inline override of --line alone would leave the
 * panel frame on the OLD value once the derived var is itself overridden
 * here, so every token the base rule derives from these is restated.
 */
const HIGH_CONTRAST: Record<ResolvedTheme, Record<string, string>> = {
  light: {
    '--line': '#8a92a3',
    '--line-strong': '#4a5165',
    '--frame-line': '#4a5165',
    '--fg-4': '#4a5165',
    '--blur': 'none',
    '--glass-0': '#e2e6ee',
    '--glass-1': '#f6f7fa',
    '--glass-2': '#eef0f5',
    '--glass-3': '#ffffff'
  },
  dark: {
    '--line': '#4a5670',
    '--line-strong': '#7f8fb5',
    '--frame-line': '#7f8fb5',
    '--fg-4': '#a7b2c8',
    '--blur': 'none',
    // M279: the opaque stand-ins follow the navy ramp (--s-0/--s-1/--s-2/--s-3).
    '--glass-0': '#080c16',
    '--glass-1': '#121a2a',
    '--glass-2': '#0d1322',
    '--glass-3': '#1a2336'
  }
}

type ThemeSetting = 'system' | 'light' | 'dark'
/** Resolved by main.tsx before first render, so the hook's FIRST stamp is the
 *  right theme — starting from 'system' repainted the splash's ground in the
 *  wrong theme for a frame whenever the setting and the OS disagreed. */
let bootSetting: ThemeSetting = 'system'
export function stampBootTheme(v: unknown): void {
  bootSetting = v === 'light' || v === 'dark' ? v : 'system'
  const dark = bootSetting === 'dark' || (bootSetting === 'system' &&
    typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
}

export function useTheme(settingsSignal: unknown): ResolvedTheme {
  const [setting, setSetting] = useState<ThemeSetting>(() => bootSetting)
  const [systemDark, setSystemDark] = useState<boolean>(() =>
    typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  // M256. `accessibility.highContrast` — a SEPARATE axis from light/dark
  // (spec §19: "distinct from light/dark mode"), stamped as its own
  // attribute rather than a third value of `appearance.theme` so it composes
  // with either theme instead of replacing one.
  const [highContrast, setHighContrast] = useState(false)

  useEffect(() => {
    let live = true
    const read = (): void => {
      void window.canvas.settings.list().then((rows: SettingRow[]) => {
        if (!live) return
        const row = rows.find((r) => r.id === 'appearance.theme')
        const v = row?.value
        setSetting(v === 'light' || v === 'dark' ? v : 'system')
        const contrastRow = rows.find((r) => r.id === 'accessibility.highContrast')
        setHighContrast(contrastRow?.value === true)
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

  // M256 (spec §19). Applied as INLINE custom properties on the root, not a
  // third stylesheet block keyed on a new attribute. verify:styles' theme.1/
  // theme.2/obsidian.1/depth.1 all parse styles.css by matching
  // `data-theme="..."` inside a selector STRING — a combined selector like
  // `:root[data-theme="dark"][data-contrast="high"]` still contains that
  // substring and would silently fold this override into the very token
  // table those checks measure, corrupting them with no failure anywhere
  // (the class of bug theme.1's own comment warns about, one level up: a
  // token that drifts and is never caught because nothing reads the RENDERED
  // value). An inline style is outside the stylesheet entirely, wins on
  // specificity over both theme blocks unconditionally, and is trivial to
  // remove by deleting the property rather than juggling cascade order.
  useEffect(() => {
    const root = document.documentElement.style
    if (highContrast) {
      document.documentElement.dataset.contrast = 'high'
      const c = resolved === 'dark' ? HIGH_CONTRAST.dark : HIGH_CONTRAST.light
      for (const [prop, value] of Object.entries(c)) root.setProperty(prop, value)
    } else {
      delete document.documentElement.dataset.contrast
      for (const prop of Object.keys(HIGH_CONTRAST.light)) root.removeProperty(prop)
    }
  }, [highContrast, resolved])

  return resolved
}
