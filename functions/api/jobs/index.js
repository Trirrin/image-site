import {
  createJob,
  json,
  listJobs,
  normalizeEndpoint,
  publicJob,
  putJob,
  putJobPayload,
  requireString,
} from '../_shared.js'

export async function onRequestGet({ env, request }) {
  try {
    const url = new URL(request.url)
    const clientId = requireString(url.searchParams.get('clientId'), 'clientId')
    return json({ jobs: await listJobs(env, clientId) })
  } catch (err) {
    return json({ error: err.message || 'failed to list jobs' }, 500)
  }
}

export async function onRequestPost({ env, request }) {
  try {
    const body = await request.json()
    const clientId = requireString(body.clientId, 'clientId')
    const endpoint = normalizeEndpoint(body.endpoint)
    const apiKey = requireString(body.apiKey, 'apiKey')
    const imageRequest = body.request && typeof body.request === 'object' ? body.request : null
    if (!imageRequest) throw new Error('request is required')

    const job = createJob(clientId, imageRequest)
    await putJob(env, job)
    await putJobPayload(env, clientId, job.id, {
      endpoint,
      apiKey,
      request: imageRequest,
    })

    await env.IMAGE_SITE_QUEUE.send({
      clientId,
      jobId: job.id,
    })
    return json({ jobId: job.id, job: publicJob(job) }, 202)
  } catch (err) {
    return json({ error: err.message || 'failed to create job' }, 500)
  }
}

export function onRequest() {
  return json({ error: 'method not allowed' }, 405)
}
