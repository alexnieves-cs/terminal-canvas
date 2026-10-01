import { useEffect, useState } from 'react'

/**
 * The colours the 3D scene takes from the app, read off the live theme.
 *
 * Strings, not THREE.Color, so this file stays three-free and the scene decides
 * how to build a colour. They are read from computed CSS custom properties
 * because `var()` does not resolve inside a WebGL material — the same reason
 * `shell/chart-tokens.ts` exists for SVG — and re-read when the theme flips, so
 * the world does not stay dark under a light app.
 */
export interface WorldPalette {
  /** The page ground the canvas sits on, and the fog it fades into. */
  ground: string
  /** The floor disc. */
  floor: string
  /** Grid and table-ring lines. */
  line: string
  accent: string
  dark: boolean
}

const HEX = /^#[0-9a-f]{6}$/i

function read(name: string, fallback: string): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return HEX.test(raw) ? raw : fallback
}

export function readWorldPalette(): WorldPalette {
  const dark = document.documentElement.getAttribute('data-theme') !== 'light'
  return {
    ground: read('--s-0', dark ? '#0d0f14' : '#eef1f5'),
    floor: read('--deck-surface', dark ? '#161a21' : '#f1f4f8'),
    line: read('--line-strong', dark ? '#363d49' : '#b5bcc7'),
    accent: read('--iris', dark ? '#5ec4d4' : '#0b7f97'),
    dark
  }
}

export function useWorldPalette(): WorldPalette {
  const [palette, setPalette] = useState(readWorldPalette)
  useEffect(() => {
    const observer = new MutationObserver(() => setPalette(readWorldPalette()))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-contrast', 'style'] })
    return () => observer.disconnect()
  }, [])
  return palette
}
