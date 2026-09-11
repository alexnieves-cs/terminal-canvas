/**
 * M45. The icon set: inline SVG, authored here, never fetched.
 *
 * Every icon is a 16px grid drawn in a 24px cell with `stroke="currentColor"`
 * at 1.5px, round caps and joins — one optical centre and one stroke weight
 * for the whole app, which is exactly what the entity glyphs this replaced
 * (`&times;`, `&#9654;`, `⚙`, `⟳`…) could not give: they rendered from
 * whichever font the stack resolved, at three different baselines, and `⚙`
 * and `▶` are emoji-presentation-eligible and could come back in colour.
 *
 * `aria-hidden` on every one. The buttons that hold them already carry an
 * aria-label, and an un-hidden icon adds a SECOND accessible name (an SVG's
 * title, or nothing) that a screen reader reads after the first.
 * verify:styles icons.1 is what keeps a glyph from creeping back in.
 */
import type { JSX } from 'react'

interface IconProps {
  /** Cell size in CSS px. The 16px drawing scales with it. */
  size?: number
}

function Svg({ size = 16, children }: IconProps & { children: JSX.Element | JSX.Element[] }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

export const Close = (p: IconProps): JSX.Element => (
  <Svg {...p}><path d="M4 4l8 8M12 4l-8 8" /></Svg>
)
export const Play = (p: IconProps): JSX.Element => (
  <Svg {...p}><path d="M5 3.5v9l7-4.5z" fill="currentColor" stroke="none" /></Svg>
)
export const Pencil = (p: IconProps): JSX.Element => (
  <Svg {...p}><path d="M11.5 2.5l2 2L5 13H3v-2z" /><path d="M10 4l2 2" /></Svg>
)
export const Gear = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="2.25" />
    <path d="M8 1.75v1.5M8 12.75v1.5M1.75 8h1.5M12.75 8h1.5M3.6 3.6l1.05 1.05M11.35 11.35l1.05 1.05M3.6 12.4l1.05-1.05M11.35 4.65l1.05-1.05" />
  </Svg>
)
export const Refresh = (p: IconProps): JSX.Element => (
  <Svg {...p}><path d="M13 8a5 5 0 1 1-1.5-3.55" /><path d="M13 2.5V6H9.5" /></Svg>
)
export const RotateCw = (p: IconProps): JSX.Element => (
  <Svg {...p}><path d="M3 8a5 5 0 1 0 1.5-3.55" /><path d="M3 2.5V6h3.5" /></Svg>
)
export const ChevronLeft = (p: IconProps): JSX.Element => (
  <Svg {...p}><path d="M10 3.5L5.5 8 10 12.5" /></Svg>
)
export const ChevronDown = (p: IconProps): JSX.Element => (
  <Svg {...p}><path d="M4 6l4 4 4-4" /></Svg>
)
export const ChevronRight = (p: IconProps): JSX.Element => (
  <Svg {...p}><path d="M6 3.5L10.5 8 6 12.5" /></Svg>
)
export const Plus = (p: IconProps): JSX.Element => (
  <Svg {...p}><path d="M8 3v10M3 8h10" /></Svg>
)
export const Minus = (p: IconProps): JSX.Element => (
  <Svg {...p}><path d="M3 8h10" /></Svg>
)
export const Check = (p: IconProps): JSX.Element => (
  <Svg {...p}><path d="M3 8.5l3 3 7-7" /></Svg>
)
export const Search = (p: IconProps): JSX.Element => (
  <Svg {...p}><circle cx="7" cy="7" r="4.25" /><path d="M10.25 10.25L13.5 13.5" /></Svg>
)
export const Layers = (p: IconProps): JSX.Element => (
  <Svg {...p}><path d="M8 2.5L14 5.5 8 8.5 2 5.5z" /><path d="M2 8.5l6 3 6-3M2 11.5l6 3 6-3" /></Svg>
)
export const Link = (p: IconProps): JSX.Element => (
  <Svg {...p}><path d="M6.5 9.5l3-3" /><path d="M7 4.5l1.25-1.25a2.5 2.5 0 0 1 3.5 3.5L10.5 8" /><path d="M9 11.5l-1.25 1.25a2.5 2.5 0 0 1-3.5-3.5L5.5 8" /></Svg>
)
/** The commit verb's glyph: a small arrow into a box, replacing `⌦`. */
export const Commit = (p: IconProps): JSX.Element => (
  <Svg {...p}><circle cx="8" cy="8" r="2.25" /><path d="M2 8h3.75M10.25 8H14" /></Svg>
)
/** M46. The dock's four navigators and the context pane's toggle. */
export const Grid = (p: IconProps): JSX.Element => (
  <Svg {...p}><rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" /><rect x="9" y="2.5" width="4.5" height="4.5" rx="1" /><rect x="2.5" y="9" width="4.5" height="4.5" rx="1" /><rect x="9" y="9" width="4.5" height="4.5" rx="1" /></Svg>
)
export const Folder = (p: IconProps): JSX.Element => (
  <Svg {...p}><path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h3l1.5 1.5h4.5A1.5 1.5 0 0 1 14 6v6a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12z" /></Svg>
)
export const Bell = (p: IconProps): JSX.Element => (
  <Svg {...p}><path d="M4 11V7.5a4 4 0 0 1 8 0V11l1 1.5H3z" /><path d="M6.5 13.5a1.5 1.5 0 0 0 3 0" /></Svg>
)
export const PanelRight = (p: IconProps): JSX.Element => (
  <Svg {...p}><rect x="2" y="3" width="12" height="10" rx="1.5" /><path d="M10 3v10" /></Svg>
)
export const More = (p: IconProps): JSX.Element => (
  <Svg {...p}><circle cx="4" cy="8" r="1" fill="currentColor" stroke="none" /><circle cx="8" cy="8" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="8" r="1" fill="currentColor" stroke="none" /></Svg>
)
export const Maximize = (p: IconProps): JSX.Element => (
  <Svg {...p}><path d="M3 6V3h3M13 6V3h-3M3 10v3h3M13 10v3h-3" /></Svg>
)
export const Send = (p: IconProps): JSX.Element => (
  <Svg {...p}><path d="M2.5 8 13 3l-3.2 10.5-2.6-4.2L2.5 8Z" /><path d="M9.8 9.3 13 3" /></Svg>
)

/* M63. Kind glyphs for the rail's left column, 12px, so kind stops sharing
   the state slot. A terminal keeps the state DOT (its column is its state);
   these five say what a sessionless row is. */
export const KindReview = (p: IconProps): JSX.Element => (
  <Svg {...p}><path d="M8 3v10M3 8h10" /><path d="M4 12h8" strokeWidth="1" /></Svg>
)
export const KindFile = (p: IconProps): JSX.Element => (
  <Svg {...p}><path d="M4 2h5l3 3v9H4z" /><path d="M9 2v3h3" /></Svg>
)
export const KindNote = (p: IconProps): JSX.Element => (
  <Svg {...p}><path d="M3 13l1-4 7-7 3 3-7 7z" /><path d="M10 3l3 3" /></Svg>
)
export const KindToolbox = (p: IconProps): JSX.Element => (
  <Svg {...p}><rect x="2" y="5" width="12" height="8" rx="1" /><path d="M6 5V3h4v2M2 9h12" /></Svg>
)
export const KindJira = (p: IconProps): JSX.Element => (
  <Svg {...p}><rect x="2" y="2" width="12" height="12" rx="1" /><path d="M8 2v12M2 8h6" /></Svg>
)
/* M74. A terminal: the prompt chevron and a line. */
export const KindTerminal = (p: IconProps): JSX.Element => (
  <Svg {...p}><path d="M3 4l4 4-4 4" /><path d="M8 12h5" /></Svg>
)
/* M73. A conversation: a speech line with three dots. */
export const KindChat = (p: IconProps): JSX.Element => (
  <Svg {...p}><path d="M2 3h12v8H6l-3 3v-3H2z" /><path d="M5 7h.01M8 7h.01M11 7h.01" /></Svg>
)

/* M66. The merged view's own glyph — three horizontal lanes — so the top
   bar's button stops sharing the dock's Workspaces (layers) glyph. */
export const Lanes = (p: IconProps): JSX.Element => (
  <Svg {...p}><rect x="2" y="2.5" width="12" height="3" rx="1" /><rect x="2" y="6.5" width="12" height="3" rx="1" /><rect x="2" y="10.5" width="12" height="3" rx="1" /></Svg>
)

/** M66. One map from a sessionless kind to its glyph, for the rail row and the panel frame. */
/** M83. The project memory: a book's spine. */
export const KindMemory = (p: IconProps): JSX.Element => (
  <Svg {...p}><path d="M3 4h10" /><path d="M3 8h10" /><path d="M3 12h6" /></Svg>
)

/** M84. The watcher: an eye on a clock's face — a thing that is watching. */
export const KindWatcher = (p: IconProps): JSX.Element => (
  <Svg {...p}><circle cx="8" cy="8" r="5.5" /><path d="M8 5v3l2 1.5" /></Svg>
)

/** M88. GitHub work: an issue's circle with a mark inside. */
export const KindGithub = (p: IconProps): JSX.Element => (
  <Svg {...p}><circle cx="8" cy="8" r="5.5" /><circle cx="8" cy="8" r="1.5" /></Svg>
)

/** M103. The browser pane: a globe — a circle with its meridian and equator. */
export const KindBrowser = (p: IconProps): JSX.Element => (
  <Svg {...p}><circle cx="8" cy="8" r="5.5" /><path d="M2.5 8h11M8 2.5c2 2 2 9 0 11M8 2.5c-2 2-2 9 0 11" /></Svg>
)

/* M116. The work card: a board's column with one card in it. */
export const KindWork = (p: IconProps): JSX.Element => (
  <Svg {...p}><rect x="2" y="2" width="12" height="12" rx="1" /><path d="M2 6h12M5 9h6" /></Svg>
)

/* M128. A skill: a bookmarked page — the shelf's own card, on a leaf. */
export const KindSkill = (p: IconProps): JSX.Element => (
  <Svg {...p}><path d="M3.5 2h9v12l-4.5-3-4.5 3z" /><path d="M6 5.5h4" /></Svg>
)

/* M133. The workflow panel: two blocks and the line between them — the
   diagram it draws, at 16px. */
export const KindWorkflow = (p: IconProps): JSX.Element => (
  <Svg {...p}><rect x="1.5" y="5" width="5" height="6" rx="1" /><rect x="9.5" y="5" width="5" height="6" rx="1" /><path d="M6.5 8h3" /></Svg>
)

/* M168. Tool glyphs for the chat's tool rows, by the verb family. */
export const ToolRead = (p: IconProps): JSX.Element => (
  <Svg {...p}><path d="M3 4h10M3 8h10M3 12h6" /></Svg>
)
export const ToolEdit = (p: IconProps): JSX.Element => (
  <Svg {...p}><path d="M11 2l3 3-8 8H3v-3z" /></Svg>
)
export const ToolRun = (p: IconProps): JSX.Element => (
  <Svg {...p}><path d="M3 4l4 4-4 4M8 12h5" /></Svg>
)
export const ToolSearch = (p: IconProps): JSX.Element => (
  <Svg {...p}><circle cx="7" cy="7" r="4" /><path d="M10 10l4 4" /></Svg>
)
export const ToolOther = (p: IconProps): JSX.Element => (
  <Svg {...p}><path d="M8 2l1.5 3 3.5.5-2.5 2.5.5 3.5L8 10l-3 1.5.5-3.5L3 5.5 6.5 5z" /></Svg>
)
export const CopyIcon = (p: IconProps): JSX.Element => (
  <Svg {...p}><rect x="5" y="5" width="8" height="8" rx="1.5" /><path d="M3 10V3h7" /></Svg>
)
export const TOOL_GLYPH: Record<string, (p: IconProps) => JSX.Element> = { Read: ToolRead, Edit: ToolEdit, Run: ToolRun, Search: ToolSearch }

/** M181. The image kind: a frame with a horizon and a sun, the picture glyph every OS draws. */
export const KindImage = (p: IconProps): JSX.Element => (
  <Svg {...p}><rect x="2.5" y="3.5" width="11" height="9" rx="1.5" /><circle cx="6" cy="7" r="1.2" /><path d="M2.5 11l3.5-3 2.5 2.5 2-1.5 3 2.5" /></Svg>
)
/** M248. A deck: a slide on its easel — a 16:9 frame over a short stand. */
export const KindDeck = (p: IconProps): JSX.Element => (
  <Svg {...p}><rect x="2" y="3" width="12" height="7.5" rx="1" /><path d="M8 10.5V13M5.5 14h5" /><path d="M4.5 6h5" strokeWidth="1" /></Svg>
)
export const KIND_GLYPH = { review: KindReview, file: KindFile, note: KindNote, toolbox: KindToolbox, jira: KindJira, github: KindGithub, chat: KindChat, memory: KindMemory, watcher: KindWatcher, browser: KindBrowser, work: KindWork, skill: KindSkill, workflow: KindWorkflow, image: KindImage } as const

/** M92. A lock: the closed padlock, a state mark on a frame. */
export const Lock = (
  <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3.5" y="7.5" width="9" height="6" rx="1" />
    <path d="M5.5 7.5V5.5a2.5 2.5 0 0 1 5 0v2" />
  </svg>
)
/** M92. A pin: the drawing pin, a state mark on a frame. */
export const Pin = (
  <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9.5 2.5l4 4-2 1-1.5 3.5-3-3L3 12.5l3.5-4-3-3L7 4z" />
  </svg>
)
