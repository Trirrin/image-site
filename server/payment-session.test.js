import test from 'node:test'
import assert from 'node:assert/strict'
import { createPaymentSessionStore } from './payment-session.js'

function createTestStore(start = 1_000) {
  let current = start
  let nextId = 1
  const store = createPaymentSessionStore({
    ttlMs: 1_000,
    refreshSkewMs: 100,
    createId: () => `session-${nextId++}`,
    now: () => current,
  })
  return {
    store,
    tick: (ms) => { current += ms },
  }
}

function authFor(sessionId, userId = 7) {
  return { userId, paymentSessionId: sessionId }
}

test('creates an opaque payment session id and keeps provider tokens server-side', async () => {
  const { store } = createTestStore()
  const sessionId = store.create(7, {
    accessToken: 'sub-access-token',
    refreshToken: 'sub-refresh-token',
    expiresAt: 10_000,
  })
  const calls = []

  const result = await store.requestWithSession(
    authFor(sessionId),
    '/payment/checkout-info',
    { method: 'GET' },
    async (path, options) => {
      calls.push({ path, options })
      return { ok: true }
    },
    async () => assert.fail('refresh should not run')
  )

  assert.equal(sessionId, 'session-1')
  assert.equal(result.ok, true)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].path, '/payment/checkout-info')
  assert.equal(calls[0].options.token, 'sub-access-token')
})

test('refreshes the sub2api access token before expiry', async () => {
  const { store } = createTestStore()
  const sessionId = store.create(7, {
    accessToken: 'old-access',
    refreshToken: 'old-refresh',
    expiresAt: 1_050,
  })
  const refreshTokens = []

  const token = await store.getAccessToken(authFor(sessionId), async (refreshToken) => {
    refreshTokens.push(refreshToken)
    return { access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 10 }
  })

  assert.equal(token, 'new-access')
  assert.deepEqual(refreshTokens, ['old-refresh'])
})

test('retries a billing request after a 401 using the refresh token', async () => {
  const { store } = createTestStore()
  const sessionId = store.create(7, {
    accessToken: 'expired-access',
    refreshToken: 'refresh-token',
    expiresAt: 10_000,
  })
  const usedTokens = []

  const result = await store.requestWithSession(
    authFor(sessionId),
    '/payment/orders/my',
    { method: 'GET' },
    async (path, options) => {
      usedTokens.push(options.token)
      if (usedTokens.length === 1) {
        const error = new Error('expired')
        error.status = 401
        throw error
      }
      return { path, ok: true }
    },
    async (refreshToken) => {
      assert.equal(refreshToken, 'refresh-token')
      return { access_token: 'fresh-access', refresh_token: 'fresh-refresh', expires_in: 10 }
    }
  )

  assert.equal(result.ok, true)
  assert.deepEqual(usedTokens, ['expired-access', 'fresh-access'])
})

test('drops the payment session when refresh is rejected', async () => {
  const { store } = createTestStore()
  const sessionId = store.create(7, {
    accessToken: 'old-access',
    refreshToken: 'bad-refresh',
    expiresAt: 1_050,
  })

  await assert.rejects(
    () => store.getAccessToken(authFor(sessionId), async () => {
      const error = new Error('invalid refresh')
      error.status = 401
      throw error
    }),
    /payment session expired/
  )
  assert.equal(store.has(sessionId), false)
})

test('cleans up expired sessions', () => {
  const { store, tick } = createTestStore()
  const sessionId = store.create(7, {
    accessToken: 'access',
    refreshToken: 'refresh',
    expiresAt: 10_000,
  })

  assert.equal(store.has(sessionId), true)
  tick(1_001)
  store.cleanupExpired()
  assert.equal(store.has(sessionId), false)
})
