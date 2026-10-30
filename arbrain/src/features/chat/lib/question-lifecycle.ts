import type { QuestionPrompt } from '../hooks/useChat'
/** A finished or uncertain turn cannot accept a new answer. Preserve answers already confirmed. */
export function settleQuestions(prompts: QuestionPrompt[] = []): QuestionPrompt[] {
 return prompts.map(q => q.status === 'pending' ? { ...q, status: 'timeout' } : q)
}
