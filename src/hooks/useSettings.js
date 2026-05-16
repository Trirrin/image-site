import { useState, useEffect, useCallback } from 'react'

const STORAGE_KEY = 'image-site:provider-config'
const LAST_MODEL_KEY = 'image-site:last-model'
const CLIENT_ID_KEY = 'image-site:client-id'

const defaults = { endpoint: '', apiKey: '', clientId: '', groupId: null, groupName: '' }

function createClientId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `client-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
}

function getClientId(parsed) {
  const existing = parsed?.clientId || window.localStorage.getItem(CLIENT_ID_KEY)
  if (existing) return existing
  const next = createClientId()
  window.localStorage.setItem(CLIENT_ID_KEY, next)
  return next
}

function load() {
  if (typeof window === 'undefined') return defaults
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return {
      endpoint: parsed.endpoint ?? '',
      apiKey: parsed.apiKey ?? '',
      clientId: getClientId(parsed),
      groupId: parsed.groupId ?? null,
      groupName: parsed.groupName ?? '',
    }
  } catch {
    return { ...defaults, clientId: getClientId({}) }
  }
}

function save(config) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(CLIENT_ID_KEY, config.clientId)
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
  } catch { /* ignore */ }
}

export function useSettings() {
  const [config, setConfig] = useState(load)
  const [lastModel, setLastModel] = useState(() => {
    if (typeof window === 'undefined') return ''
    return window.localStorage.getItem(LAST_MODEL_KEY) || ''
  })

  useEffect(() => { save(config) }, [config])

  const updateConfig = useCallback((patch) => setConfig((prev) => ({ ...prev, ...patch })), [])

  const updateLastModel = useCallback((model) => {
    setLastModel(model)
    if (typeof window !== 'undefined') {
      try { window.localStorage.setItem(LAST_MODEL_KEY, model) } catch { /* ignore */ }
    }
  }, [])

  const isConfigured = Boolean(config.endpoint.trim() && config.apiKey.trim() && config.clientId.trim() && config.groupId != null)

  return { config, updateConfig, isConfigured, lastModel, updateLastModel }
}
