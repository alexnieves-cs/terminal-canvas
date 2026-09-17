/**
 * Round 7. THE THEME'S COLOURS, HANDED TO A CHART LIBRARY.
 *
 * Recharts paints with SVG PRESENTATION ATTRIBUTES — `fill="…"`,
 * `stroke="…"` — and a presentation attribute does not resolve `var()`. So
 * the one thing that would have been natural here, passing `var(--blue)`
 * straight through, silently paints nothing: no error, no warning, an
 * invisible series. That is the whole reason this file exists rather than a
 * constant somewhere.
 *
 * It reads the tokens off the live document instead, which keeps the single
 * rule this repo's stylesheet is built on intact: EVERY COLOUR IS DECLARED IN
 * A THEME BLOCK AND NOWHERE ELSE. No hex is written here, so `verify:styles`
 * 1 stays honest, the dark block is followed for free, and the inline custom
 * properties that high contrast stamps on `:root` are picked up with no extra
 * arm — `getComputedStyle` cannot tell the difference and does not need to.
 *
 * The five accents are DERIVED against `verify:styles` 11 for the non-text
 * 3:1 rule, which is exactly the rule a chart mark falls under (WCAG 1.4.11:
 * a line, a bar and a dot are non-text contrast). So a chart may spend them
 * freely, and must not invent a sixth.
 */
import { useEffect, useState } from 'react'

/**
 * The names a chart may spend. `--amber` is DELIBERATELY ABSENT: it is the
 * attention hue, the single most important signal in this app, and a cost
 * chart that happens to plot an amber series teaches a person to stop reading
 * amber as "this needs you".
 */
const CHART_TOKENS = ['--blue', '--iris', '--violet', '--green', '--red', '--fg-3', '--fg-4', '--line', '--s-2'] as const

export type ChartToken = typeof CHART_TOKENS[number]
export type ChartColors = Record<ChartToken, string>

function read (): ChartColors {
  const style = getComputedStyle(document.documentElement)
  const out = {} as ChartColors
  for (const token of CHART_TOKENS) out[token] = style.getPropertyValue(token).trim()
  return out
}

/**
 * The colours as they are RIGHT NOW, re-read when the theme changes.
 *
 * Both axes are watched, because both restyle the tokens: `data-theme` is the
 * light/dark stamp and `data-contrast` is the orthogonal high-contrast one.
 * Watching only the first left every chart in the app painted in the ordinary
 * palette for somebody who had asked for high contrast — a silent failure of
 * exactly the kind that never reaches a suite, because it is legible, just
 * wrong.
 */
export function useChartColors (): ChartColors {
  const [colors, setColors] = useState<ChartColors>(read)
  useEffect(() => {
    const sync = (): void => setColors(read())
    // The stamp lands on the root element from useTheme; a MutationObserver on
    // the attribute is the only signal, since no event is fired for it.
    const observer = new MutationObserver(sync)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-contrast', 'style'] })
    // The `system` theme resolves through matchMedia and changes the stamp,
    // so the observer covers it — but a first paint that raced the stamp
    // would keep the pre-theme values forever without this one re-read.
    sync()
    return () => observer.disconnect()
  }, [])
  return colors
}
