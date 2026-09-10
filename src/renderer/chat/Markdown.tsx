import { useMemo, type JSX } from 'react'
import { parseMarkdown, type Block, type Inline } from '@shared/markdown'
import { shellControl } from '@renderer/shell/shell-control'
import { CopyIcon } from '@renderer/icons'

/**
 * M167. The assistant's turn, rendered from `parseMarkdown`'s TREE — React
 * elements built from parsed nodes, never a string handed to `innerHTML`.
 * A fenced block carries a `Copy` verb that writes the fence's text through
 * `navigator.clipboard` — the door `Palette.tsx` and `Canvas.tsx` already use
 * (`edit:copy` is main→renderer and could not carry a fence's text); a link renders as
 * TEXT with the URL on its title — a transcript is not a page, and `link:open`
 * is a verb, not a click on prose.
 */
export function Markdown({ text, slides = false, image }: {
  text: string
  /** M248. The slide grammar (image and table blocks); the chat never passes it, so md.1's grammar holds there. */
  slides?: boolean
  /** M248. How an image block paints — the deck resolves a path through `image:read`; absent paints its alt text. */
  image?: (alt: string, src: string) => JSX.Element
}): JSX.Element {
  const blocks = useMemo(() => parseMarkdown(text, { slides }), [text, slides])
  return <>{blocks.map((b, i) => <BlockView key={i} block={b} image={image} />)}</>
}

function BlockView({ block, image }: { block: Block; image?: (alt: string, src: string) => JSX.Element }): JSX.Element {
  switch (block.kind) {
    case 'image':
      return image ? image(block.alt, block.src) : <p className="md__p">{block.alt}</p>
    case 'table':
      return (
        <table className="md__table">
          <thead><tr>{block.header.map((c, i) => <th key={i} style={block.align[i] ? { textAlign: block.align[i]! } : undefined}><Runs runs={c} /></th>)}</tr></thead>
          <tbody>{block.rows.map((row, r) => <tr key={r}>{row.map((c, i) => <td key={i} style={block.align[i] ? { textAlign: block.align[i]! } : undefined}><Runs runs={c} /></td>)}</tr>)}</tbody>
        </table>
      )
    case 'heading': {
      const Tag = (`h${block.level + 2}`) as 'h3' | 'h4' | 'h5'
      return <Tag className={`md__h md__h--${block.level}`}><Runs runs={block.children} /></Tag>
    }
    case 'list':
      return block.ordered
        ? <ol className="md__list">{block.items.map((it, i) => <li key={i}><Runs runs={it} /></li>)}</ol>
        : <ul className="md__list">{block.items.map((it, i) => <li key={i}><Runs runs={it} /></li>)}</ul>
    case 'code':
      return (
        <div className="md__fence" data-md-fence={block.lang || 'text'}>
          {/* An ICON with a name: the button sits inside the element a check reads the answer's text from, so its label must not be text. */}
          <button type="button" className="md__copy pf__verb icon-button" data-md-copy title="Copy this block" aria-label="Copy this block"
            {...shellControl(() => { void navigator.clipboard.writeText(block.text) })}><CopyIcon /></button>
          <pre className="md__code"><code>{block.text}</code></pre>
        </div>
      )
    default:
      return <p className="md__p"><Runs runs={block.children} /></p>
  }
}

function Runs({ runs }: { runs: Inline[] }): JSX.Element {
  return <>{runs.map((r, i) => {
    switch (r.kind) {
      case 'code': return <code key={i} className="md__code-inline">{r.text}</code>
      case 'bold': return <strong key={i}><Runs runs={r.children} /></strong>
      case 'italic': return <em key={i}><Runs runs={r.children} /></em>
      /* Reachable by keyboard and announced with its URL (the Act II critic); never navigable — `link:open` is a verb. */
      case 'link': return <span key={i} className="md__link" title={r.href} tabIndex={0} aria-label={`${r.text} — ${r.href}`}>{r.text}</span>
      default: return <span key={i}>{r.text}</span>
    }
  })}</>
}
