import { createServer } from 'node:http'
import { createReadStream, existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { createHmac, randomUUID, randomBytes, timingSafeEqual } from 'node:crypto'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import bcrypt from 'bcryptjs'
import { isEcomOptimizerModel, optimizeEcomPrompt } from '../functions/api/ecom-prompt-engine.js'

const PORT = Number(process.env.PORT || 8787)
const JOB_TTL_MS = 48 * 60 * 60 * 1000
const MAX_BODY_BYTES = 50 * 1024 * 1024
const MAX_IMAGE_BYTES = 18 * 1024 * 1024
const RUNNING_TIMEOUT_MS = 30 * 60 * 1000
const SUB2API_API_URL = normalizeBaseUrl(process.env.SUB2API_API_URL || 'http://127.0.0.1:10001')
const SUB2API_CONTROL_API_URL = normalizeBaseUrl(process.env.SUB2API_CONTROL_API_URL || 'http://127.0.0.1:10000/api/v1')

const DB_PASSWORD = readRequiredEnv('SUB2API_DB_PASSWORD')
const AUTH_SECRET = readRequiredEnv('IMAGE_SITE_AUTH_SECRET')
const AUTH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000

const pool = new pg.Pool({
  host: process.env.SUB2API_DB_HOST || 'localhost',
  port: Number(process.env.SUB2API_DB_PORT || 5432),
  user: process.env.SUB2API_DB_USER || 'sub2api_imggen',
  password: DB_PASSWORD,
  database: process.env.SUB2API_DB_NAME || 'sub2api_imggen',
  max: 10,
})

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DIST_DIR = join(ROOT_DIR, 'dist')
const JOB_DIR = process.env.IMAGE_SITE_JOB_DIR || join(ROOT_DIR, '.data', 'jobs')

const runningJobs = new Set()

function readRequiredEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '')
}

await mkdir(JOB_DIR, { recursive: true })
await cleanupExpiredJobs()
setInterval(cleanupExpiredJobs, 60 * 60 * 1000).unref()

const server = createServer(async (req, res) => {
  try {
    setCorsHeaders(res)
    if (req.method === 'OPTIONS') {
      sendJson(res, 204, null)
      return
    }

    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
    if (url.pathname === '/api/health' && req.method === 'GET') {
      sendJson(res, 200, { ok: true })
      return
    }
    if (url.pathname === '/api/auth/login' && req.method === 'POST') {
      await handleAuthLogin(req, res)
      return
    }
    if (url.pathname === '/api/auth/groups' && req.method === 'GET') {
      await handleAuthGroups(req, res)
      return
    }
    if (url.pathname === '/api/auth/generate-key' && req.method === 'POST') {
      await handleGenerateKey(req, res)
      return
    }
    if (url.pathname === '/api/billing/checkout-info' && req.method === 'GET') {
      await handleBillingProxy(req, res, '/payment/checkout-info')
      return
    }
    if (url.pathname === '/api/billing/subscriptions/summary' && req.method === 'GET') {
      await handleBillingProxy(req, res, '/subscriptions/summary')
      return
    }
    if (url.pathname === '/api/billing/subscriptions/active' && req.method === 'GET') {
      await handleBillingProxy(req, res, '/subscriptions/active')
      return
    }
    if (url.pathname === '/api/billing/orders' && req.method === 'POST') {
      await handleBillingProxy(req, res, '/payment/orders', { method: 'POST', body: await readJson(req) })
      return
    }
    if (url.pathname === '/api/billing/orders/my' && req.method === 'GET') {
      await handleBillingProxy(req, res, `/payment/orders/my${url.search}`)
      return
    }
    if (url.pathname === '/api/billing/orders/verify' && req.method === 'POST') {
      await handleBillingProxy(req, res, '/payment/orders/verify', { method: 'POST', body: await readJson(req) })
      return
    }
    if (url.pathname === '/api/models' && req.method === 'POST') {
      await handleModels(req, res)
      return
    }
    if (url.pathname === '/api/optimize-prompt' && req.method === 'POST') {
      await handleOptimizePrompt(req, res)
      return
    }
    if (url.pathname === '/api/jobs' && req.method === 'POST') {
      await handleCreateJob(req, res)
      return
    }
    if (url.pathname === '/api/jobs' && req.method === 'GET') {
      await handleListJobs(url, res)
      return
    }
    if (url.pathname.startsWith('/api/jobs/') && req.method === 'GET') {
      await handleGetJob(url, res)
      return
    }

    await serveStatic(url, res)
  } catch (error) {
    sendJson(res, 500, { error: error.message || 'internal server error' })
  }
})

server.listen(PORT, () => {
  console.log(`image-site backend listening on http://localhost:${PORT}`)
})

async function handleAuthLogin(req, res) {
  const body = await readJson(req)
  const email = requireString(body.email, 'email')
  const password = requireString(body.password, 'password')

  let rows
  try {
    ;({ rows } = await pool.query(
      `SELECT id, email, password_hash, status FROM users WHERE email = $1 AND deleted_at IS NULL`,
      [email]
    ))
  } catch {
    sendJson(res, 503, { error: 'database connection failed' })
    return
  }
  if (rows.length === 0) {
    sendJson(res, 401, { error: 'invalid email or password' })
    return
  }
  const user = rows[0]
  if (!bcrypt.compareSync(password, user.password_hash)) {
    sendJson(res, 401, { error: 'invalid email or password' })
    return
  }
  if (user.status !== 'active') {
    sendJson(res, 403, { error: 'account is not active' })
    return
  }

  const subAuth = await trySub2apiLogin(email, password)
  sendJson(res, 200, {
    user: {
      id: user.id,
      email: user.email,
      token: createAuthToken(user, subAuth),
      paymentReady: Boolean(subAuth?.accessToken),
    },
  })
}

async function trySub2apiLogin(email, password) {
  try {
    const data = await requestSub2api('/auth/login', {
      method: 'POST',
      body: { email, password },
    })
    if (!data?.access_token) return null
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || '',
      expiresAt: data.expires_in ? Date.now() + Number(data.expires_in) * 1000 : 0,
    }
  } catch {
    return null
  }
}

function createAuthToken(user, subAuth = null) {
  const payload = Buffer.from(JSON.stringify({
    sub: String(user.id),
    email: user.email,
    exp: Date.now() + AUTH_TOKEN_TTL_MS,
    subAccessToken: subAuth?.accessToken || '',
    subRefreshToken: subAuth?.refreshToken || '',
    subTokenExpiresAt: subAuth?.expiresAt || 0,
  })).toString('base64url')
  return `${payload}.${signAuthPayload(payload)}`
}

function signAuthPayload(payload) {
  return createHmac('sha256', AUTH_SECRET).update(payload).digest('base64url')
}

function requireAuth(req, res) {
  const header = req.headers.authorization || ''
  const token = header.match(/^Bearer\s+(.+)$/i)?.[1]
  const auth = parseAuthToken(token)
  if (!auth) {
    sendJson(res, 401, { error: 'authentication required' })
    return null
  }
  return auth
}

function parseAuthToken(token) {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [payload, signature] = parts
  const expected = signAuthPayload(payload)
  if (!timingSafeTextEqual(signature, expected)) return null

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    const userId = Number(data.sub)
    if (!userId || !Number.isFinite(userId)) return null
    if (!Number.isFinite(data.exp) || data.exp < Date.now()) return null
    return {
      userId,
      email: data.email || '',
      subAccessToken: typeof data.subAccessToken === 'string' ? data.subAccessToken : '',
      subRefreshToken: typeof data.subRefreshToken === 'string' ? data.subRefreshToken : '',
      subTokenExpiresAt: Number.isFinite(data.subTokenExpiresAt) ? data.subTokenExpiresAt : 0,
    }
  } catch {
    return null
  }
}

function timingSafeTextEqual(a, b) {
  const left = Buffer.from(a || '')
  const right = Buffer.from(b || '')
  return left.length === right.length && timingSafeEqual(left, right)
}

async function handleBillingProxy(req, res, path, options = {}) {
  const auth = requireAuth(req, res)
  if (!auth) return
  if (!auth.subAccessToken) {
    sendJson(res, 403, { error: 'payment session is unavailable; please log in again' })
    return
  }

  try {
    const data = await requestSub2api(path, {
      method: options.method || 'GET',
      token: auth.subAccessToken,
      body: options.body,
      headers: {
        'Accept-Language': req.headers['accept-language'] || '',
      },
    })
    sendJson(res, 200, data)
  } catch (error) {
    sendJson(res, error.status || 502, { error: error.message || 'sub2api request failed' })
  }
}

async function requestSub2api(path, { method = 'GET', token = '', body, headers = {} } = {}) {
  const requestHeaders = {
    Accept: 'application/json',
    ...headers,
  }
  if (token) requestHeaders.Authorization = `Bearer ${token}`
  const init = { method, headers: requestHeaders }
  if (body !== undefined) {
    requestHeaders['Content-Type'] = 'application/json'
    init.body = JSON.stringify(body)
  }

  const response = await fetch(`${SUB2API_CONTROL_API_URL}${path}`, init)
  const text = await response.text()
  const payload = parseJsonText(text)
  const unwrapped = unwrapSub2apiPayload(payload)
  if (!response.ok) {
    const error = new Error(extractSub2apiError(payload, text) || `sub2api request failed with ${response.status}`)
    error.status = response.status
    throw error
  }
  if (unwrapped?.error) {
    const error = new Error(unwrapped.error)
    error.status = unwrapped.status || 502
    throw error
  }
  return unwrapped?.data ?? null
}

function parseJsonText(text) {
  if (!text) return null
  try { return JSON.parse(text) }
  catch { return null }
}

function unwrapSub2apiPayload(payload) {
  if (!payload || typeof payload !== 'object' || !Object.prototype.hasOwnProperty.call(payload, 'code')) {
    return { data: payload }
  }
  if (payload.code === 0) return { data: payload.data ?? null }
  return { error: payload.message || payload.reason || 'sub2api request failed', status: Number(payload.code) || 502 }
}

function extractSub2apiError(payload, fallbackText) {
  if (payload && typeof payload === 'object') {
    return payload.message || payload.error || payload.reason || ''
  }
  return fallbackText
}

async function handleAuthGroups(req, res) {
  const auth = requireAuth(req, res)
  if (!auth) return
  const userId = auth.userId

  let allGroups, allowedRows, subRows
  try {
    ;({ allGroups, allowedRows, subRows } = await loadGroupAccess(userId))
  } catch {
    sendJson(res, 503, { error: 'database connection failed' })
    return
  }
  const groups = getAvailableGroups({ allGroups, allowedRows, subRows })

  sendJson(res, 200, { groups })
}

async function loadGroupAccess(userId) {
  const [{ rows: allGroups }, { rows: allowedRows }, { rows: subRows }] = await Promise.all([
    pool.query(
      `SELECT id, name, description, status, subscription_type, is_exclusive FROM groups WHERE deleted_at IS NULL AND status = 'active' ORDER BY sort_order, id`
    ),
    pool.query(
      `SELECT group_id FROM user_allowed_groups WHERE user_id = $1`,
      [userId]
    ),
    pool.query(
      `SELECT group_id FROM user_subscriptions WHERE user_id = $1 AND status = 'active' AND expires_at > NOW()`,
      [userId]
    ),
  ])
  return { allGroups, allowedRows, subRows }
}

function getAvailableGroups({ allGroups, allowedRows, subRows }) {
  const allowedSet = new Set(allowedRows.map((r) => r.group_id))
  const subscribedSet = new Set(subRows.map((r) => r.group_id))

  return allGroups.filter((g) => {
    if (g.subscription_type === 'subscription') return subscribedSet.has(g.id)
    return !g.is_exclusive || allowedSet.has(g.id)
  })
}

function generateApiKey() {
  const bytes = randomBytes(32)
  return 'sk-' + Buffer.from(bytes).toString('hex')
}

async function handleGenerateKey(req, res) {
  const auth = requireAuth(req, res)
  if (!auth) return
  const body = await readJson(req)
  const userId = auth.userId
  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : 'image-site-key'
  const groupId = Number(body.groupId)
  if (!groupId || !Number.isFinite(groupId)) {
    sendJson(res, 400, { error: 'groupId is required' })
    return
  }

  let rows
  try {
    ;({ rows } = await pool.query(
      `SELECT id, status FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [userId]
    ))
  } catch {
    sendJson(res, 503, { error: 'database connection failed' })
    return
  }
  if (rows.length === 0) {
    sendJson(res, 404, { error: 'user not found' })
    return
  }
  if (rows[0].status !== 'active') {
    sendJson(res, 403, { error: 'account is not active' })
    return
  }

  let group
  try {
    const access = await loadGroupAccess(userId)
    const groups = getAvailableGroups(access)
    group = groups.find((item) => Number(item.id) === groupId)
  } catch {
    sendJson(res, 503, { error: 'database connection failed' })
    return
  }
  if (!group) {
    sendJson(res, 403, { error: 'group is not available for this user' })
    return
  }

  let key
  try {
    const { rows: existingRows } = await pool.query(
      `SELECT key FROM api_keys
       WHERE user_id = $1 AND group_id = $2 AND status = 'active'
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      [userId, groupId]
    )
    key = existingRows[0]?.key
    if (!key) {
      key = generateApiKey()
      await pool.query(
        `INSERT INTO api_keys (user_id, key, name, group_id, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'active', NOW(), NOW())`,
        [userId, key, name, groupId]
      )
    }
  } catch {
    sendJson(res, 503, { error: 'database connection failed' })
    return
  }

  sendJson(res, 200, { key, endpoint: SUB2API_API_URL, group })
}

async function handleModels(req, res) {
  const body = await readJson(req)
  const endpoint = normalizeEndpoint(body.endpoint)
  const apiKey = requireString(body.apiKey, 'apiKey')

  const response = await fetch(`${endpoint}/v1/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  const text = await response.text()
  if (!response.ok) {
    sendJson(res, response.status, { error: text || 'model request failed' })
    return
  }
  sendRawJson(res, 200, text)
}

async function handleOptimizePrompt(req, res) {
  const body = await readJson(req)
  const wantsStream = acceptsEventStream(req)
  if (wantsStream) {
    await handleOptimizePromptStream(body, res)
    return
  }

  const { optimized } = await runPromptOptimization(body)
  sendJson(res, 200, { optimized })
}

async function handleOptimizePromptStream(body, res) {
  sendSseHeaders(res)
  const send = (event, data = {}) => writeSse(res, event, data)
  send('status', { stage: 'received', message: '已收到优化请求' })
  try {
    send('status', { stage: 'optimizing', message: '意图模型正在优化提示词' })
    const { optimized } = await runPromptOptimization(body, (progress) => send('progress', progress))
    send('done', { optimized })
  } catch (error) {
    send('error', { error: error.message || 'failed to optimize prompt' })
  } finally {
    res.end()
  }
}

async function runPromptOptimization(body, onProgress) {
  const input = body.input && typeof body.input === 'object' ? body.input : {}
  const model = typeof body.model === 'string' ? body.model.trim() : ''
  if (!model || !isEcomOptimizerModel(model)) {
    throw new Error('电商 Skill 优化失败。请关闭「电商 Skill」后再直接生图。')
  }

  const endpoint = normalizeEndpoint(body.endpoint)
  const apiKey = requireString(body.apiKey, 'apiKey')
  const { optimized } = await optimizeEcomPrompt({ endpoint, apiKey, model, input, onProgress })
  return { optimized: sanitizeOptimizedPrompt(optimized) }
}

async function handleCreateJob(req, res) {
  const body = await readJson(req)
  const clientId = requireString(body.clientId, 'clientId')
  const endpoint = normalizeEndpoint(body.endpoint)
  const apiKey = requireString(body.apiKey, 'apiKey')
  const request = body.request && typeof body.request === 'object' ? body.request : null
  if (!request) throw new Error('request is required')

  const now = Date.now()
  const job = {
    id: randomUUID(),
    clientId,
    status: 'running',
    progress: 15,
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
    queuedAt: new Date(now).toISOString(),
    startedAt: '',
    finishedAt: '',
    attempts: 0,
    expiresAt: new Date(now + JOB_TTL_MS).toISOString(),
    request: summarizeRequest(request),
    images: [],
    error: '',
  }

  await saveJob(job)
  runJob(job.id, endpoint, apiKey, request).catch((error) => {
    console.error(`job ${job.id} failed`, error)
  })
  sendJson(res, 202, { job })
}

async function handleListJobs(url, res) {
  const clientId = requireString(url.searchParams.get('clientId'), 'clientId')
  const jobs = []
  for (const file of await readdir(JOB_DIR)) {
    if (!file.endsWith('.json')) continue
    const job = await readJobFromFile(join(JOB_DIR, file)).catch(() => null)
    if (job && !isExpired(job) && job.clientId === clientId) jobs.push(publicJob(job))
  }
  jobs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  sendJson(res, 200, { jobs })
}

async function handleGetJob(url, res) {
  const id = decodeURIComponent(url.pathname.slice('/api/jobs/'.length))
  const clientId = requireString(url.searchParams.get('clientId'), 'clientId')
  const job = await readJob(id)
  if (!job || isExpired(job)) {
    sendJson(res, 404, { error: 'job not found' })
    return
  }
  if (job.clientId !== clientId) {
    sendJson(res, 403, { error: 'job belongs to another client' })
    return
  }
  sendJson(res, 200, { job: publicJob(job) })
}

async function runJob(id, endpoint, apiKey, request) {
  if (runningJobs.has(id)) return
  runningJobs.add(id)
  try {
    await patchJob(id, { status: 'running', progress: 15 })
    const promptItems = normalizePromptItems(request)
    const images = []
    const raw = []
    for (const [index, item] of promptItems.entries()) {
      const progress = Math.round(15 + (index / promptItems.length) * 70)
      await patchJob(id, { progress })
      const requestForPrompt = { ...request, prompt: item.prompt, n: 1 }
      delete requestForPrompt.prompts
      const result = await generateProviderImages(endpoint, apiKey, requestForPrompt)
      raw.push({ title: item.title, data: result.data })
      images.push(...result.images.map((image) => ({ ...image, title: item.title })))
    }
    if (images.length === 0) throw new Error('provider returned no images')

    await patchJob(id, { status: 'success', progress: 100, images, raw })
  } catch (error) {
    await patchJob(id, { status: 'error', progress: 100, error: error.message || 'generation failed' })
  } finally {
    runningJobs.delete(id)
  }
}

async function generateProviderImages(endpoint, apiKey, request) {
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
  return { data, images }
}

function normalizePromptItems(request) {
  const prompts = Array.isArray(request?.prompts) ? request.prompts : []
  const items = prompts.map((item, index) => {
    if (typeof item === 'string') {
      const prompt = item.trim()
      return prompt ? { title: `Image ${index + 1}`, prompt } : null
    }
    if (!item || typeof item !== 'object') return null
    const prompt = typeof item.prompt === 'string' ? item.prompt.trim() : ''
    if (!prompt) return null
    const title = typeof item.title === 'string' && item.title.trim() ? item.title.trim() : `Image ${index + 1}`
    return { title, prompt }
  }).filter(Boolean).slice(0, 14)
  if (items.length > 0) return items
  return [{ title: 'Image 1', prompt: typeof request?.prompt === 'string' ? request.prompt : '' }]
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
    const bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.byteLength > MAX_IMAGE_BYTES) return url
    return `data:${contentType};base64,${bytes.toString('base64')}`
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
  const images = collectValidProviderImages(request.sourceImages)
  if (images.length === 0) throw new Error('sourceImages must include an http, https, or data:image URL')
  const body = { ...request }
  delete body.sourceImages
  return { ...body, images }
}

function collectValidProviderImages(sourceImages) {
  if (!Array.isArray(sourceImages)) return []
  return sourceImages
    .map(providerImageUrl)
    .filter(Boolean)
    .map((imageUrl) => ({ image_url: imageUrl }))
}

function providerImageUrl(image) {
  const value = typeof image === 'string'
    ? image
    : image?.url || image?.image_url || image?.dataUrl
  if (typeof value !== 'string') return ''
  const url = value.trim()
  return isProviderImageUrl(url) ? url : ''
}

function isProviderImageUrl(url) {
  if (!url) return false
  if (/^data:image\/[a-z0-9.+-]+(?:;[a-z0-9.+-]+=[^;,]+)*(?:;base64)?,.+/i.test(url)) return true
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function summarizeRequest(request) {
  return {
    prompt: typeof request.prompt === 'string' ? request.prompt : '',
    mode: request.mode === 'edit' ? 'edit' : 'generate',
    model: typeof request.model === 'string' ? request.model : '',
    n: Number.isFinite(request.n) ? request.n : undefined,
    promptCount: Array.isArray(request.prompts) ? request.prompts.length : undefined,
    size: typeof request.size === 'string' ? request.size : '',
    quality: typeof request.quality === 'string' ? request.quality : '',
    hasSourceImages: Array.isArray(request.sourceImages) && request.sourceImages.length > 0,
  }
}

async function patchJob(id, patch) {
  const job = await readJob(id)
  if (!job) return
  const next = {
    ...job,
    ...patch,
    updatedAt: new Date().toISOString(),
  }
  await saveJob(next)
}

function normalizeStaleRunningJob(job) {
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

function publicJob(job) {
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

async function readJson(req) {
  let size = 0
  const chunks = []
  for await (const chunk of req) {
    size += chunk.byteLength
    if (size > MAX_BODY_BYTES) throw new Error('request body is too large')
    chunks.push(chunk)
  }
  const raw = Buffer.concat(chunks).toString('utf8')
  return raw ? JSON.parse(raw) : {}
}

function acceptsEventStream(req) {
  return typeof req.headers.accept === 'string' && req.headers.accept.includes('text/event-stream')
}

function sendSseHeaders(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
}

function writeSse(res, event, data = {}) {
  res.write(`event: ${event}\n`)
  res.write(`data: ${JSON.stringify(data)}\n\n`)
}

function sanitizeOptimizedPrompt(optimized) {
  if (!optimized || typeof optimized !== 'object') return optimized
  const safeOptimized = { ...optimized }
  delete safeOptimized.rawContent
  return safeOptimized
}

function sendJson(res, status, payload) {
  if (status === 204) {
    res.writeHead(204)
    res.end()
    return
  }
  sendRawJson(res, status, JSON.stringify(payload))
}

function sendRawJson(res, status, text) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(text || 'null')
}

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization')
}

function requireString(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required`)
  return value.trim()
}

function normalizeEndpoint(endpoint) {
  const value = requireString(endpoint, 'endpoint').replace(/\/+$/, '')
  const url = new URL(value)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('endpoint must be http or https')
  return value
}

function jobPath(id) {
  if (!/^[a-f0-9-]{36}$/i.test(id)) throw new Error('invalid job id')
  return join(JOB_DIR, `${id}.json`)
}

async function readJob(id) {
  const path = jobPath(id)
  if (!existsSync(path)) return null
  return readJobFromFile(path)
}

async function readJobFromFile(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

async function saveJob(job) {
  const path = jobPath(job.id)
  const temp = `${path}.${process.pid}.tmp`
  await writeFile(temp, JSON.stringify(job, null, 2))
  await rename(temp, path)
}

function isExpired(job) {
  return new Date(job.expiresAt).getTime() <= Date.now()
}

async function cleanupExpiredJobs() {
  await mkdir(JOB_DIR, { recursive: true })
  for (const file of await readdir(JOB_DIR)) {
    if (!file.endsWith('.json')) continue
    const path = join(JOB_DIR, file)
    const job = await readJobFromFile(path).catch(() => null)
    if (!job || isExpired(job)) await rm(path, { force: true })
  }
}

async function serveStatic(url, res) {
  const pathname = decodeURIComponent(url.pathname)
  const target = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '')
  const file = resolve(DIST_DIR, target)
  if (!file.startsWith(DIST_DIR) || !existsSync(file) || !(await stat(file)).isFile()) {
    const fallback = join(DIST_DIR, 'index.html')
    if (!existsSync(fallback)) {
      sendJson(res, 404, { error: 'not found' })
      return
    }
    sendFile(res, fallback)
    return
  }
  sendFile(res, file)
}

function sendFile(res, file) {
  res.writeHead(200, { 'Content-Type': contentType(file) })
  createReadStream(file).pipe(res)
}

function contentType(file) {
  switch (extname(file)) {
    case '.html': return 'text/html; charset=utf-8'
    case '.js': return 'text/javascript; charset=utf-8'
    case '.css': return 'text/css; charset=utf-8'
    case '.svg': return 'image/svg+xml'
    case '.png': return 'image/png'
    case '.jpg':
    case '.jpeg': return 'image/jpeg'
    case '.webp': return 'image/webp'
    default: return 'application/octet-stream'
  }
}
