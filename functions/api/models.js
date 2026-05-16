import { json, normalizeEndpoint, requireString } from './_shared.js'

export async function onRequestPost({ request }) {
  try {
    const body = await request.json()
    const endpoint = normalizeEndpoint(body.endpoint)
    const apiKey = requireString(body.apiKey, 'apiKey')
    const response = await fetch(`${endpoint}/v1/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    const text = await response.text()
    if (!response.ok) return json({ error: text || 'model request failed' }, response.status)
    return new Response(text || 'null', {
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    })
  } catch (err) {
    return json({ error: err.message || 'model request failed' }, 500)
  }
}

export function onRequest() {
  return json({ error: 'method not allowed' }, 405)
}
