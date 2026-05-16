const JOB_TTL_SECONDS = 48 * 60 * 60
const JOB_INDEX_KEY = 'job-index'
const CHUNK_CHARS = 96 * 1024

export class JobStore {
  constructor(state) {
    this.state = state
  }

  async fetch(request) {
    const url = new URL(request.url)
    try {
      if (request.method === 'PUT' && url.pathname === '/jobs') return this.putJob(request)
      if (request.method === 'GET' && url.pathname === '/jobs') return this.listJobs()
      const payloadMatch = url.pathname.match(/^\/jobs\/([^/]+)\/payload$/)
      if (request.method === 'PUT' && payloadMatch) return this.putPayload(payloadMatch[1], request)
      if (request.method === 'GET' && payloadMatch) return this.getPayload(payloadMatch[1])
      const imagesMatch = url.pathname.match(/^\/jobs\/([^/]+)\/images$/)
      if (request.method === 'PUT' && imagesMatch) return this.putImages(imagesMatch[1], request)
      const imageMatch = url.pathname.match(/^\/jobs\/([^/]+)\/images\/([^/]+)$/)
      if (request.method === 'GET' && imageMatch) return this.getImage(imageMatch[1], imageMatch[2])
      if (request.method === 'GET' && url.pathname.startsWith('/jobs/')) return this.getJob(url.pathname.slice('/jobs/'.length))
      if (request.method === 'DELETE' && url.pathname === '/expired') return this.deleteExpired()
      return json({ error: 'method not allowed' }, 405)
    } catch (err) {
      return json({ error: err.message || 'job store failed' }, 500)
    }
  }

  async putJob(request) {
    const job = await request.json()
    validateJob(job)
    const now = new Date().toISOString()
    const next = { ...job, updatedAt: now }
    await this.state.storage.put(jobKey(job.id), next)

    const index = await this.readIndex()
    const existing = index.find((item) => item.id === job.id)
    if (existing) {
      existing.createdAt = next.createdAt
      existing.expiresAt = next.expiresAt
    } else {
      index.push({ id: next.id, createdAt: next.createdAt, expiresAt: next.expiresAt })
    }
    await this.writeIndex(index)
    return json({ ok: true, job: next })
  }

  async getJob(id) {
    const job = await this.state.storage.get(jobKey(id))
    if (!job) return json({ error: 'job not found' }, 404)
    return json({ job })
  }

  async putPayload(jobId, request) {
    validateJobId(jobId)
    const payloadText = await request.text()
    const chunkCount = Math.ceil(payloadText.length / CHUNK_CHARS)
    await this.deletePayload(jobId)
    await this.state.storage.put(payloadMetaKey(jobId), { chunkCount })
    for (let i = 0; i < chunkCount; i += 1) {
      await this.state.storage.put(payloadChunkKey(jobId, i), payloadText.slice(i * CHUNK_CHARS, (i + 1) * CHUNK_CHARS))
    }
    return json({ ok: true })
  }

  async getPayload(jobId) {
    validateJobId(jobId)
    const meta = await this.state.storage.get(payloadMetaKey(jobId))
    if (!meta) return json({ error: 'payload not found' }, 404)
    let payloadText = ''
    for (let i = 0; i < meta.chunkCount; i += 1) {
      payloadText += await this.state.storage.get(payloadChunkKey(jobId, i)) || ''
    }
    return json({ payload: JSON.parse(payloadText) })
  }

  async putImages(jobId, request) {
    validateJobId(jobId)
    const body = await request.json()
    const images = Array.isArray(body.images) ? body.images : []
    const clientId = requireString(body.clientId, 'clientId')
    const stored = []

    for (const [idx, image] of images.entries()) {
      const id = safeImageId(image?.id || `img-${idx}`)
      const url = typeof image?.url === 'string' ? image.url : ''
      if (!url.startsWith('data:')) {
        stored.push({ id, url })
        continue
      }

      const parsed = parseDataUrl(url)
      const chunkCount = Math.ceil(parsed.data.length / CHUNK_CHARS)
      await this.state.storage.put(imageMetaKey(jobId, id), {
        contentType: parsed.contentType,
        encoding: parsed.encoding,
        chunkCount,
      })
      for (let i = 0; i < chunkCount; i += 1) {
        await this.state.storage.put(imageChunkKey(jobId, id, i), parsed.data.slice(i * CHUNK_CHARS, (i + 1) * CHUNK_CHARS))
      }
      stored.push({ id, url: `/api/jobs/${jobId}/images/${id}?clientId=${encodeURIComponent(clientId)}` })
    }

    return json({ images: stored })
  }

  async getImage(jobId, imageId) {
    validateJobId(jobId)
    const id = safeImageId(imageId)
    const meta = await this.state.storage.get(imageMetaKey(jobId, id))
    if (!meta) return json({ error: 'image not found' }, 404)

    let data = ''
    for (let i = 0; i < meta.chunkCount; i += 1) {
      data += await this.state.storage.get(imageChunkKey(jobId, id, i)) || ''
    }
    if (meta.encoding !== 'base64') return new Response(data, { headers: { 'Content-Type': meta.contentType } })
    return new Response(base64ToBytes(data), { headers: { 'Content-Type': meta.contentType } })
  }

  async listJobs() {
    const index = await this.readIndex()
    const jobs = []
    for (const item of index) {
      const job = await this.state.storage.get(jobKey(item.id))
      if (job) jobs.push(job)
    }
    jobs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    return json({ jobs })
  }

  async deleteExpired() {
    const now = Date.now()
    const index = await this.readIndex()
    const active = []
    let deleted = 0
    for (const item of index) {
      const expiresAt = new Date(item.expiresAt || 0).getTime()
      if (Number.isFinite(expiresAt) && expiresAt <= now) {
        const job = await this.state.storage.get(jobKey(item.id))
        await this.deleteJobImages(job)
        await this.state.storage.delete(jobKey(item.id))
        await this.deletePayload(item.id)
        deleted += 1
      } else {
        active.push(item)
      }
    }
    await this.writeIndex(active)
    return json({ deleted })
  }

  async deleteJobImages(job) {
    for (const image of job?.images || []) {
      const id = safeImageId(image.id)
      const meta = await this.state.storage.get(imageMetaKey(job.id, id))
      if (!meta) continue
      for (let i = 0; i < meta.chunkCount; i += 1) {
        await this.state.storage.delete(imageChunkKey(job.id, id, i))
      }
      await this.state.storage.delete(imageMetaKey(job.id, id))
    }
  }

  async deletePayload(jobId) {
    const meta = await this.state.storage.get(payloadMetaKey(jobId))
    if (!meta) return
    for (let i = 0; i < meta.chunkCount; i += 1) {
      await this.state.storage.delete(payloadChunkKey(jobId, i))
    }
    await this.state.storage.delete(payloadMetaKey(jobId))
  }

  async readIndex() {
    const index = await this.state.storage.get(JOB_INDEX_KEY)
    return Array.isArray(index) ? index : []
  }

  async writeIndex(index) {
    const cutoff = Date.now() - JOB_TTL_SECONDS * 1000
    const active = index.filter((item) => new Date(item.expiresAt || item.createdAt || 0).getTime() > cutoff)
    await this.state.storage.put(JOB_INDEX_KEY, active)
  }
}

function validateJob(job) {
  if (!job || typeof job !== 'object') throw new Error('job is required')
  validateJobId(job.id)
}

function validateJobId(id) {
  if (!/^[a-f0-9-]{36}$/i.test(id)) throw new Error('invalid job id')
}

function parseDataUrl(url) {
  const match = url.match(/^data:([^;,]+)(;base64)?,(.*)$/)
  if (!match) throw new Error('invalid image data url')
  return {
    contentType: match[1] || 'image/png',
    encoding: match[2] ? 'base64' : 'text',
    data: match[3] || '',
  }
}

function safeImageId(value) {
  return requireString(value, 'imageId').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80)
}

function requireString(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required`)
  return value.trim()
}

function jobKey(id) {
  return `job:${id}`
}

function payloadMetaKey(jobId) {
  return `payload:${jobId}:meta`
}

function payloadChunkKey(jobId, index) {
  return `payload:${jobId}:chunk:${index}`
}

function imageMetaKey(jobId, imageId) {
  return `image:${jobId}:${imageId}:meta`
}

function imageChunkKey(jobId, imageId, index) {
  return `image:${jobId}:${imageId}:chunk:${index}`
}

function base64ToBytes(value) {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}
