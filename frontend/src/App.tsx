import { lazy, Suspense, useEffect, useReducer, useState } from 'react'
import { BookOpen, Check, ChevronLeft, ChevronRight, CircleHelp, Code2, LayoutDashboard, LogOut, Plus, Sparkles, Trophy, Volume2, VolumeX, X } from 'lucide-react'
import { api, type AnswerFeedback, type Attempt, type AttemptSummary, type Collection, type QuizQuestion, type RichDocument, type User } from './api'
import RichContentView from './components/RichContentView'

type View = 'dashboard' | 'questions' | 'practice' | 'history' | 'result'
const optionLabel = (letter: string) => ({ A: 'option_a', B: 'option_b', C: 'option_c', D: 'option_d' }[letter] as 'option_a' | 'option_b' | 'option_c' | 'option_d')
const correctMessages = ['Excellent! 🎉', 'Correct answer! 🌟', 'Great job! 👏']
const incorrectMessages = ["Not quite! Let's learn from this one. 💪", 'Oops! Every mistake helps you grow. 😊', 'Keep going, you can do it! 🌱']
const CollectionManager = lazy(() => import('./components/CollectionManager'))

type QuizAnswerState = { questionId: number; selectedAnswer: string; isCorrect: boolean | null; correctAnswer: string | null; explanation: RichDocument | null; status: 'checking' | 'correct' | 'incorrect' }
type QuizSessionState = { sessionId: number; collectionId: number | null; currentQuestionIndex: number; checkingQuestionId: number | null; answers: Record<number, QuizAnswerState> }
type QuizSessionAction =
  | { type: 'RESET' }
  | { type: 'START'; collectionId: number }
  | { type: 'NAVIGATE'; index: number }
  | { type: 'SELECT'; questionId: number; selectedAnswer: string; sessionId: number }
  | { type: 'FEEDBACK'; questionId: number; feedback: AnswerFeedback; sessionId: number }
  | { type: 'FAILED'; questionId: number; sessionId: number }

const initialQuizSession: QuizSessionState = { sessionId: 0, collectionId: null, currentQuestionIndex: 0, checkingQuestionId: null, answers: {} }
function quizSessionReducer(state: QuizSessionState, action: QuizSessionAction): QuizSessionState {
  if (action.type === 'RESET') return { ...initialQuizSession, sessionId: state.sessionId + 1 }
  if (action.type === 'START') return { ...initialQuizSession, sessionId: state.sessionId + 1, collectionId: action.collectionId }
  if (action.type === 'NAVIGATE') return state.checkingQuestionId === null ? { ...state, currentQuestionIndex: action.index } : state
  if (action.sessionId !== state.sessionId) return state
  if (action.type === 'SELECT') {
    if (state.checkingQuestionId !== null || state.answers[action.questionId]) return state
    return { ...state, checkingQuestionId: action.questionId, answers: { ...state.answers, [action.questionId]: { questionId: action.questionId, selectedAnswer: action.selectedAnswer, isCorrect: null, correctAnswer: null, explanation: null, status: 'checking' } } }
  }
  if (action.type === 'FEEDBACK') {
    const answer = state.answers[action.questionId]
    if (!answer || answer.status !== 'checking') return state
    return { ...state, checkingQuestionId: null, answers: { ...state.answers, [action.questionId]: { ...answer, isCorrect: action.feedback.is_correct, correctAnswer: action.feedback.correct_answer, explanation: action.feedback.explanation || null, status: action.feedback.is_correct ? 'correct' : 'incorrect' } } }
  }
  if (action.type === 'FAILED') {
    const answers = { ...state.answers }
    delete answers[action.questionId]
    return { ...state, checkingQuestionId: null, answers }
  }
  return state
}

function playFeedbackSound(correct: boolean, context: AudioContext) {
  try {
    const notes = correct ? [660, 880] : [330]
    notes.forEach((frequency, index) => {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.type = 'sine'
      oscillator.frequency.value = frequency
      gain.gain.setValueAtTime(0.0001, context.currentTime + index * 0.13)
      gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + index * 0.13 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + index * 0.13 + 0.16)
      oscillator.connect(gain); gain.connect(context.destination)
      oscillator.start(context.currentTime + index * 0.13)
      oscillator.stop(context.currentTime + index * 0.13 + 0.17)
    })
    window.setTimeout(() => { void context.close() }, 500)
  } catch { /* Audio is optional; visual feedback remains available. */ }
}

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [view, setView] = useState<View>('dashboard')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([])
  const [collections, setCollections] = useState<Collection[]>([])
  const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null)
  const [quizSession, dispatchQuiz] = useReducer(quizSessionReducer, initialQuizSession)
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem('soundEnabled') !== 'false')
  const [attempt, setAttempt] = useState<Attempt | null>(null)
  const [history, setHistory] = useState<AttemptSummary[]>([])

  useEffect(() => { const saved = localStorage.getItem('user'); if (saved) setUser(JSON.parse(saved)) }, [])
  useEffect(() => { if (user) loadViewData().catch(e => setError(e.message)) }, [user, view])
  async function loadViewData() {
    if (!user) return
    if (user.role === 'student' && view === 'practice') {
      if (quizSession.collectionId === null) { dispatchQuiz({ type: 'RESET' }); setSelectedCollection(null); setQuizQuestions([]); setAttempt(null) }
      setCollections(await api<Collection[]>('/collections'))
    }
    if (user.role === 'student' && view === 'history') setHistory(await api<AttemptSummary[]>('/quiz/history'))
  }
  async function authSubmit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError('')
    try {
      if (authMode === 'register') { await api('/auth/register', { method: 'POST', body: JSON.stringify({ email, password, full_name: fullName }) }) }
      const result = await api<{ access_token: string; user: User }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
      localStorage.setItem('token', result.access_token); localStorage.setItem('user', JSON.stringify(result.user)); setUser(result.user)
    } catch (e) { setError((e as Error).message) } finally { setLoading(false) }
  }
  function logout() { localStorage.clear(); setUser(null); setView('dashboard'); setAttempt(null); setSelectedCollection(null); setQuizQuestions([]); dispatchQuiz({ type: 'RESET' }) }
  async function submitQuiz() {
    if (!selectedCollection || quizSession.checkingQuestionId !== null) return
    setError('')
    try { const result = await api<Attempt>(`/collections/${selectedCollection.id}/submit`, { method: 'POST', body: JSON.stringify({ answers: Object.values(quizSession.answers).filter(answer => answer.status === 'correct' || answer.status === 'incorrect').map(answer => ({ question_id: answer.questionId, selected_answer: answer.selectedAnswer })) }) }); setAttempt(result); setView('result') }
    catch (e) { setError((e as Error).message) }
  }
  async function startCollectionQuiz(collection: Collection) {
    setError('')
    try {
      const rows = await api<QuizQuestion[]>(`/collections/${collection.id}/quiz`)
      setSelectedCollection(collection); setQuizQuestions(rows); dispatchQuiz({ type: 'START', collectionId: collection.id })
    } catch (e) { setError((e as Error).message) }
  }
  function exitQuiz() {
    if (Object.keys(quizSession.answers).length > 0 && !confirm('Exit this quiz and clear its saved answers?')) return
    dispatchQuiz({ type: 'RESET' }); setSelectedCollection(null); setQuizQuestions([])
  }
  function startAnotherQuiz() {
    dispatchQuiz({ type: 'RESET' }); setSelectedCollection(null); setQuizQuestions([]); setAttempt(null); setView('practice')
  }
  async function chooseAnswer(questionId: number, selectedAnswer: string) {
    if (!selectedCollection || quizSession.answers[questionId] || quizSession.checkingQuestionId !== null) return
    const sessionId = quizSession.sessionId
    dispatchQuiz({ type: 'SELECT', questionId, selectedAnswer, sessionId })
    setError('')
    let audioContext: AudioContext | null = null
    if (soundEnabled) {
      try { audioContext = new AudioContext(); void audioContext.resume() } catch { audioContext = null }
    }
    try {
      const result = await api<AnswerFeedback>('/quiz/answer-feedback', { method: 'POST', body: JSON.stringify({ collection_id: selectedCollection.id, question_id: questionId, selected_answer: selectedAnswer }) })
      dispatchQuiz({ type: 'FEEDBACK', questionId, feedback: result, sessionId })
      if (audioContext) playFeedbackSound(result.is_correct, audioContext)
    } catch (e) {
      if (audioContext) void audioContext.close()
      dispatchQuiz({ type: 'FAILED', questionId, sessionId })
      setError((e as Error).message)
    }
  }
  function handleOptionKeyDown(event: React.KeyboardEvent<HTMLDivElement>, questionId: number, letter: string) {
    if (['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'].includes(event.key)) {
      event.preventDefault()
      const options = Array.from(document.querySelectorAll<HTMLElement>('.options [role="radio"]:not([aria-disabled="true"])'))
      const index = options.indexOf(event.currentTarget)
      const direction = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1
      options[(index + direction + options.length) % options.length]?.focus()
    } else if ((event.key === 'Enter' || event.key === ' ') && !quizSession.answers[questionId] && quizSession.checkingQuestionId === null) {
      event.preventDefault()
      void chooseAnswer(questionId, letter)
    }
  }
  async function openAttempt(id: number) { try { setAttempt(await api<Attempt>(`/quiz/attempts/${id}`)); setView('result') } catch (e) { setError((e as Error).message) } }

  const current = quizSession.currentQuestionIndex
  const activeQuestion = quizQuestions[current]
  const activeAnswer = activeQuestion ? quizSession.answers[activeQuestion.id] : undefined
  const isCheckingAnswer = quizSession.checkingQuestionId !== null
  const answeredCount = Object.keys(quizSession.answers).length

  if (!user) return <main className="auth-page"><section className="auth-art"><div className="brand"><span className="brand-icon"><Code2 size={22}/></span> PyPractice</div><div className="art-copy"><div className="eyebrow"><Sparkles size={14}/> YOUR PYTHON JOURNEY STARTS HERE</div><h1>Write code.<br/><span>Think clearly.</span></h1><p>Build your Python confidence one question at a time.</p><div className="code-card"><div className="code-dots"><i/><i/><i/><span>hello.py</span></div><pre><b>def</b> <em>keep_learning</em>():<br/>  <b>while</b> True:<br/>    practice()<br/>    <b>return</b> <em>confidence</em></pre></div></div><div className="art-foot">Made for curious minds <span>✦</span> Learn at your own pace</div></section><section className="auth-side"><form className="auth-form" onSubmit={authSubmit}><div className="mobile-brand"><Code2/> PyPractice</div><div className="form-heading"><div className="eyebrow">{authMode === 'login' ? 'WELCOME BACK' : 'GET STARTED'}</div><h2>{authMode === 'login' ? 'Sign in to continue' : 'Create your account'}</h2><p>{authMode === 'login' ? 'Pick up where you left off.' : 'Your next Python milestone is one step away.'}</p></div>{error && <div className="error-box">{error}</div>}{authMode === 'register' && <label>Your name<input required value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Alex Morgan"/></label>}<label>Email address<input required type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com"/></label><label>Password<input required minLength={8} type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters"/></label><button className="primary full" disabled={loading}>{loading ? 'Please wait…' : authMode === 'login' ? 'Sign in' : 'Create account'} <ChevronRight size={17}/></button><p className="auth-switch">{authMode === 'login' ? 'New to PyPractice?' : 'Already have an account?'} <button type="button" onClick={() => { setError(''); setAuthMode(authMode === 'login' ? 'register' : 'login') }}>{authMode === 'login' ? 'Create account' : 'Sign in'}</button></p><p className="auth-note">Teacher accounts are provisioned by your administrator.</p></form></section></main>

  const isTeacher = user.role === 'teacher'
  const nav = isTeacher ? [['dashboard', 'Dashboard', LayoutDashboard], ['questions', 'Collections', BookOpen]] as const : [['dashboard', 'Dashboard', LayoutDashboard], ['practice', 'Practice Quiz', CircleHelp], ['history', 'My History', Trophy]] as const
  const titles: Record<View, string> = { dashboard: 'Dashboard', questions: 'Quiz Collections', practice: 'Practice Quiz', history: 'My History', result: 'Quiz Results' }
  return <div className="app-shell"><aside className="sidebar"><div className="brand"><span className="brand-icon"><Code2 size={21}/></span><span>PyPractice</span></div><div className="nav-caption">MENU</div><nav>{nav.map(([key, title, Icon]) => <button key={key} className={`nav-item ${view === key ? 'active' : ''}`} onClick={() => { setError(''); setView(key as View) }}><Icon size={18}/>{title}</button>)}</nav><div className="sidebar-bottom"><div className="sidebar-tip"><span className="tip-icon"><Sparkles size={17}/></span><b>Keep going!</b><p>Every great developer started with a first line of code.</p></div><button className="profile" onClick={logout}><div className="avatar">{user.full_name.charAt(0).toUpperCase()}</div><span><b>{user.full_name}</b><small>{user.role === 'teacher' ? 'Teacher' : 'Student'}</small></span><LogOut className="logout" size={17}/></button></div></aside>
    <main className="main"><header className="topbar"><div className="mobile-brand"><Code2/> PyPractice</div><h1>{titles[view]}</h1><div className="top-user"><span className="status-dot"/> {isTeacher ? 'Teacher workspace' : 'Learning space'} <div className="avatar small">{user.full_name.charAt(0).toUpperCase()}</div></div></header><div className="content">{error && <div className="error-box dismiss"><span>{error}</span><button onClick={() => setError('')}><X size={16}/></button></div>}
      {view === 'dashboard' && <><section className="welcome"><div><div className="eyebrow">{isTeacher ? 'TEACHER WORKSPACE' : 'YOUR LEARNING SPACE'}</div><h2>{isTeacher ? `Welcome back, ${user.full_name.split(' ')[0]}.` : `Ready to practice, ${user.full_name.split(' ')[0]}?`}</h2><p>{isTeacher ? 'Your classroom is ready. Keep your question bank fresh.' : 'A little practice today goes a long way.'}</p></div><div className="welcome-art"><Code2 size={82} strokeWidth={1.1}/><span className="sparkle s1">✦</span><span className="sparkle s2">✧</span></div></section><div className="section-head"><div><h3>Quick access</h3><p>Jump back into what matters</p></div></div><div className="quick-grid">{isTeacher ? <><button className="quick-card" onClick={() => setView('questions')}><span className="card-icon purple"><BookOpen size={21}/></span><b>Manage collections</b><p>Organize question sets by topic and keep them up to date.</p><span className="card-link">Open collections <ChevronRight size={15}/></span></button><button className="quick-card" onClick={() => setView('questions')}><span className="card-icon green"><Plus size={21}/></span><b>Create a collection</b><p>Group your questions into a new topic.</p><span className="card-link">Create a collection <ChevronRight size={15}/></span></button></> : <><button className="quick-card" onClick={() => setView('practice')}><span className="card-icon purple"><CircleHelp size={21}/></span><b>Practice quiz</b><p>Test what you know with a quick Python quiz.</p><span className="card-link">Start practicing <ChevronRight size={15}/></span></button><button className="quick-card" onClick={() => setView('history')}><span className="card-icon gold"><Trophy size={21}/></span><b>Your progress</b><p>Look back at your recent quiz attempts.</p><span className="card-link">View history <ChevronRight size={15}/></span></button></>}</div><section className="quote-card"><span>“</span><div><b>{isTeacher ? 'Great questions create great programmers.' : 'The only way to learn a new programming language is by writing programs in it.'}</b><small>{isTeacher ? 'A little inspiration for your classroom' : '— Dennis Ritchie'}</small></div><Code2 size={34}/></section></>}

      {view === 'questions' && <Suspense fallback={<div className="empty">Loading collections…</div>}><CollectionManager /></Suspense>}

 
 
 
 
 
 
      {view === 'practice' && <>
        {!selectedCollection ? collections.length === 0 ? <div className="empty"><span className="card-icon purple"><CircleHelp/></span><h3>No quiz collections yet</h3><p>Your teacher has not published a collection. Check back soon.</p></div> : <>
          <div className="section-head"><div><h3>Choose a topic</h3><p>Pick a collection to start practicing</p></div></div>
          <div className="collection-select-grid">{collections.map(collection => <button className="collection-select-card" key={collection.id} disabled={collection.question_count === 0} onClick={() => startCollectionQuiz(collection)}><span className="card-icon purple"><BookOpen size={20}/></span><span className="collection-select-copy"><b>{collection.name}</b><small>{collection.description || 'Practice Python questions in this topic.'}</small><em>{collection.question_count} {collection.question_count === 1 ? 'question' : 'questions'}</em></span><ChevronRight size={18}/></button>)}</div>
        </> : quizQuestions.length === 0 ? <div className="empty"><span className="card-icon purple"><CircleHelp/></span><h3>No questions in {selectedCollection.name} yet</h3><p>Choose another collection or check back after your teacher adds questions.</p><button className="secondary" onClick={() => setSelectedCollection(null)}><ChevronLeft size={16}/> All collections</button></div> : <>
          <div className="quiz-top"><div><button className="back-link" disabled={isCheckingAnswer} onClick={exitQuiz}><ChevronLeft size={15}/> Exit quiz</button><h3>{selectedCollection.name}</h3><p>Take your time. You’ve got this.</p></div><div className="quiz-tools"><button className="secondary sound-toggle" type="button" aria-label={soundEnabled ? 'Disable answer sounds' : 'Enable answer sounds'} aria-pressed={soundEnabled} onClick={() => setSoundEnabled(value => { localStorage.setItem('soundEnabled', String(!value)); return !value })}>{soundEnabled ? <Volume2 size={15}/> : <VolumeX size={15}/>} Sound {soundEnabled ? 'on' : 'off'}</button><div className="quiz-count">Question <b>{current + 1}</b> of {quizQuestions.length}</div></div></div>
          <div className="progress" aria-label={`${answeredCount} of ${quizQuestions.length} questions answered`}><span style={{ width: `${(answeredCount / quizQuestions.length) * 100}%` }}/></div>
          <div className="question-picker" role="group" aria-label="Question navigation">{quizQuestions.map((question, index) => { const saved = quizSession.answers[question.id]; const status = saved?.status === 'correct' ? 'is-correct' : saved?.status === 'incorrect' ? 'is-incorrect' : saved?.status === 'checking' ? 'is-checking' : 'is-unanswered'; return <button type="button" key={question.id} className={`question-picker-item ${status} ${index === current ? 'is-current' : ''}`} disabled={isCheckingAnswer} aria-current={index === current ? 'step' : undefined} aria-label={`Question ${index + 1}: ${saved?.status === 'correct' ? 'correct' : saved?.status === 'incorrect' ? 'incorrect' : saved?.status === 'checking' ? 'checking answer' : 'unanswered'}`} onClick={() => dispatchQuiz({ type: 'NAVIGATE', index })}>{index + 1}</button> })}<span className="picker-progress-label">{answeredCount} of {quizQuestions.length} answered</span></div>
          <article className="quiz-card"><div className="quiz-label">QUESTION {String(current + 1).padStart(2, '0')}</div><div className="quiz-question-rich"><RichContentView content={activeQuestion?.content}/></div>
            <div className="options" role="radiogroup" aria-label="Answer choices">{(['A', 'B', 'C', 'D'] as const).map(letter => { if (!activeQuestion) return null; const value = activeQuestion[optionLabel(letter)]; const selected = activeAnswer?.selectedAnswer === letter; const isCorrect = activeAnswer?.status === 'correct'; const isIncorrect = activeAnswer?.status === 'incorrect'; const isCorrectChoice = activeAnswer?.correctAnswer === letter; const stateClass = isCorrect && selected ? ' correct' : isIncorrect && selected ? ' incorrect' : isIncorrect && isCorrectChoice ? ' correct' : activeAnswer?.status === 'checking' && selected ? ' selected' : ''; const StateIcon = selected ? (isCorrect ? Check : isIncorrect ? X : null) : (isIncorrect && isCorrectChoice ? Check : null); const locked = Boolean(activeAnswer) || isCheckingAnswer; return <div key={letter} className={`option${stateClass}`} role="radio" aria-checked={selected} aria-disabled={locked} tabIndex={locked ? -1 : 0} onKeyDown={event => handleOptionKeyDown(event, activeQuestion.id, letter)} onClick={() => { if (!locked) void chooseAnswer(activeQuestion.id, letter) }}><span className="option-letter">{letter}</span><RichContentView content={value} copyable={false}/>{StateIcon && <StateIcon size={17} className="option-check" aria-hidden="true"/>}</div> })}</div>
            {isCheckingAnswer && <p className="answer-feedback pending" role="status" aria-live="polite">Checking your answer…</p>}
            {activeAnswer?.status === 'correct' && <div className="answer-feedback positive" role="status" aria-live="polite"><b>{correctMessages[current % correctMessages.length]}</b></div>}
            {activeAnswer?.status === 'incorrect' && <div className="answer-feedback gentle" role="status" aria-live="polite"><b>{incorrectMessages[current % incorrectMessages.length]}</b><p><strong>Correct answer: {activeAnswer.correctAnswer}</strong></p>{activeAnswer.explanation && <RichContentView className="answer-explanation-rich" content={activeAnswer.explanation}/>}</div>}
            <div className="quiz-footer"><button className="secondary" disabled={current === 0 || isCheckingAnswer} onClick={() => dispatchQuiz({ type: 'NAVIGATE', index: current - 1 })}><ChevronLeft size={16}/> Previous</button>{current < quizQuestions.length - 1 ? <button className="primary" disabled={isCheckingAnswer} onClick={() => dispatchQuiz({ type: 'NAVIGATE', index: current + 1 })}>Next Question <ChevronRight size={16}/></button> : <button className="primary" disabled={answeredCount !== quizQuestions.length || isCheckingAnswer} onClick={submitQuiz}>Finish quiz <Check size={16}/></button>}</div>
          </article>
        </>}
      </>}

      {view === 'result' && attempt && <><section className="result-hero"><div className="result-medal"><Trophy size={31}/></div><div className="eyebrow">{attempt.collection_name || 'QUIZ COMPLETE'}</div><h2>{attempt.score_percent >= 80 ? 'Fantastic work!' : attempt.score_percent >= 50 ? 'Nice effort!' : 'Keep practicing!'}</h2><p>You got {attempt.correct_count} out of {attempt.total_questions} questions right.</p><div className="score">{attempt.score_percent}<small>%</small></div><div className="result-stats"><span><i className="correct-dot"/>{attempt.correct_count} correct</span><span><i className="incorrect-dot"/>{attempt.incorrect_count} incorrect</span><span><CircleHelp size={15}/>{attempt.total_questions} total</span></div><button className="secondary" onClick={startAnotherQuiz}>Try another quiz <ChevronRight size={16}/></button></section><div className="section-head review-head"><div><h3>Question review</h3><p>Review each answer and learn as you go</p></div></div><div className="review-list">{attempt.answers.map((a, i) => <article className={`review-card ${a.is_correct ? 'is-correct' : 'is-incorrect'}`} key={a.question_id}><div className="review-title"><span className="review-status">{a.is_correct ? <Check size={14}/> : <X size={14}/>}</span><div><small>QUESTION {String(i + 1).padStart(2, '0')}</small><div className="review-rich-content"><RichContentView content={a.content}/></div></div></div><div className="review-answer rich-review-answers"><div className={a.is_correct ? "review-choice is-answer" : "review-choice is-wrong"}><span>Your answer · {a.selected_answer}</span><RichContentView content={a[optionLabel(a.selected_answer)]}/></div><div className="review-choice is-answer"><span>Correct answer · {a.correct_answer}</span><RichContentView content={a[optionLabel(a.correct_answer)]}/></div></div>{a.explanation && <div className="explanation"><Sparkles size={15}/><RichContentView content={a.explanation}/></div>}</article>)}</div></>}

      {view === 'history' && <><div className="section-head"><div><h3>Past attempts</h3><p>Each attempt is a chance to learn something new</p></div></div>{history.length === 0 ? <div className="empty"><span className="card-icon gold"><Trophy/></span><h3>Your progress starts here</h3><p>Complete your first quiz and your results will show up here.</p><button className="primary" onClick={() => setView('practice')}>Take a quiz <ChevronRight size={16}/></button></div> : <div className="history-list">{history.map((item, i) => <button className="history-row" key={item.id} onClick={() => openAttempt(item.id)}><div className="history-icon"><Trophy size={18}/></div><div className="history-main"><b>{item.collection_name || 'Quiz practice'}</b><small>{new Date(item.submitted_at).toLocaleString()}</small></div><div className="history-score"><b>{item.score_percent}%</b><small>{item.correct_count}/{item.total_questions} correct</small></div><ChevronRight size={18}/></button>)}</div>}</>}
    </div></main>
  </div>
}
