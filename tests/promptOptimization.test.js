import test from 'node:test'
import assert from 'node:assert/strict'
import { buildJobPromptText } from '../src/utils/promptComposition.js'
import { applyPromptReviewEdit } from '../src/utils/promptOptimization.js'

test('builds explicit numbered instructions for split image prompts', () => {
  const result = buildJobPromptText({
    prompt: 'shared product identity lock',
    prompts: [
      { title: '主图', prompt: 'hero image direction' },
      { title: '详情图', prompt: 'detail image direction' },
    ],
  }, 'fallback')

  assert.match(result.prompt, /Generate exactly 2 separate images/)
  assert.match(result.prompt, /Return 2 independent output images, not one combined canvas/)
  assert.match(result.prompt, /Image 1 must be generated as a separate image file\./)
  assert.match(result.prompt, /Image 1 direction: hero image direction/)
  assert.match(result.prompt, /Image 2 must be generated as a separate image file\./)
  assert.match(result.prompt, /Image 2 direction: detail image direction/)
})

test('preserves split prompts when the reviewed prompt is edited', () => {
  const draft = {
    conversationId: 'conv-1',
    optimizedPrompt: {
      prompt: 'original optimized prompt',
      prompts: [
        { title: 'Image 1', prompt: 'first split prompt' },
        { title: 'Image 2', prompt: 'second split prompt' },
      ],
    },
  }

  const next = applyPromptReviewEdit(draft, 'edited lead prompt')

  assert.equal(next.optimizedPrompt.prompt, 'edited lead prompt')
  assert.deepEqual(next.optimizedPrompt.prompts, draft.optimizedPrompt.prompts)
})

test('leaves the draft unchanged when the edit is blank', () => {
  const draft = { optimizedPrompt: { prompt: 'keep me', prompts: [] } }
  assert.equal(applyPromptReviewEdit(draft, '   '), draft)
})
