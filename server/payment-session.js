import { randomUUID } from 'node:crypto'

const INVALID_REFRESH_STATUSES = new Set([400, 401, 403])

export function createPaymentSessionStore({ ttlMs, refreshSkewMs, createId = randomUUID, now = () => Date.now() }) {
  const sessions = new Map()

  function create(userId, subAuth) {
    const sessionId = createId()
    sessions.set(sessionId, {
      userId: Number(userId),
      accessToken: subAuth.accessToken,
      refreshToken: subAuth.refreshToken || '',
      accessExpiresAt: subAuth.expiresAt || 0,
      expiresAt: now() + ttlMs,
    })
    return sessionId
  }

  function deleteSession(sessionId) {
    sessions.delete(sessionId)
  }

  function getSession(auth) {
    const sessionId = auth.paymentSessionId
    const session = sessionId ? sessions.get(sessionId) : null
    if (!session || session.userId !== auth.userId || session.expiresAt <= now()) {
      if (sessionId) sessions.delete(sessionId)
      throwSessionExpired()
    }
    return session
  }

  async function requestWithSession(auth, path, options, requestSub2api, refreshSub2apiAuth) {
    const token = await getAccessToken(auth, refreshSub2apiAuth)
    try {
      return await requestSub2api(path, { ...options, token })
    } catch (error) {
      if (error.status !== 401) throw error
      const refreshedToken = await getAccessToken(auth, refreshSub2apiAuth, { forceRefresh: true })
      return requestSub2api(path, { ...options, token: refreshedToken })
    }
  }

  async function getAccessToken(auth, refreshSub2apiAuth, { forceRefresh = false } = {}) {
    const session = getSession(auth)
    if (!forceRefresh && session.accessToken && !shouldRefresh(session)) return session.accessToken
    if (!session.refreshToken) {
      sessions.delete(auth.paymentSessionId)
      throwSessionExpired()
    }

    try {
      const data = await refreshSub2apiAuth(session.refreshToken)
      if (!data?.access_token) {
        const error = new Error('sub2api did not return an access token')
        error.status = 401
        throw error
      }
      session.accessToken = data.access_token
      session.refreshToken = data.refresh_token || session.refreshToken
      session.accessExpiresAt = data.expires_in ? now() + Number(data.expires_in) * 1000 : 0
      session.expiresAt = now() + ttlMs
      return session.accessToken
    } catch (error) {
      if (INVALID_REFRESH_STATUSES.has(error.status)) {
        sessions.delete(auth.paymentSessionId)
        throwSessionExpired()
      }
      throw error
    }
  }

  function cleanupExpired() {
    const current = now()
    for (const [sessionId, session] of sessions) {
      if (!session || session.expiresAt <= current) sessions.delete(sessionId)
    }
  }

  function shouldRefresh(session) {
    return session.accessExpiresAt > 0 && session.accessExpiresAt <= now() + refreshSkewMs
  }

  return {
    create,
    delete: deleteSession,
    cleanupExpired,
    getAccessToken,
    requestWithSession,
    has: (sessionId) => sessions.has(sessionId),
    size: () => sessions.size,
  }
}

function throwSessionExpired() {
  const error = new Error('payment session expired; please log in again')
  error.status = 401
  throw error
}
