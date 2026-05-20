import { isEcomOptimizerModel, optimizeEcomPrompt } from './ecom-prompt-engine.js'
import { json, normalizeEndpoint, requireString } from './_shared.js'

export async function onRequestPost({ request }) {
  try {
    const body = await request.json()
    if (acceptsEventStream(request)) return streamPromptOptimization(body)

    const { optimized } = await runPromptOptimization(body)
    return json({ optimized })
  } catch (err) {
    return json({ error: err.message || 'failed to optimize prompt' }, 500)
  }
}

function streamPromptOptimization(body) {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event, data = {}) => controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      send('status', { stage: 'received', message: '已收到优化请求' })
      try {
        send('status', { stage: 'optimizing', message: '意图模型正在优化提示词' })
        const { optimized } = await runPromptOptimization(body, (progress) => send('progress', progress))
        send('done', { optimized })
      } catch (err) {
        send('error', { error: err.message || 'failed to optimize prompt' })
      } finally {
        controller.close()
      }
    },
  })
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  })
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

function acceptsEventStream(request) {
  return request.headers.get('accept')?.includes('text/event-stream')
}

function sanitizeOptimizedPrompt(optimized) {
  if (!optimized || typeof optimized !== 'object') return optimized
  const safeOptimized = { ...optimized }
  delete safeOptimized.rawContent
  return safeOptimized
}

export function onRequest() {
  return json({ error: 'method not allowed' }, 405)
}
