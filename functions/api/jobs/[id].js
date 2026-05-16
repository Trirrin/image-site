import { getJob, json, publicJob, requireString } from '../_shared.js'

export async function onRequestGet({ env, params, request }) {
  try {
    const url = new URL(request.url)
    const clientId = requireString(url.searchParams.get('clientId'), 'clientId')
    const job = await getJob(env, clientId, params.id)
    if (!job) return json({ error: 'job not found' }, 404)
    return json({ job: publicJob(job) })
  } catch (err) {
    return json({ error: err.message || 'failed to get job' }, 500)
  }
}

export function onRequest() {
  return json({ error: 'method not allowed' }, 405)
}
