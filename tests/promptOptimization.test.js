import test from 'node:test'
import assert from 'node:assert/strict'
import { applyPromptReviewEdit } from '../src/utils/promptOptimization.js'

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
