import { useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { javascript } from '@codemirror/lang-javascript'
import { json as jsonLanguage } from '@codemirror/lang-json'
import { python } from '@codemirror/lang-python'
import { Copy, Check } from 'lucide-react'

export default function CodeSnippet({ code, language, copyable = true }: { code: string; language: string; copyable?: boolean }) {
  const [copied, setCopied] = useState(false)
  const extension = language === 'javascript' || language === 'typescript' ? javascript({ typescript: language === 'typescript' }) : language === 'json' ? jsonLanguage() : language === 'python' || language === 'py' ? python() : []
  async function copyCode() {
    try { await navigator.clipboard.writeText(code); setCopied(true); window.setTimeout(() => setCopied(false), 1500) } catch { setCopied(false) }
  }
  return <div className="rich-code-view"><div className="rich-code-toolbar"><span>{language === 'py' ? 'Python' : language}</span>{copyable && <button type="button" onClick={copyCode} aria-label="Copy code snippet">{copied ? <Check size={13}/> : <Copy size={13}/>} {copied ? 'Copied' : 'Copy'}</button>}</div><CodeMirror value={code} extensions={Array.isArray(extension) ? extension : [extension]} readOnly basicSetup={{ lineNumbers: true, foldGutter: false, highlightActiveLine: false }} aria-label={`${language} code block`} /></div>
}
