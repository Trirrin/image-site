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

export function optimizePrompt({ endpoint, apiKey, model, input }) {
  return request('/api/optimize-prompt', {
    method: 'POST',
    body: JSON.stringify({ endpoint, apiKey, model, input }),
  })
}

export async function optimizePromptStream({ endpoint, apiKey, model, input, onStatus }) {
  const response = await fetch(`${API_BASE}/api/optimize-prompt`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({ endpoint, apiKey, model, input }),
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || `request failed with ${response.status}`)
  }
  if (!response.body) throw new Error('stream response is not readable')

  let finalData = null
  for await (const event of readSseEvents(response.body)) {
    if (event.event === 'status' || event.event === 'progress') {
      onStatus?.(event.data)
    } else if (event.event === 'done') {
      finalData = event.data
    } else if (event.event === 'error') {
      throw new Error(event.data?.error || 'failed to optimize prompt')
    }
  }
  if (!finalData) throw new Error('optimizer stream ended without result')
  return finalData
}

async function* readSseEvents(stream) {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let index = buffer.indexOf('\n\n')
      while (index >= 0) {
        const chunk = buffer.slice(0, index)
        buffer = buffer.slice(index + 2)
        const event = parseSseEvent(chunk)
        if (event) yield event
        index = buffer.indexOf('\n\n')
      }
    }
    buffer += decoder.decode()
    const event = parseSseEvent(buffer)
    if (event) yield event
  } finally {
    reader.releaseLock()
  }
}

function parseSseEvent(chunk) {
  const lines = chunk.split('\n')
  let event = 'message'
  const data = []
  for (const line of lines) {
    if (line.startsWith('event:')) event = line.slice(6).trim()
    if (line.startsWith('data:')) data.push(line.slice(5).trimStart())
  }
  if (data.length === 0) return null
  try {
    return { event, data: JSON.parse(data.join('\n')) }
  } catch {
    return { event, data: data.join('\n') }
  }
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
