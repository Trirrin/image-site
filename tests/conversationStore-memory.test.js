import test from 'node:test'
import assert from 'node:assert/strict'
import { stripTransientImageUrls } from '../src/storage/conversationStore.js'

const inlinePng = 'data:image/png;base64,aGVsbG8='

test('strips inline image payloads from persisted conversation records', () => {
  const stored = stripTransientImageUrls({
    id: 'conv-1',
    turns: [
      {
        id: 'turn-1',
        images: [
          { id: 'img-1', url: inlinePng, sourceUrl: inlinePng },
        ],
      },
    ],
  })

  assert.equal(stored.turns[0].images[0].localImageId, 'conv-1:turn-1:img-1')
  assert.equal(stored.turns[0].images[0].url, '')
  assert.equal(stored.turns[0].images[0].sourceUrl, '')
})

test('keeps persistent remote image urls as fallback sources', () => {
  const stored = stripTransientImageUrls({
    id: 'conv-1',
    turns: [
      {
        id: 'turn-1',
        images: [
          { id: 'img-1', url: 'blob:http://local/image', sourceUrl: 'https://example.test/image.png' },
        ],
      },
    ],
  })

  assert.equal(stored.turns[0].images[0].localImageId, 'conv-1:turn-1:img-1')
  assert.equal(stored.turns[0].images[0].url, 'https://example.test/image.png')
  assert.equal(stored.turns[0].images[0].sourceUrl, 'https://example.test/image.png')
})
