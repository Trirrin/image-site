export function normalizeOptimizedPromptItems(prompts) {
  if (!Array.isArray(prompts)) return []
  return prompts.map((item) => {
    if (typeof item === 'string') return item.trim()
    return typeof item?.prompt === 'string' ? item.prompt.trim() : ''
  }).filter(Boolean)
}

export function buildJobPromptText(optimizedPrompt, fallbackPrompt) {
  const fallback = typeof fallbackPrompt === 'string' ? fallbackPrompt.trim() : ''
  const prompt = typeof optimizedPrompt?.prompt === 'string' ? optimizedPrompt.prompt.trim() : ''
  const items = normalizeOptimizedPromptItems(optimizedPrompt?.prompts)
  if (items.length === 0) return { prompt: prompt || fallback }

  const lead = prompt && !items.some((item) => promptTextIncludesItem(prompt, item)) ? prompt : fallback
  const outputPlan = items.map((item, index) => [
    `Image ${index + 1} must be generated as a separate image file.`,
    `Image ${index + 1} direction: ${item}`,
  ].join('\n')).join('\n\n')

  const opener = [
    `Generate exactly ${items.length} separate images.`,
    `Return ${items.length} independent output images, not one combined canvas.`,
    'Do not merge them into a collage, grid, contact sheet, storyboard, split-screen, or multi-panel image.',
    lead ? `Original user request: ${lead}` : '',
  ].filter(Boolean).join(' ')
  return { prompt: `${opener}\n\n${outputPlan}` }
}

function promptTextIncludesItem(text, item) {
  if (!text || !item) return false
  const needle = item.length > 80 ? item.slice(0, 80) : item
  return text.includes(needle)
}
