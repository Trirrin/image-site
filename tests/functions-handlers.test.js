import test from 'node:test'
import assert from 'node:assert/strict'
import worker from '../functions/_worker.js'
import { JobStore } from '../functions/job-store.js'
import { onRequestGet as getJobHandler } from '../functions/api/jobs/[id].js'
import { onRequestGet as getImageHandler } from '../functions/api/jobs/[id]/images/[imageId].js'
import { onRequestGet as listJobsHandler, onRequestPost as createJobHandler } from '../functions/api/jobs/index.js'
import { onRequestPost as optimizePromptHandler } from '../functions/api/optimize-prompt.js'

function createStorage() {
  const values = new Map()
  return {
    get: async (key) => values.get(key),
    put: async (key, value) => { values.set(key, value) },
    delete: async (key) => { values.delete(key) },
  }
}

function createEnv() {
  const store = new JobStore({ storage: createStorage() })
  const queueMessages = []
  return {
    env: {
      IMAGE_SITE_JOB_STORE: {
        idFromName: (name) => ({ name }),
        get: () => ({ fetch: (url, init) => store.fetch(new Request(url, init)) }),
      },
      IMAGE_SITE_QUEUE: {
        send: async (message) => { queueMessages.push(message) },
      },
    },
    queueMessages,
  }
}

function withFetch(mock, fn) {
  const previous = globalThis.fetch
  globalThis.fetch = mock
  return Promise.resolve()
    .then(fn)
    .finally(() => { globalThis.fetch = previous })
}

test('job handlers create, queue, list, and fetch public jobs', async () => {
  const { env, queueMessages } = createEnv()

  const created = await createJobHandler({ env, request: new Request('https://site.test/api/jobs', {
    method: 'POST',
    body: JSON.stringify({
      clientId: 'client-1',
      endpoint: 'https://api.example.test',
      apiKey: 'token',
      request: { prompt: 'product prompt', model: 'gpt-image-1' },
    }),
  }) })
  const createdBody = await created.json()

  assert.equal(created.status, 202)
  assert.equal(queueMessages.length, 1)
  assert.equal(queueMessages[0].clientId, 'client-1')
  assert.equal(queueMessages[0].jobId, createdBody.job.id)

  const listed = await listJobsHandler({ env, request: new Request('https://site.test/api/jobs?clientId=client-1') })
  assert.deepEqual((await listed.json()).jobs.map((item) => item.id), [createdBody.job.id])

  const fetched = await getJobHandler({ env, params: { id: createdBody.job.id }, request: new Request('https://site.test/api/jobs/id?clientId=client-1') })
  assert.equal((await fetched.json()).job.id, createdBody.job.id)
})

test('queue worker completes a stored generation job and exposes stored image bytes', async () => {
  const { env, queueMessages } = createEnv()
  const created = await createJobHandler({ env, request: new Request('https://site.test/api/jobs', {
    method: 'POST',
    body: JSON.stringify({
      clientId: 'client-1',
      endpoint: 'https://api.example.test',
      apiKey: 'token',
      request: { prompt: 'product prompt', model: 'gpt-image-1' },
    }),
  }) })
  const jobId = (await created.json()).job.id
  let acked = false

  await withFetch(async (url, options) => {
    assert.equal(String(url), 'https://api.example.test/v1/images/generations')
    assert.equal(JSON.parse(options.body).prompt, 'product prompt')
    return new Response(JSON.stringify({ data: [{ id: 'img-1', b64_json: 'aGVsbG8=' }] }), { status: 200 })
  }, () => worker.queue({ messages: [{ body: queueMessages[0], ack: () => { acked = true } }] }, env))

  assert.equal(acked, true)
  const fetched = await getJobHandler({ env, params: { id: jobId }, request: new Request('https://site.test/api/jobs/id?clientId=client-1') })
  const publicJob = (await fetched.json()).job
  assert.equal(publicJob.status, 'success')
  assert.equal(publicJob.images[0].url, `/api/jobs/${jobId}/images/img-1?clientId=client-1`)

  const image = await getImageHandler({
    env,
    params: { id: jobId, imageId: 'img-1' },
    request: new Request('https://site.test/api/jobs/id/images/img-1?clientId=client-1'),
  })
  assert.equal(new TextDecoder().decode(await image.arrayBuffer()), 'hello')
})

test('queue worker stores provider failures on the job instead of dropping the message', async () => {
  const { env, queueMessages } = createEnv()
  const created = await createJobHandler({ env, request: new Request('https://site.test/api/jobs', {
    method: 'POST',
    body: JSON.stringify({
      clientId: 'client-1',
      endpoint: 'https://api.example.test',
      apiKey: 'token',
      request: { prompt: 'product prompt', model: 'gpt-image-1' },
    }),
  }) })
  const jobId = (await created.json()).job.id
  let acked = false

  await withFetch(async () => new Response('provider down', { status: 503 }), () => worker.queue({
    messages: [{ body: queueMessages[0], ack: () => { acked = true } }],
  }, env))

  assert.equal(acked, true)
  const fetched = await getJobHandler({ env, params: { id: jobId }, request: new Request('https://site.test/api/jobs/id?clientId=client-1') })
  const publicJob = (await fetched.json()).job
  assert.equal(publicJob.status, 'error')
  assert.match(publicJob.error, /API error \(503\)/)
})

test('optimize prompt handler rejects unsupported optimizer models before network access', async () => {
  const response = await optimizePromptHandler({ request: new Request('https://site.test/api/optimize-prompt', {
    method: 'POST',
    body: JSON.stringify({ endpoint: 'https://api.example.test', apiKey: 'token', model: 'gpt-image-1', input: { prompt: 'product' } }),
  }) })

  assert.equal(response.status, 500)
  assert.equal(typeof (await response.json()).error, 'string')
})
