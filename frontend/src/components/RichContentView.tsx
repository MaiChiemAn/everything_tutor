import { Fragment, lazy, Suspense, type ReactNode } from 'react'
import type { RichDocument, RichNode } from '../api'
import './RichTextEditor.css'
import './RichTextOverrides.css'

const CodeSnippet = lazy(() => import('./CodeSnippet'))

function plainText(node: RichNode): string {
  if (node.type === 'text') return node.text || ''
  if (node.type === 'hardBreak') return '\n'
  return (node.content || []).map(plainText).join(node.type === 'paragraph' ? '\n' : '')
}

function renderNode(node: RichNode, key: number | string, copyable: boolean): ReactNode {
  if (node.type === 'text') {
    let text: ReactNode = node.text || ''
    for (const mark of node.marks || []) {
      if (mark.type === 'bold') text = <strong>{text}</strong>
      else if (mark.type === 'italic') text = <em>{text}</em>
      else if (mark.type === 'strike') text = <s>{text}</s>
      else if (mark.type === 'code') text = <code className="rich-inline-code">{text}</code>
    }
    return <Fragment key={key}>{text}</Fragment>
  }
  const children = (node.content || []).map((child, index) => renderNode(child, index, copyable))
  switch (node.type) {
    case 'paragraph': return <p key={key}>{children}</p>
    case 'heading': {
      const level = node.attrs?.level === 3 ? 3 : 2
      return level === 3 ? <h3 key={key}>{children}</h3> : <h2 key={key}>{children}</h2>
    }
    case 'bulletList': return <ul key={key}>{children}</ul>
    case 'orderedList': return <ol key={key}>{children}</ol>
    case 'listItem': return <li key={key}>{children}</li>
    case 'blockquote': return <blockquote key={key}>{children}</blockquote>
    case 'hardBreak': return <br key={key}/>
    case 'horizontalRule': return <hr key={key}/>
    case 'codeBlock': return <Suspense key={key} fallback={<pre className="rich-code-fallback"><code>{plainText(node)}</code></pre>}><CodeSnippet code={plainText(node)} language={node.attrs?.language || 'python'} copyable={copyable}/></Suspense>
    default: return <Fragment key={key}>{children}</Fragment>
  }
}

export default function RichContentView({ content, className = '', copyable = true }: { content: RichDocument | string | null | undefined; className?: string; copyable?: boolean }) {
  if (!content) return null
  let document: RichDocument
  if (typeof content === 'string') document = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: content }] }] }
  else document = content
  return <div className={`rich-content-view ${className}`}>{(document.content || []).map((node, index) => renderNode(node, index, copyable))}</div>
}
