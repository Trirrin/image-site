import { getJobImage, json, requireString } from '../../../_shared.js'

export async function onRequestGet({ env, params, request }) {
  try {
    const url = new URL(request.url)
    const clientId = requireString(url.searchParams.get('clientId'), 'clientId')
    const response = await getJobImage(env, clientId, params.id, params.imageId)
    if (!response) return json({ error: 'image not found' }, 404)
    return response
  } catch (err) {
    return json({ error: err.message || 'failed to get image' }, 500)
  }
}

export function onRequest() {
  return json({ error: 'method not allowed' }, 405)
}
