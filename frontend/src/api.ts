const API = import.meta.env.VITE_API_URL || 'http://localhost:8000/api'
export type RichNode = { type: string; text?: string; attrs?: Record<string, any>; marks?: { type: string }[]; content?: RichNode[] }
export type RichDocument = { type: 'doc'; content: RichNode[] }
export type User = { id: number; email: string; full_name: string; role: 'teacher' | 'student' }
export type Question = { id: number; collection_id: number; content: RichDocument; option_a: RichDocument; option_b: RichDocument; option_c: RichDocument; option_d: RichDocument; correct_answer: string; explanation?: RichDocument | null; created_at?: string }
export type QuizQuestion = Omit<Question, 'correct_answer' | 'explanation' | 'created_at' | 'collection_id'>
export type Collection = { id: number; name: string; description?: string | null; created_by: number; is_published: boolean; created_at: string; updated_at: string; question_count: number }
export type AnswerFeedback = { question_id: number; selected_answer: string; is_correct: boolean; correct_answer: string; explanation?: RichDocument | null }
export type Attempt = { id: number; collection_id?: number | null; collection_name?: string | null; total_questions: number; correct_count: number; incorrect_count: number; score_percent: number; submitted_at: string; answers: { question_id: number; content: RichDocument; option_a: RichDocument; option_b: RichDocument; option_c: RichDocument; option_d: RichDocument; selected_answer: string; correct_answer: string; is_correct: boolean; explanation?: RichDocument | null }[] }
export type AttemptSummary = Omit<Attempt, 'incorrect_count' | 'answers'>
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('token')
  const response = await fetch(`${API}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers } })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(typeof body.detail === 'string' ? body.detail : 'Something went wrong. Please try again.')
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}
