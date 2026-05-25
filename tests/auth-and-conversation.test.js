import test from 'node:test'
import assert from 'node:assert/strict'
import { clearStoredUser, getStoredUser, storeUser } from '../src/utils/authStorage.js'
import {
  deleteConversation,
  getActiveConversationId,
  getConversation,
  listConversations,
  saveConversation,
  setActiveConversationId,
  stripTransientImageUrls,
} from '../src/storage/conversationStore.js'

function installLocalStorage() {
  const values = new Map()
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, String(value)),
      removeItem: (key) => values.delete(key),
    },
  }
  return values
}

test('stores, loads, and clears the authenticated user', () => {
  installLocalStorage()

  storeUser({ id: 'user-1', token: 'token-1' })
  assert.deepEqual(getStoredUser(), { id: 'user-1', token: 'token-1' })

  clearStoredUser()
  assert.equal(getStoredUser(), null)
})

test('returns null when persisted user JSON is corrupted', () => {
  const values = installLocalStorage()
  values.set('image-site:sub2api-user', '{bad json')

  assert.equal(getStoredUser(), null)
})

test('persists conversations in memory when IndexedDB is unavailable', async () => {
  installLocalStorage()
  delete globalThis.window.indexedDB

  await saveConversation({ id: 'conv-a', createdAt: '2026-05-26T10:00:00.000Z', turns: [] })
  await saveConversation({ id: 'conv-b', createdAt: '2026-05-26T11:00:00.000Z', turns: [{ id: 'turn-b', images: [] }] })

  assert.deepEqual((await listConversations()).map((item) => item.id), ['conv-b', 'conv-a'])
  assert.equal((await getConversation('conv-b')).turns.length, 1)

  await setActiveConversationId('conv-b')
  assert.equal(await getActiveConversationId(), 'conv-b')

  await deleteConversation('conv-b')
  assert.equal(await getConversation('conv-b'), null)
  assert.equal(await getActiveConversationId(), null)
})

test('normalizes invalid conversation records before stripping image URLs', () => {
  assert.equal(stripTransientImageUrls(null), null)

  const stored = stripTransientImageUrls({
    id: 'conv-1',
    turns: [{ id: 'turn-1', images: [{ id: 'img-1', url: 'https://example.test/a.png' }] }],
  })

  assert.deepEqual(stored.turns[0].images[0], {
    id: 'img-1',
    localImageId: 'conv-1:turn-1:img-1',
    url: 'https://example.test/a.png',
    sourceUrl: 'https://example.test/a.png',
  })
})
