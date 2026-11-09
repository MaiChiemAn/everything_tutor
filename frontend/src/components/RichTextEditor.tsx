import { useEffect, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import Placeholder from '@tiptap/extension-placeholder'
import { createLowlight } from 'lowlight'
import pythonLanguage from 'highlight.js/lib/languages/python'
import javascriptLanguage from 'highlight.js/lib/languages/javascript'
import jsonGrammar from 'highlight.js/lib/languages/json'
import bashLanguage from 'highlight.js/lib/languages/bash'
import plainTextLanguage from 'highlight.js/lib/languages/plaintext'
import CodeMirror from '@uiw/react-codemirror'
import { javascript } from '@codemirror/lang-javascript'
import { json as jsonLanguage } from '@codemirror/lang-json'
import { python } from '@codemirror/lang-python'
import { indentUnit } from '@codemirror/language'
import { indentWithTab } from '@codemirror/commands'
import { keymap } from '@codemirror/view'
import { NodeSelection } from '@tiptap/pm/state'
import { Bold, Code, CodeXml, Heading2, Heading3, Italic, List, ListOrdered, Pencil, Strikethrough, Trash2, X } from 'lucide-react'
import type { RichDocument } from '../api'
import './RichTextEditor.css'

const lowlight = createLowlight({ python: pythonLanguage, py: pythonLanguage, javascript: javascriptLanguage, typescript: javascriptLanguage, json: jsonGrammar, bash: bashLanguage, text: plainTextLanguage, plaintext: plainTextLanguage })
const extensions = [
  StarterKit.configure({ codeBlock: false }),
  CodeBlockLowlight.configure({ lowlight, defaultLanguage: 'python' }),
  Placeholder.configure({ placeholder: 'Write the question here. Use the toolbar to format text or add a code block.' }),
]
const emptyDocument: RichDocument = { type: 'doc', content: [{ type: 'paragraph' }] }
type Language = 'python' | 'javascript' | 'json' | 'text'

export default function RichTextEditor({ value, onChange, label, compact = false }: { value: RichDocument; onChange: (value: RichDocument) => void; label: string; compact?: boolean }) {
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const editor = useEditor({
    extensions,
    content: value || emptyDocument,
    immediatelyRender: false,
    editorProps: { attributes: { 'aria-label': label, class: 'rich-editor-prose' } },
    onUpdate: ({ editor: current }) => onChangeRef.current(current.getJSON() as RichDocument),
  })
  const [codeModal, setCodeModal] = useState(false)
  const [code, setCode] = useState('')
  const [language, setLanguage] = useState<Language>('python')
  const [editingPosition, setEditingPosition] = useState<number | null>(null)

  useEffect(() => {
    if (editor && value && JSON.stringify(editor.getJSON()) !== JSON.stringify(value)) editor.commands.setContent(value)
  }, [editor, value])

  if (!editor) return <div className="rich-editor-shell"><label>{label}</label><div className="rich-editor-loading">Loading editor…</div></div>

  function activeCodeBlock() {
    const { selection } = editor!.state
    if (selection instanceof NodeSelection && selection.node.type.name === 'codeBlock') return { position: selection.from, node: selection.node }
    let depth = selection.$from.depth
    while (depth > 0 && selection.$from.node(depth).type.name !== 'codeBlock') depth -= 1
    return depth > 0 ? { position: selection.$from.before(depth), node: selection.$from.node(depth) } : null
  }
  function openCodeEditor() {
    const current = activeCodeBlock()
    setEditingPosition(current?.position ?? null)
    setCode(current?.node.textContent ?? '')
    const currentLanguage = current?.node.attrs.language
    setLanguage(currentLanguage === 'javascript' || currentLanguage === 'json' || currentLanguage === 'text' ? currentLanguage : 'python')
    setCodeModal(true)
  }
  function saveCodeBlock() {
    const nodes = code ? [{ type: 'text', text: code }] : []
    if (editingPosition !== null) {
      const oldNode = editor!.state.doc.nodeAt(editingPosition)
      const newNode = editor!.schema.nodes.codeBlock.create({ language }, nodes.map(node => editor!.schema.text(node.text)))
      if (oldNode && newNode) editor!.view.dispatch(editor!.state.tr.replaceWith(editingPosition, editingPosition + oldNode.nodeSize, newNode))
    } else {
      editor!.chain().focus().insertContent({ type: 'codeBlock', attrs: { language }, content: nodes }).run()
    }
    setCodeModal(false)
    editor!.commands.focus()
  }
  function removeCodeBlock() {
    const current = activeCodeBlock()
    if (current) editor!.view.dispatch(editor!.state.tr.delete(current.position, current.position + current.node.nodeSize))
  }
  const languageExtension = language === 'javascript' ? javascript() : language === 'json' ? jsonLanguage() : python()
  const codeExtensions = [...(language === 'text' ? [] : [languageExtension]), indentUnit.of('    '), keymap.of([indentWithTab])]

  return <div className={`rich-editor-shell ${compact ? 'compact' : ''}`}>
    <label className="rich-editor-label">{label}</label>
    <div className="rich-editor-toolbar" role="toolbar" aria-label={`${label} formatting`}>
      <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => editor.chain().focus().toggleBold().run()} aria-label="Bold" aria-pressed={editor.isActive('bold')}><Bold size={15}/></button>
      <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => editor.chain().focus().toggleItalic().run()} aria-label="Italic" aria-pressed={editor.isActive('italic')}><Italic size={15}/></button>
      {!compact && <>
        <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} aria-label="Heading 2" aria-pressed={editor.isActive('heading', { level: 2 })}><Heading2 size={16}/></button>
        <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} aria-label="Heading 3" aria-pressed={editor.isActive('heading', { level: 3 })}><Heading3 size={16}/></button>
        <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => editor.chain().focus().toggleBulletList().run()} aria-label="Bulleted list" aria-pressed={editor.isActive('bulletList')}><List size={16}/></button>
        <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => editor.chain().focus().toggleOrderedList().run()} aria-label="Numbered list" aria-pressed={editor.isActive('orderedList')}><ListOrdered size={16}/></button>
      </>}
      <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => editor.chain().focus().toggleCode().run()} aria-label="Inline code" aria-pressed={editor.isActive('code')}><Code size={15}/></button>
      <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => editor.chain().focus().toggleStrike().run()} aria-label="Strikethrough" aria-pressed={editor.isActive('strike')}><Strikethrough size={15}/></button>
      <span className="rich-toolbar-divider"/>
      <button type="button" onMouseDown={e => e.preventDefault()} onClick={openCodeEditor} aria-label={activeCodeBlock() ? 'Edit selected code block' : 'Insert Python code block'}><CodeXml size={16}/><span>{activeCodeBlock() ? 'Edit code' : 'Code block'}</span></button>
      {activeCodeBlock() && <button type="button" className="rich-toolbar-delete" onMouseDown={e => e.preventDefault()} onClick={removeCodeBlock} aria-label="Delete selected code block"><Trash2 size={15}/></button>}
    </div>
    <EditorContent editor={editor}/>
    {codeModal && <div className="code-modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setCodeModal(false) }}><section className="code-modal" role="dialog" aria-modal="true" aria-labelledby="code-modal-title"><header><div><small>CODE BLOCK</small><h3 id="code-modal-title">{editingPosition === null ? 'Insert code' : 'Edit code'}</h3></div><button type="button" onClick={() => setCodeModal(false)} aria-label="Close code editor"><X size={19}/></button></header><label className="code-language-label">Language<select value={language} onChange={e => setLanguage(e.target.value as Language)}><option value="python">Python</option><option value="javascript">JavaScript</option><option value="json">JSON</option><option value="text">Plain text</option></select></label><CodeMirror value={code} height="250px" extensions={codeExtensions} onChange={setCode} basicSetup={{ lineNumbers: true, foldGutter: true, highlightActiveLine: true, bracketMatching: true, autocompletion: true }} aria-label={`${language} code editor`}/><footer><button type="button" className="secondary" onClick={() => setCodeModal(false)}>Cancel</button><button type="button" className="primary" onClick={saveCodeBlock}>{editingPosition === null ? 'Insert code block' : 'Save code block'}</button></footer></section></div>}
  </div>
}
