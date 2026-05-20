export function applyPromptReviewEdit(draft, editedPrompt = '') {
  if (!draft) return null
  const promptText = typeof editedPrompt === 'string' ? editedPrompt.trim() : ''
  if (!promptText) return draft
  return {
    ...draft,
    optimizedPrompt: {
      ...draft.optimizedPrompt,
      prompt: promptText,
    },
  }
}
