import { useMemo, type JSX } from 'react'
import { parseMarkdown, type Block, type Inline } from '@shared/markdown'
import { shellControl } from '@renderer/shell/shell-control'

/**
 * M167. The assistant's turn, rendered from `parseMarkdown`'s TREE — React
 * elements built from parsed nodes, never a string handed to `innerHTML`.
 * A fenced block carries a `Copy` verb that writes the fence's text through
 * the clipboard bridge (the same door `edit:copy` uses); a link renders as
 * TEXT with the URL on its title — a transcript is not a page, and `link:open`
 * is a verb, not a click on prose.
 */
export function Markdown({ text }: { text: string }): JSX.Element {
  const blocks = useMemo(() => parseMarkdown(text), [text])
  return <>{blocks.map((b, i) => <BlockView key={i} block={b} />)}</>
}

function BlockView({ block }: { block: Block }): JSX.Element {
  switch (block.kind) {
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
          <button type="button" className="md__copy pf__verb pf__verb--word" data-md-copy title="Copy this block"
            {...shellControl(() => { void navigator.clipboard.writeText(block.text) })}>Copy</button>
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
      case 'link': return <span key={i} className="md__link" title={r.href}>{r.text}</span>
      default: return <span key={i}>{r.text}</span>
    }
  })}</>
}
