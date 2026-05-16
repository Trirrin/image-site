const JOB_TTL_SECONDS = 48 * 60 * 60
const MAX_IMAGE_BYTES = 18 * 1024 * 1024
const RUNNING_TIMEOUT_MS = 3 * 60 * 1000

export function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}

export function requireString(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required`)
  return value.trim()
}

export function normalizeEndpoint(endpoint) {
  const value = requireString(endpoint, 'endpoint').replace(/\/+$/, '')
  const url = new URL(value)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('endpoint must be http or https')
  return value
}

export function createJob(clientId, request) {
  const now = Date.now()
  return {
    id: crypto.randomUUID(),
    clientId,
    status: 'running',
    progress: 15,
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
    queuedAt: new Date(now).toISOString(),
    startedAt: '',
    finishedAt: '',
    attempts: 0,
    expiresAt: new Date(now + JOB_TTL_SECONDS * 1000).toISOString(),
    request: summarizeRequest(request),
    images: [],
    error: '',
  }
}

export function publicJob(job) {
  const normalized = normalizeStaleRunningJob(job)
  return {
    id: normalized.id,
    clientId: normalized.clientId,
    status: normalized.status,
    progress: normalized.progress,
    createdAt: normalized.createdAt,
    updatedAt: normalized.updatedAt,
    expiresAt: normalized.expiresAt,
    queuedAt: normalized.queuedAt || normalized.createdAt,
    startedAt: normalized.startedAt || '',
    finishedAt: normalized.finishedAt || '',
    attempts: normalized.attempts || 0,
    request: normalized.request,
    images: normalized.images || [],
    error: normalized.error || '',
  }
}

export async function putJob(env, job) {
  const response = await jobStore(env, job.clientId).fetch('https://job-store/jobs', {
    method: 'PUT',
    body: JSON.stringify({
      ...job,
      updatedAt: new Date().toISOString(),
    }),
  })
  if (!response.ok) throw new Error(await response.text())
}

export async function getJob(env, clientId, id) {
  const response = await jobStore(env, clientId).fetch(`https://job-store/jobs/${encodeURIComponent(id)}`)
  if (response.status === 404) return null
  if (!response.ok) throw new Error(await response.text())
  const data = await response.json()
  return data.job
}

export async function putJobPayload(env, clientId, jobId, payload) {
  const response = await jobStore(env, clientId).fetch(`https://job-store/jobs/${encodeURIComponent(jobId)}/payload`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
  if (!response.ok) throw new Error(await response.text())
}

export async function getJobPayload(env, clientId, jobId) {
  const response = await jobStore(env, clientId).fetch(`https://job-store/jobs/${encodeURIComponent(jobId)}/payload`)
  if (response.status === 404) return null
  if (!response.ok) throw new Error(await response.text())
  const data = await response.json()
  return data.payload
}

export async function putJobImages(env, clientId, jobId, images) {
  const response = await jobStore(env, clientId).fetch(`https://job-store/jobs/${encodeURIComponent(jobId)}/images`, {
    method: 'PUT',
    body: JSON.stringify({ clientId, images }),
  })
  if (!response.ok) throw new Error(await response.text())
  const data = await response.json()
  return data.images || []
}

export async function getJobImage(env, clientId, jobId, imageId) {
  const response = await jobStore(env, clientId).fetch(`https://job-store/jobs/${encodeURIComponent(jobId)}/images/${encodeURIComponent(imageId)}`)
  if (response.status === 404) return null
  if (!response.ok) throw new Error(await response.text())
  return response
}

export function normalizeStaleRunningJob(job) {
  if (job?.status !== 'running') return job
  const updatedAt = new Date(job.updatedAt || job.createdAt || 0).getTime()
  if (!Number.isFinite(updatedAt) || Date.now() - updatedAt < RUNNING_TIMEOUT_MS) return job
  return {
    ...job,
    status: 'error',
    progress: 100,
    error: job.error || 'generation worker timed out',
  }
}

export async function listJobs(env, clientId) {
  const response = await jobStore(env, clientId).fetch('https://job-store/jobs')
  if (!response.ok) throw new Error(await response.text())
  const data = await response.json()
  return (data.jobs || []).map(publicJob)
}

export async function generateImages(endpoint, apiKey, request) {
  const mode = request?.mode === 'edit' ? 'edit' : 'generate'
  const path = mode === 'edit' ? '/v1/images/edits' : '/v1/images/generations'
  const body = normalizeProviderSize(buildProviderRequest(request, mode))
  const response = await fetch(`${endpoint}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`API error (${response.status}): ${text || 'request failed'}`)

  const data = text ? JSON.parse(text) : {}
  const images = await normalizeImages(data)
  if (images.length === 0) throw new Error('provider returned no images')
  return { data, images }
}

async function normalizeImages(data) {
  const images = []
  for (const [idx, image] of collectProviderImages(data).entries()) {
    const normalized = await normalizeImage(image, idx)
    if (normalized) images.push(normalized)
  }
  return images
}

function collectProviderImages(data) {
  if (!data || typeof data !== 'object') return []
  for (const key of ['images', 'data', 'output', 'result', 'results']) {
    if (Array.isArray(data[key])) return data[key]
  }
  const nested = data.response || data.result || data.output
  if (nested && nested !== data) return collectProviderImages(nested)
  return []
}

async function normalizeImage(image, idx) {
  if (typeof image === 'string') return { id: `img-${idx}`, url: await imageToDataUrl(image) }
  if (!image || typeof image !== 'object') return null
  if (image.b64_json) return { id: image.id || `img-${idx}`, url: `data:image/png;base64,${image.b64_json}` }
  const url = image.url || image.image_url
  return url ? { id: image.id || `img-${idx}`, url: await imageToDataUrl(url) } : null
}

async function imageToDataUrl(url) {
  if (url.startsWith('data:')) return url
  try {
    const response = await fetch(url)
    if (!response.ok) return url
    const contentType = response.headers.get('content-type') || 'image/png'
    const contentLength = Number(response.headers.get('content-length') || 0)
    if (!contentType.startsWith('image/') || contentLength > MAX_IMAGE_BYTES) return url
    const bytes = await response.arrayBuffer()
    if (bytes.byteLength > MAX_IMAGE_BYTES) return url
    return `data:${contentType};base64,${arrayBufferToBase64(bytes)}`
  } catch {
    return url
  }
}

function normalizeProviderSize(request) {
  const match = typeof request.size === 'string' ? request.size.match(/^(\d+)x(\d+)$/) : null
  if (!match) return request
  const width = align16(Number(match[1]))
  const height = align16(Number(match[2]))
  if (width === Number(match[1]) && height === Number(match[2])) return request
  return { ...request, size: `${width}x${height}` }
}

function align16(value) {
  return Math.max(16, Math.round(value / 16) * 16)
}

function buildProviderRequest(request, mode) {
  if (mode !== 'edit') return request
  const images = Array.isArray(request.sourceImages)
    ? request.sourceImages.map((image) => ({ image_url: image.url || image.image_url })).filter((image) => image.image_url)
    : []
  const body = { ...request }
  delete body.sourceImages
  return { ...body, images }
}

function summarizeRequest(request) {
  return {
    prompt: typeof request.prompt === 'string' ? request.prompt : '',
    mode: request.mode === 'edit' ? 'edit' : 'generate',
    model: typeof request.model === 'string' ? request.model : '',
    n: Number.isFinite(request.n) ? request.n : undefined,
    size: typeof request.size === 'string' ? request.size : '',
    quality: typeof request.quality === 'string' ? request.quality : '',
    hasSourceImages: Array.isArray(request.sourceImages) && request.sourceImages.length > 0,
  }
}

function jobStore(env, clientId) {
  if (!env.IMAGE_SITE_JOB_STORE) throw new Error('IMAGE_SITE_JOB_STORE Durable Object binding is missing')
  const id = env.IMAGE_SITE_JOB_STORE.idFromName(requireString(clientId, 'clientId'))
  return env.IMAGE_SITE_JOB_STORE.get(id)
}

function arrayBufferToBase64(buffer) {
  let binary = ''
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}
