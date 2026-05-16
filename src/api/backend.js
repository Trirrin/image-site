import { getStoredUser } from '../utils/authStorage'

const API_BASE = import.meta.env.VITE_BACKEND_URL || ''

function authHeaders() {
  const token = getStoredUser()?.token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })

  const text = await response.text()
  const data = text ? JSON.parse(text) : null
  if (!response.ok) {
    throw new Error(data?.error || text || `request failed with ${response.status}`)
  }
  return data
}

export function fetchModels({ endpoint, apiKey }) {
  return request('/api/models', {
    method: 'POST',
    body: JSON.stringify({ endpoint, apiKey }),
  })
}

export function createImageJob({ clientId, endpoint, apiKey, request: body }) {
  return request('/api/jobs', {
    method: 'POST',
    body: JSON.stringify({ clientId, endpoint, apiKey, request: body }),
  })
}

export function fetchJob({ clientId, jobId }) {
  return request(`/api/jobs/${encodeURIComponent(jobId)}?clientId=${encodeURIComponent(clientId)}`)
}

export function fetchJobs({ clientId }) {
  return request(`/api/jobs?clientId=${encodeURIComponent(clientId)}`)
}

export function authLogin({ email, password }) {
  return request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

export function authGroups() {
  return request('/api/auth/groups', { headers: authHeaders() })
}

export function authGenerateKey({ name, groupId }) {
  return request('/api/auth/generate-key', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ name, groupId }),
  })
}
