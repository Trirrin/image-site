import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createJob,
  generateImages,
  json,
  normalizeEndpoint,
  normalizeStaleRunningJob,
  publicJob,
  requireString,
} from '../functions/api/_shared.js'
import { onRequest as health } from '../functions/api/health.js'
import { onRequestPost as modelsPost } from '../functions/api/models.js'

function withFetch(mock, fn) {
  const previous = globalThis.fetch
  globalThis.fetch = mock
  return Promise.resolve()
    .then(fn)
    .finally(() => { globalThis.fetch = previous })
}

test('serializes JSON responses with an explicit content type', async () => {
  const response = json({ ok: true }, 201)

  assert.equal(response.status, 201)
  assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8')
  assert.deepEqual(await response.json(), { ok: true })
})

test('requires non-empty strings and normalizes HTTP endpoints', () => {
  assert.equal(requireString('  value  ', 'field'), 'value')
  assert.throws(() => requireString('   ', 'field'), /field is required/)
  assert.equal(normalizeEndpoint('https://api.example.test///'), 'https://api.example.test')
  assert.throws(() => normalizeEndpoint('ftp://api.example.test'), /endpoint must be http or https/)
})

test('creates public jobs without exposing provider credentials', () => {
  const job = createJob('client-1', {
    prompt: 'product prompt',
    mode: 'edit',
    model: 'gpt-image-1',
    n: 3,
    prompts: ['one', 'two'],
    size: '1024x1024',
    quality: 'high',
    sourceImages: ['data:image/png;base64,aGVsbG8='],
    apiKey: 'secret',
  })
  const exposed = publicJob(job)

  assert.match(exposed.id, /^[0-9a-f-]{36}$/i)
  assert.equal(exposed.status, 'running')
  assert.deepEqual(exposed.request, {
    prompt: 'product prompt',
    mode: 'edit',
    model: 'gpt-image-1',
    n: 3,
    promptCount: 2,
    size: '1024x1024',
    quality: 'high',
    hasSourceImages: true,
  })
  assert.equal('apiKey' in exposed.request, false)
})

test('marks stale running jobs as timed out in public output', () => {
  const old = new Date(Date.now() - 31 * 60 * 1000).toISOString()
  const job = normalizeStaleRunningJob({ id: 'job-1', status: 'running', progress: 40, createdAt: old, updatedAt: old })

  assert.equal(job.status, 'error')
  assert.equal(job.progress, 100)
  assert.equal(job.error, 'generation worker timed out')
})

test('splits prompt arrays into separate provider generation requests', async () => {
  const calls = []
  const result = await withFetch(async (url, options) => {
    calls.push({ url: String(url), body: JSON.parse(options.body) })
    return new Response(JSON.stringify({ data: [{ id: `image-${calls.length}`, b64_json: 'aGVsbG8=' }] }), { status: 200 })
  }, () => generateImages('https://api.example.test', 'token', {
    prompt: 'fallback prompt',
    prompts: [{ title: 'First', prompt: 'first prompt' }, { title: 'Second', prompt: 'second prompt' }],
    n: 9,
    size: '1025x1025',
  }))

  assert.deepEqual(calls.map((call) => call.url), [
    'https://api.example.test/v1/images/generations',
    'https://api.example.test/v1/images/generations',
  ])
  assert.deepEqual(calls.map((call) => call.body.prompt), ['first prompt', 'second prompt'])
  assert.deepEqual(calls.map((call) => call.body.n), [1, 1])
  assert.deepEqual(calls.map((call) => call.body.size), ['1024x1024', '1024x1024'])
  assert.equal('prompts' in calls[0].body, false)
  assert.deepEqual(result.images.map((image) => image.title), ['First', 'Second'])
})

test('sends edit requests only with valid provider image URLs', async () => {
  const calls = []
  await withFetch(async (url, options) => {
    calls.push({ url: String(url), body: JSON.parse(options.body) })
    return new Response(JSON.stringify({ data: [{ url: 'data:image/png;base64,aGVsbG8=' }] }), { status: 200 })
  }, () => generateImages('https://api.example.test', 'token', {
    mode: 'edit',
    prompt: 'edit prompt',
    sourceImages: [
      { url: 'https://cdn.example.test/product.png' },
      { dataUrl: 'data:image/png;base64,aGVsbG8=' },
      { url: 'blob:http://local/not-provider' },
    ],
  }))

  assert.equal(calls[0].url, 'https://api.example.test/v1/images/edits')
  assert.deepEqual(calls[0].body.images, [
    { image_url: 'https://cdn.example.test/product.png' },
    { image_url: 'data:image/png;base64,aGVsbG8=' },
  ])
  assert.equal('sourceImages' in calls[0].body, false)
})

test('health handler returns ok', async () => {
  const response = health()
  assert.deepEqual(await response.json(), { ok: true })
})

test('models handler proxies provider model responses and validation errors', async () => {
  const proxied = await withFetch(async (url, options) => {
    assert.equal(String(url), 'https://api.example.test/v1/models')
    assert.equal(options.headers.Authorization, 'Bearer token')
    return new Response(JSON.stringify({ data: [{ id: 'gpt-image-1' }] }), { status: 200 })
  }, () => modelsPost({ request: new Request('https://site.test/api/models', {
    method: 'POST',
    body: JSON.stringify({ endpoint: 'https://api.example.test', apiKey: 'token' }),
  }) }))

  assert.equal(proxied.status, 200)
  assert.deepEqual(await proxied.json(), { data: [{ id: 'gpt-image-1' }] })

  const invalid = await modelsPost({ request: new Request('https://site.test/api/models', {
    method: 'POST',
    body: JSON.stringify({ endpoint: 'ftp://api.example.test', apiKey: 'token' }),
  }) })
  assert.equal(invalid.status, 500)
  assert.match((await invalid.json()).error, /endpoint must be http or https/)
})
