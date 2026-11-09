import { useEffect, useState, type FormEvent } from 'react'
import { ArrowLeft, BookOpen, Check, ChevronRight, CirclePlus, Pencil, Plus, Trash2, X } from 'lucide-react'
import { api, type Collection, type Question } from '../api'
import type { RichDocument } from '../api'
import RichTextEditor from './RichTextEditor'
import RichContentView from './RichContentView'
import './CollectionManager.css'

const emptyDoc: RichDocument = { type: 'doc', content: [{ type: 'paragraph' }] }
const blankQuestion = { content: emptyDoc, option_a: emptyDoc, option_b: emptyDoc, option_c: emptyDoc, option_d: emptyDoc, correct_answer: 'A', explanation: null as RichDocument | null }
const questionOption = (letter: string) => ({ A: 'option_a', B: 'option_b', C: 'option_c', D: 'option_d' }[letter] as 'option_a' | 'option_b' | 'option_c' | 'option_d')

export default function CollectionManager() {
  const [collections, setCollections] = useState<Collection[]>([])
  const [selected, setSelected] = useState<Collection | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [collectionModal, setCollectionModal] = useState(false)
  const [collectionEdit, setCollectionEdit] = useState<number | null>(null)
  const [collectionForm, setCollectionForm] = useState({ name: '', description: '', is_published: true })
  const [questionModal, setQuestionModal] = useState(false)
  const [previewMode, setPreviewMode] = useState(false)
  const [existingModal, setExistingModal] = useState(false)
  const [existingQuestions, setExistingQuestions] = useState<Question[]>([])
  const [questionEdit, setQuestionEdit] = useState<number | null>(null)
  const [questionForm, setQuestionForm] = useState(blankQuestion)
  const [error, setError] = useState('')

  useEffect(() => { void refreshCollections() }, [])
  async function refreshCollections() {
    try { setCollections(await api<Collection[]>('/collections')) }
    catch (e) { setError((e as Error).message) }
  }
  async function openCollection(collection: Collection) {
    setError('')
    try {
      const rows = await api<Question[]>(`/collections/${collection.id}/questions`)
      setSelected(collection); setQuestions(rows)
    } catch (e) { setError((e as Error).message) }
  }
  function newCollection() {
    setCollectionEdit(null); setCollectionForm({ name: '', description: '', is_published: true }); setCollectionModal(true)
  }
  function editCollection(collection: Collection) {
    setCollectionEdit(collection.id); setCollectionForm({ name: collection.name, description: collection.description || '', is_published: collection.is_published }); setCollectionModal(true)
  }
  async function saveCollection(e: FormEvent) {
    e.preventDefault(); setError('')
    try {
      const saved = await api<Collection>(collectionEdit ? `/collections/${collectionEdit}` : '/collections', { method: collectionEdit ? 'PUT' : 'POST', body: JSON.stringify({ ...collectionForm, description: collectionForm.description || null }) })
      setCollectionModal(false); await refreshCollections()
      if (selected?.id === saved.id) setSelected(saved)
      if (!collectionEdit) { setSelected(saved); setQuestions([]) }
    } catch (e) { setError((e as Error).message) }
  }
  async function deleteCollection(collection: Collection) {
    if (!confirm(`Delete “${collection.name}” and its questions? Collections used in quiz history cannot be deleted.`)) return
    setError('')
    try {
      await api(`/collections/${collection.id}`, { method: 'DELETE' })
      if (selected?.id === collection.id) { setSelected(null); setQuestions([]) }
      await refreshCollections()
    } catch (e) { setError((e as Error).message) }
  }
  async function togglePublished(collection: Collection) {
    setError('')
    try {
      const updated = await api<Collection>(`/collections/${collection.id}`, { method: 'PUT', body: JSON.stringify({ name: collection.name, description: collection.description, is_published: !collection.is_published }) })
      if (selected?.id === updated.id) setSelected(updated)
      await refreshCollections()
    } catch (e) { setError((e as Error).message) }
  }
  function newQuestion() { setQuestionEdit(null); setQuestionForm(blankQuestion); setPreviewMode(false); setQuestionModal(true) }
  async function showExistingQuestions() {
    if (!selected) return
    setError('')
    try {
      const rows = await api<Question[]>('/teacher/questions')
      setExistingQuestions(rows.filter(question => question.collection_id !== selected.id))
      setExistingModal(true)
    } catch (e) { setError((e as Error).message) }
  }
  async function addExistingQuestion(question: Question) {
    if (!selected) return
    setError('')
    try {
      await api(`/collections/${selected.id}/questions/${question.id}`, { method: 'PUT' })
      setExistingQuestions(rows => rows.filter(row => row.id !== question.id))
      setQuestions(await api<Question[]>(`/collections/${selected.id}/questions`)); await refreshCollections()
    } catch (e) { setError((e as Error).message) }
  }
  function editQuestion(question: Question) {
    setQuestionEdit(question.id); setQuestionForm({ content: question.content, option_a: question.option_a, option_b: question.option_b, option_c: question.option_c, option_d: question.option_d, correct_answer: question.correct_answer, explanation: question.explanation || null }); setPreviewMode(false); setQuestionModal(true)
  }
  async function saveQuestion(e: FormEvent) {
    e.preventDefault(); if (!selected) return
    setError('')
    try {
      await api(questionEdit ? `/teacher/questions/${questionEdit}` : `/collections/${selected.id}/questions`, { method: questionEdit ? 'PUT' : 'POST', body: JSON.stringify({ ...questionForm, explanation: questionForm.explanation || null }) })
      setQuestionModal(false); setQuestions(await api<Question[]>(`/collections/${selected.id}/questions`)); await refreshCollections()
    } catch (e) { setError((e as Error).message) }
  }
  async function deleteQuestion(question: Question) {
    if (!confirm('Delete this question? Questions in submitted quiz history cannot be deleted.')) return
    try {
      await api(`/teacher/questions/${question.id}`, { method: 'DELETE' })
      if (selected) setQuestions(await api<Question[]>(`/collections/${selected.id}/questions`))
      await refreshCollections()
    } catch (e) { setError((e as Error).message) }
  }

  return <>
    {error && <div className="error-box dismiss"><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss error"><X size={16}/></button></div>}
    {!selected ? <>
      <div className="section-head"><div><h3>Your quiz collections</h3><p>Group questions by topic and choose which sets students can practice.</p></div><button className="primary" onClick={newCollection}><Plus size={17}/> New collection</button></div>
      {collections.length === 0 ? <div className="empty"><span className="card-icon purple"><BookOpen/></span><h3>Start with a topic</h3><p>Create your first collection, then add questions directly to it.</p><button className="primary" onClick={newCollection}><Plus size={17}/> Create collection</button></div> : <div className="collection-grid">{collections.map(collection => <article className="collection-card" key={collection.id}><div className="collection-card-top"><span className="card-icon purple"><BookOpen size={20}/></span><div className={`publish-pill ${collection.is_published ? 'published' : 'draft'}`}>{collection.is_published ? 'Published' : 'Draft'}</div></div><h3>{collection.name}</h3><p className="collection-description">{collection.description || 'No description added.'}</p><div className="collection-card-meta">{collection.question_count} {collection.question_count === 1 ? 'question' : 'questions'}</div><div className="collection-card-actions"><button className="primary" onClick={() => openCollection(collection)}>Manage questions <ChevronRight size={15}/></button><button className="icon-button" onClick={() => editCollection(collection)} title="Edit collection" aria-label={`Edit ${collection.name}`}><Pencil size={16}/></button><button className="icon-button danger" onClick={() => deleteCollection(collection)} title="Delete collection" aria-label={`Delete ${collection.name}`}><Trash2 size={16}/></button></div><label className="publish-toggle"><input type="checkbox" checked={collection.is_published} onChange={() => togglePublished(collection)}/><span>Available to students</span></label></article>)}</div>}
    </> : <>
      <div className="section-head collection-detail-head"><div><button className="back-link" onClick={() => { setSelected(null); setQuestions([]); void refreshCollections() }}><ArrowLeft size={15}/> All collections</button><h3>{selected.name}</h3><p>{selected.description || 'No description added.'}</p></div><div className="detail-actions"><span className={`publish-pill ${selected.is_published ? 'published' : 'draft'}`}>{selected.is_published ? 'Published' : 'Draft'}</span><button className="secondary" onClick={() => editCollection(selected)}><Pencil size={15}/> Edit collection</button></div></div>
      <div className="section-head"><div><h3>Questions</h3><p>{questions.length} {questions.length === 1 ? 'question' : 'questions'} in this collection</p></div><div className="detail-actions"><button className="secondary" onClick={showExistingQuestions}><BookOpen size={15}/> Add existing</button><button className="primary" onClick={newQuestion}><Plus size={17}/> New question</button></div></div>
      {questions.length === 0 ? <div className="empty"><span className="card-icon green"><CirclePlus/></span><h3>Add the first question</h3><p>Create a new question here or move on to another collection.</p><button className="primary" onClick={newQuestion}><Plus size={17}/> Create question</button></div> : <div className="question-list">{questions.map((question, index) => <article className="question-card" key={question.id}><div className="question-num">{String(index + 1).padStart(2, '0')}</div><div className="question-info"><div className="question-rich-content"><RichContentView content={question.content}/></div><div className="question-meta"><span>Correct answer: <b>{question.correct_answer}</b></span>{question.created_at && <span>{new Date(question.created_at).toLocaleDateString()}</span>}</div></div><div className="question-actions"><button title="Edit question" aria-label="Edit question" onClick={() => editQuestion(question)}><Pencil size={16}/></button><button title="Delete question" aria-label="Delete question" onClick={() => deleteQuestion(question)}><Trash2 size={16}/></button></div></article>)}</div>}
    </>}

    {collectionModal && <div className="modal-backdrop" onClick={() => setCollectionModal(false)}><div className="modal" onClick={e => e.stopPropagation()}><div className="modal-head"><div><div className="eyebrow">QUIZ COLLECTION</div><h2>{collectionEdit ? 'Edit collection' : 'Create a collection'}</h2></div><button className="close-button" onClick={() => setCollectionModal(false)} aria-label="Close"><X/></button></div><form className="question-form" onSubmit={saveCollection}><label>Collection name<input required maxLength={120} value={collectionForm.name} onChange={e => setCollectionForm({ ...collectionForm, name: e.target.value })} placeholder="e.g. Python lists"/></label><label>Description <span className="optional">(optional)</span><textarea rows={3} maxLength={5000} value={collectionForm.description} onChange={e => setCollectionForm({ ...collectionForm, description: e.target.value })} placeholder="What will students practice in this set?"/></label><label className="check-label"><input type="checkbox" checked={collectionForm.is_published} onChange={e => setCollectionForm({ ...collectionForm, is_published: e.target.checked })}/> Publish this collection for students</label><div className="modal-actions"><button type="button" className="secondary" onClick={() => setCollectionModal(false)}>Cancel</button><button className="primary">{collectionEdit ? 'Save changes' : 'Create collection'} <ChevronRight size={16}/></button></div></form></div></div>}
    {existingModal && <div className="modal-backdrop" onClick={() => setExistingModal(false)}><div className="modal" onClick={e => e.stopPropagation()}><div className="modal-head"><div><div className="eyebrow">{selected?.name}</div><h2>Add existing questions</h2></div><button className="close-button" onClick={() => setExistingModal(false)} aria-label="Close"><X/></button></div>{existingQuestions.length === 0 ? <div className="empty existing-empty"><span className="card-icon green"><Check/></span><h3>All caught up</h3><p>There are no other questions available to add.</p></div> : <div className="existing-question-list">{existingQuestions.map(question => <article key={question.id}><div className="existing-question-content"><RichContentView content={question.content}/><small>From another collection</small></div><button className="secondary" onClick={() => addExistingQuestion(question)}><Plus size={15}/> Add</button></article>)}</div>}</div></div>}
    {questionModal && <div className="modal-backdrop" onClick={() => setQuestionModal(false)}><div className="modal rich-question-modal" onClick={e => e.stopPropagation()}>
      <div className="modal-head"><div><div className="eyebrow">{selected?.name}</div><h2>{questionEdit ? 'Edit question' : 'Create a question'}</h2></div><button className="close-button" onClick={() => setQuestionModal(false)} aria-label="Close"><X/></button></div>
      <div className="rich-form-tabs"><button className={!previewMode ? 'active' : ''} onClick={() => setPreviewMode(false)}>Edit</button><button className={previewMode ? 'active' : ''} onClick={() => setPreviewMode(true)}>Preview</button></div>
      {!previewMode ? <form className="question-form rich-question-form" onSubmit={saveQuestion}>
        <RichTextEditor label="Question" value={questionForm.content} onChange={content => setQuestionForm(form => ({ ...form, content }))}/>
        <div className="form-options rich-options">{(['A', 'B', 'C', 'D'] as const).map(letter => <RichTextEditor compact key={letter} label={`Option ${letter}`} value={questionForm[questionOption(letter)]} onChange={document => setQuestionForm(form => ({ ...form, [questionOption(letter)]: document }))}/>)}</div>
        <label>Correct answer<select value={questionForm.correct_answer} onChange={e => setQuestionForm({ ...questionForm, correct_answer: e.target.value })}>{['A', 'B', 'C', 'D'].map(value => <option key={value} value={value}>Option {value}</option>)}</select></label>
        <RichTextEditor label="Explanation (optional)" value={questionForm.explanation || emptyDoc} onChange={explanation => setQuestionForm({ ...questionForm, explanation })}/>
        <div className="modal-actions"><button type="button" className="secondary" onClick={() => setQuestionModal(false)}>Cancel</button><button type="button" className="secondary" onClick={() => setPreviewMode(true)}>Preview question</button><button className="primary">{questionEdit ? 'Save changes' : 'Create question'} <Check size={16}/></button></div>
      </form> : <form className="rich-question-preview" onSubmit={saveQuestion}><div className="preview-label">Question</div><RichContentView content={questionForm.content}/><div className="preview-label">Answer options</div><div className="preview-options">{(['A', 'B', 'C', 'D'] as const).map(letter => <div className={questionForm.correct_answer === letter ? 'preview-option is-answer' : 'preview-option'} key={letter}><b>{letter}</b><RichContentView content={questionForm[questionOption(letter)]}/></div>)}</div><div className="preview-label">Correct answer</div><p className="preview-correct">Option {questionForm.correct_answer}</p>{questionForm.explanation && <><div className="preview-label">Explanation</div><RichContentView content={questionForm.explanation}/></>}<div className="modal-actions"><button type="button" className="secondary" onClick={() => setPreviewMode(false)}>Back to editing</button><button className="primary" type="submit">{questionEdit ? 'Save changes' : 'Create question'} <Check size={16}/></button></div></form>}
    </div></div>}
  </>
}
