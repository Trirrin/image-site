import { getStoredUser } from '../utils/authStorage'

const API_BASE = import.meta.env.VITE_BACKEND_URL || ''
const MOCK = import.meta.env.DEV

const SAMPLE_IMAGES = [
  'https://picsum.photos/seed/dev1/512/512',
  'https://picsum.photos/seed/dev2/512/768',
  'https://picsum.photos/seed/dev3/768/512',
  'https://picsum.photos/seed/dev4/512/512',
  'https://picsum.photos/seed/dev5/768/512',
  'https://picsum.photos/seed/dev6/512/768',
]
const MOCK_GROUPS = [
  { id: 'grp-demo', name: 'Demo Group', description: '演示分组，无需真实 API' },
  { id: 'grp-test', name: 'Test Group', description: '测试分组' },
]
const MOCK_CHECKOUT_INFO = {
  methods: {
    alipay: { available: true, single_min: 1, single_max: 9999, fee_rate: 0, daily_limit: 9999, daily_used: 0, daily_remaining: 9999 },
    wxpay: { available: true, single_min: 1, single_max: 9999, fee_rate: 0, daily_limit: 9999, daily_used: 0, daily_remaining: 9999 },
  },
  global_min: 1,
  global_max: 9999,
  plans: [
    { id: 1, group_id: 101, group_name: 'Image Pro', name: 'Pro Monthly', description: 'Monthly image generation access', price: 29, validity_days: 30, validity_unit: 'day', features: ['Higher image quota', 'Priority image models'], supported_model_scopes: ['image'] },
    { id: 2, group_id: 102, group_name: 'Image Max', name: 'Max Monthly', description: 'Heavy image generation access', price: 99, validity_days: 30, validity_unit: 'day', features: ['Expanded quota', 'All image models'], supported_model_scopes: ['image'] },
  ],
  balance_disabled: true,
  help_text: '',
  help_image_url: '',
}
let mockJobCounter = 0
const wait = (ms = 600) => new Promise((r) => setTimeout(r, ms))

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

export function fetchModels(config = {}) {
  if (!MOCK) return request('/api/models', { method: 'POST', body: JSON.stringify(config) })
  return wait(400).then(() => ({
    data: [
      { id: 'gpt-image-1', model_key: 'gpt-image-1', display_name: 'GPT Image 1' },
      { id: 'gpt-image-1-mini', model_key: 'gpt-image-1-mini', display_name: 'GPT Image 1 Mini' },
      { id: 'gpt-4.1', model_key: 'gpt-4.1', display_name: 'GPT-4.1' },
      { id: 'gpt-4.1-mini', model_key: 'gpt-4.1-mini', display_name: 'GPT-4.1 Mini' },
    ],
  }))
}

export function optimizePrompt(payload = {}) {
  const { input } = payload
  if (!MOCK) return request('/api/optimize-prompt', { method: 'POST', body: JSON.stringify(payload) })
  return wait(500).then(() => ({ optimized: { prompt: input?.prompt || '' } }))
}

export function optimizePromptStream(payload = {}) {
  const { input } = payload
  if (!MOCK) {
    return fetch(`${API_BASE}/api/optimize-prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify(payload),
    }).then(async (response) => {
      if (!response.ok) throw new Error(await response.text())
      if (!response.body) throw new Error('stream not readable')
      let finalData = null
      for await (const event of readSseEvents(response.body)) {
        if (event.event === 'done') finalData = event.data
        else if (event.event === 'error') throw new Error(event.data?.error)
      }
      if (!finalData) throw new Error('stream ended without result')
      return finalData
    })
  }
  return wait(600).then(() => ({ optimized: { prompt: input?.prompt || '' } }))
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
  try { return { event, data: JSON.parse(data.join('\n')) } }
  catch { return { event, data: data.join('\n') } }
}

export function createImageJob(payload = {}) {
  if (!MOCK) return request('/api/jobs', { method: 'POST', body: JSON.stringify(payload) })
  mockJobCounter += 1
  const jobId = `mock-job-${mockJobCounter}`
  return wait(300).then(() => ({ job: { id: jobId, status: 'pending', progress: 0 } }))
}

export function fetchJob({ jobId }) {
  if (!MOCK) return request(`/api/jobs/${encodeURIComponent(jobId)}`)
  const n = (mockJobCounter % 3) + 1
  const images = Array.from({ length: n }, (_, i) => ({
    id: `mock-img-${jobId}-${i}`,
    url: SAMPLE_IMAGES[(mockJobCounter + i) % SAMPLE_IMAGES.length],
  }))
  return wait(1500).then(() => ({ job: { id: jobId, status: 'success', progress: 100, images } }))
}

export function fetchJobs() {
  if (!MOCK) return request('/api/jobs')
  return wait(200).then(() => ({ jobs: [] }))
}

export function authLogin(credentials = {}) {
  if (!MOCK) return request('/api/auth/login', { method: 'POST', body: JSON.stringify(credentials) })
  return wait(500).then(() => ({ user: { id: 'dev-user', email: 'dev@test.com', token: 'mock-token-dev' } }))
}

export function authLogout() {
  if (!MOCK) return request('/api/auth/logout', { method: 'POST', headers: authHeaders() })
  return wait(100).then(() => ({ ok: true }))
}

export function authGroups() {
  if (!MOCK) return request('/api/auth/groups', { headers: authHeaders() })
  return wait(300).then(() => ({ groups: MOCK_GROUPS }))
}

export function authGenerateKey({ name = 'image-site', groupId } = {}) {
  if (!MOCK) return request('/api/auth/generate-key', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ name, groupId }) })
  const group = MOCK_GROUPS.find((g) => g.id === groupId) || { id: groupId, name: 'Demo' }
  return wait(400).then(() => ({
    key: 'mk-dev-xxxxxxxxxxxxxxxxxxxxxxxx',
    endpoint: 'https://mock-api.example.com',
    group: { id: group.id, name: group.name },
  }))
}

function billingRequest(path, options = {}) {
  return request(`/api/billing${path}`, {
    ...options,
    headers: {
      ...authHeaders(),
      ...(options.headers || {}),
    },
  })
}

export function fetchCheckoutInfo() {
  if (!MOCK) return billingRequest('/checkout-info')
  return wait(300).then(() => MOCK_CHECKOUT_INFO)
}

export function fetchSubscriptionSummary() {
  if (!MOCK) return billingRequest('/subscriptions/summary')
  return wait(200).then(() => ({ active_count: 0, subscriptions: [] }))
}

export function fetchActiveSubscriptions() {
  if (!MOCK) return billingRequest('/subscriptions/active')
  return wait(200).then(() => [])
}

export function createPaymentOrder({ planId, amount, paymentType, returnUrl, isMobile }) {
  if (!MOCK) {
    return billingRequest('/orders', {
      method: 'POST',
      body: JSON.stringify({
        amount,
        payment_type: paymentType,
        order_type: 'subscription',
        plan_id: planId,
        return_url: returnUrl,
        payment_source: 'image-site',
        is_mobile: isMobile,
      }),
    })
  }
  return wait(400).then(() => ({
    order_id: Date.now(),
    amount,
    pay_amount: amount,
    fee_rate: 0,
    status: 'PENDING',
    payment_type: paymentType,
    out_trade_no: `mock-${Date.now()}`,
    pay_url: 'https://example.com/pay',
    expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  }))
}

export function verifyPaymentOrder(outTradeNo) {
  if (!MOCK) return billingRequest('/orders/verify', { method: 'POST', body: JSON.stringify({ out_trade_no: outTradeNo }) })
  return wait(300).then(() => ({ out_trade_no: outTradeNo, status: 'COMPLETED' }))
}

export function fetchMyPaymentOrders(params = {}) {
  if (!MOCK) {
    const query = new URLSearchParams()
    Object.entries(params).forEach(([key, value]) => {
      if (value != null && value !== '') query.set(key, value)
    })
    const suffix = query.toString() ? `?${query}` : ''
    return billingRequest(`/orders/my${suffix}`)
  }
  return wait(200).then(() => ({ items: [], total: 0, page: 1, page_size: 10, pages: 0 }))
}
