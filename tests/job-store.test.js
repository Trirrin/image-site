import test from 'node:test'
import assert from 'node:assert/strict'
import { JobStore } from '../functions/job-store.js'

const JOB_A = '11111111-1111-4111-8111-111111111111'
const JOB_B = '22222222-2222-4222-8222-222222222222'

function createStore() {
  const values = new Map()
  const storage = {
    get: async (key) => values.get(key),
    put: async (key, value) => { values.set(key, value) },
    delete: async (key) => { values.delete(key) },
  }
  return { store: new JobStore({ storage }), values }
}

async function readJson(response) {
  return response.json()
}

function job(id, createdAt, overrides = {}) {
  return {
    id,
    clientId: 'client-1',
    status: 'running',
    progress: 15,
    createdAt,
    updatedAt: createdAt,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    request: { prompt: 'prompt' },
    images: [],
    ...overrides,
  }
}

test('stores, lists, and fetches jobs in newest-first order', async () => {
  const { store } = createStore()
  const older = job(JOB_A, '2026-05-26T10:00:00.000Z')
  const newer = job(JOB_B, '2026-05-26T11:00:00.000Z')

  assert.equal((await store.fetch(new Request('https://store.test/jobs', { method: 'PUT', body: JSON.stringify(older) }))).status, 200)
  assert.equal((await store.fetch(new Request('https://store.test/jobs', { method: 'PUT', body: JSON.stringify(newer) }))).status, 200)

  const listed = await readJson(await store.fetch(new Request('https://store.test/jobs')))
  assert.deepEqual(listed.jobs.map((item) => item.id), [JOB_B, JOB_A])

  const fetched = await readJson(await store.fetch(new Request(`https://store.test/jobs/${JOB_A}`)))
  assert.equal(fetched.job.id, JOB_A)
})

test('rejects invalid job records instead of poisoning the index', async () => {
  const { store } = createStore()
  const response = await store.fetch(new Request('https://store.test/jobs', {
    method: 'PUT',
    body: JSON.stringify({ id: 'bad-id' }),
  }))

  assert.equal(response.status, 500)
  assert.match((await response.json()).error, /invalid job id/)
})

test('stores and reads job payloads through chunked storage', async () => {
  const { store } = createStore()
  const payload = { endpoint: 'https://api.example.test', apiKey: 'token', request: { prompt: 'x'.repeat(110_000) } }

  const put = await store.fetch(new Request(`https://store.test/jobs/${JOB_A}/payload`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  }))
  assert.equal(put.status, 200)

  const got = await readJson(await store.fetch(new Request(`https://store.test/jobs/${JOB_A}/payload`)))
  assert.deepEqual(got.payload, payload)
})

test('stores data URL images and serves them as binary image responses', async () => {
  const { store } = createStore()
  const put = await store.fetch(new Request(`https://store.test/jobs/${JOB_A}/images`, {
    method: 'PUT',
    body: JSON.stringify({
      clientId: 'client one',
      images: [
        { id: 'unsafe/id.png', url: 'data:image/png;base64,aGVsbG8=' },
        { id: 'remote', url: 'https://cdn.example.test/image.png' },
      ],
    }),
  }))
  const body = await put.json()

  assert.deepEqual(body.images, [
    { id: 'unsafe_id_png', url: `/api/jobs/${JOB_A}/images/unsafe_id_png?clientId=client%20one` },
    { id: 'remote', url: 'https://cdn.example.test/image.png' },
  ])

  const image = await store.fetch(new Request(`https://store.test/jobs/${JOB_A}/images/unsafe_id_png`))
  assert.equal(image.status, 200)
  assert.equal(image.headers.get('content-type'), 'image/png')
  assert.equal(new TextDecoder().decode(await image.arrayBuffer()), 'hello')
})

test('deletes expired jobs and their payloads from the index', async () => {
  const { store, values } = createStore()
  const expired = job(JOB_A, '2026-05-26T10:00:00.000Z', { expiresAt: '2000-01-01T00:00:00.000Z' })
  const active = job(JOB_B, '2026-05-26T11:00:00.000Z')

  values.set(`job:${JOB_A}`, expired)
  await store.fetch(new Request(`https://store.test/jobs/${JOB_A}/payload`, { method: 'PUT', body: JSON.stringify({ remove: true }) }))
  await store.fetch(new Request('https://store.test/jobs', { method: 'PUT', body: JSON.stringify(active) }))
  values.set('job-index', [
    { id: JOB_A, createdAt: expired.createdAt, expiresAt: expired.expiresAt },
    { id: JOB_B, createdAt: active.createdAt, expiresAt: active.expiresAt },
  ])

  const deleted = await readJson(await store.fetch(new Request('https://store.test/expired', { method: 'DELETE' })))
  assert.deepEqual(deleted, { deleted: 1 })

  assert.equal((await store.fetch(new Request(`https://store.test/jobs/${JOB_A}`))).status, 404)
  assert.equal((await store.fetch(new Request(`https://store.test/jobs/${JOB_A}/payload`))).status, 404)
  assert.deepEqual((await readJson(await store.fetch(new Request('https://store.test/jobs')))).jobs.map((item) => item.id), [JOB_B])
})
