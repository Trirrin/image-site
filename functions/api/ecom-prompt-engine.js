const OPTIMIZER_TEMPERATURE = 0.25
const OPTIMIZER_MAX_OUTPUT_TOKENS = 1400
const OPTIMIZER_MODEL_REGEX = /^gpt-\d+\.\d+$/i
const OPTIMIZER_RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    prompt: { type: 'string' },
    prompts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          prompt: { type: 'string' },
        },
        required: ['title', 'prompt'],
      },
      maxItems: 14,
    },
    template: { type: 'string' },
    category: { type: 'string' },
    style: { type: 'string' },
    notes: {
      type: 'array',
      items: { type: 'string' },
      maxItems: 4,
    },
  },
  required: ['prompt', 'prompts', 'template', 'category', 'style', 'notes'],
}

const ECOM_SKILL_REPO = 'liangdabiao/ecom-details-image'
const ECOM_SKILL_BRANCH = 'main'
const ECOM_SKILL_ROOT = `https://raw.githubusercontent.com/${ECOM_SKILL_REPO}/${ECOM_SKILL_BRANCH}/.claude/skills/ecom-details-image`
const ECOM_SKILL_TEMPLATE_LIST_URL = `https://api.github.com/repos/${ECOM_SKILL_REPO}/contents/.claude/skills/ecom-details-image/references/templates?ref=${ECOM_SKILL_BRANCH}`
const ECOM_SKILL_CACHE_TTL_MS = readPositiveNumberEnv('ECOM_SKILL_CACHE_TTL_MS', 5 * 60 * 1000)
const ECOM_SKILL_FETCH_TIMEOUT_MS = readPositiveNumberEnv('ECOM_SKILL_FETCH_TIMEOUT_MS', 8000)
const ECOM_SKILL_MAX_CONTEXT_CHARS = readPositiveNumberEnv('ECOM_SKILL_MAX_CONTEXT_CHARS', 120000)

let remoteSkillCache = null
let remoteSkillPromise = null

const DEFAULT_STYLE_LOCK = [
  'Campaign Style Lock:',
  'Use consistent commercial product photography across the whole image set.',
  'Keep the same product identity, material finish, lighting direction, color palette, and camera language.',
  'Use premium, realistic, high-conversion e-commerce visuals with clean composition and no artificial-looking distortions.',
].join(' ')

const NEGATIVE_PROMPT = [
  'Avoid fake logos, watermarks, broken text, misspelled labels, distorted product geometry, extra parts, messy backgrounds, low-resolution artifacts, overexposed highlights, plastic-looking materials, and clutter that hides the product.',
  'Do not invent unsafe claims, medical claims, certification badges, discounts, or brand names unless the user explicitly provides them.',
].join(' ')

const TEMPLATE_DEFINITIONS = [
  {
    id: 'hero-main',
    label: 'Hero Main Image',
    keywords: ['hero', 'main image', '主图', '白底', 'listing', 'amazon', 'shopify', '淘宝', '天猫', 'pdp'],
    intent: 'marketplace hero image',
    layout: 'centered product-first composition, product occupies 70-85% of the frame, clean background, crisp silhouette, natural shadow',
    conversion: 'make the product immediately identifiable and trustworthy at thumbnail size',
  },
  {
    id: 'detail-infographic',
    label: 'Detail Infographic',
    keywords: ['详情', 'detail', 'infographic', '卖点', '功能', 'features', 'a+', '对比', '参数'],
    intent: 'e-commerce detail page image',
    layout: 'product plus simple callout zones, clear hierarchy, readable text placeholders, generous spacing, visual proof for each benefit',
    conversion: 'explain the top benefits quickly without turning the image into a poster full of tiny text',
  },
  {
    id: 'lifestyle-scene',
    label: 'Lifestyle Scene',
    keywords: ['场景', 'lifestyle', '使用', 'home', 'office', 'outdoor', 'kitchen', 'bedroom', '生活方式'],
    intent: 'lifestyle product scene',
    layout: 'realistic usage context, product remains the hero, shallow depth of field, believable human-scale environment',
    conversion: 'help the buyer imagine ownership and daily use',
  },
  {
    id: 'social-ad',
    label: 'Social Ad',
    keywords: ['广告', 'ad', 'facebook', 'instagram', 'tiktok', '小红书', '社媒', 'ugc', '种草'],
    intent: 'paid social or UGC-style product creative',
    layout: 'scroll-stopping composition with clear focal product, native social framing, space for short headline and CTA overlay',
    conversion: 'create fast emotional appeal and a clear reason to stop scrolling',
  },
  {
    id: 'comparison',
    label: 'Comparison Image',
    keywords: ['compare', 'comparison', 'before after', '对比', '前后', '竞品', '升级'],
    intent: 'comparison image',
    layout: 'clean split or side-by-side structure, controlled contrast, product advantage shown visually, simple labels only',
    conversion: 'make the superiority obvious without exaggerated or unverifiable claims',
  },
]

const CATEGORY_RULES = [
  {
    id: 'beauty',
    keywords: ['skincare', 'cosmetic', 'serum', 'cream', 'makeup', '护肤', '美妆', '精华', '面霜', '口红'],
    guidance: 'Use soft clean lighting, skin-safe premium cues, macro texture details, hygienic surfaces, and restrained luxury styling.',
  },
  {
    id: 'electronics',
    keywords: ['phone', 'charger', 'keyboard', 'earbuds', 'camera', 'gadget', '电子', '数码', '充电器', '耳机', '键盘'],
    guidance: 'Use precise industrial lighting, crisp edges, controlled reflections, dark-neutral accents, and visible functional details.',
  },
  {
    id: 'home',
    keywords: ['furniture', 'lamp', 'chair', 'home', 'kitchen', 'decor', '家具', '家居', '厨房', '灯', '收纳'],
    guidance: 'Use warm realistic interiors, believable scale, material texture, and calm practical styling.',
  },
  {
    id: 'food',
    keywords: ['food', 'drink', 'coffee', 'tea', 'snack', '食品', '饮料', '咖啡', '茶', '零食'],
    guidance: 'Use appetizing natural light, fresh ingredients, packaging clarity, and realistic texture without artificial gloss.',
  },
  {
    id: 'fashion',
    keywords: ['shoe', 'bag', 'clothing', 'jewelry', 'watch', '服装', '鞋', '包', '首饰', '手表'],
    guidance: 'Use premium styling, accurate fabric or material texture, elegant pose or lay-flat composition, and brand-safe clean details.',
  },
]

const STYLE_RULES = [
  { id: 'luxury', keywords: ['luxury', 'premium', '高端', '奢华', '质感'], guidance: 'premium editorial lighting, restrained palette, polished material reflections, high perceived value' },
  { id: 'minimal', keywords: ['minimal', 'clean', '简约', '极简', '干净'], guidance: 'minimal composition, large clean negative space, quiet color palette, precise product edges' },
  { id: 'fresh', keywords: ['fresh', 'natural', 'organic', '清新', '自然', '有机'], guidance: 'fresh natural light, airy composition, organic textures, honest realistic color' },
  { id: 'tech', keywords: ['tech', 'future', '科技', '未来', '赛博'], guidance: 'modern technical lighting, subtle glow accents, precise geometry, advanced but realistic product rendering' },
]

export function buildEcomPromptBrief(input = {}) {
  const source = normalizeSource(input)
  const template = pickByKeywords(TEMPLATE_DEFINITIONS, source) || TEMPLATE_DEFINITIONS[0]
  const category = pickByKeywords(CATEGORY_RULES, source)
  const style = pickByKeywords(STYLE_RULES, source)
  const platform = detectPlatform(source)
  const aspect = typeof input.aspectRatio === 'string' && input.aspectRatio ? input.aspectRatio : 'auto'
  const resolution = typeof input.resolution === 'string' && input.resolution ? input.resolution : 'auto'
  const imageCount = clampCount(input.count)
  const hasReferenceImages = Boolean(input.hasReferenceImages)
  const product = extractProductName(source)

  const prompt = [
    DEFAULT_STYLE_LOCK,
    `Create a ${template.intent} for ${product}.`,
    `User intent: ${source || 'Create a high-converting e-commerce product image.'}`,
    `Composition: ${template.layout}.`,
    `Conversion goal: ${template.conversion}.`,
    category ? `Category guidance: ${category.guidance}` : 'Category guidance: keep the product physically believable, commercially polished, and easy to inspect.',
    style ? `Visual style: ${style.guidance}.` : 'Visual style: modern premium e-commerce photography, realistic lighting, balanced color, clean finish.',
    platform ? `Platform fit: optimize for ${platform} shopping context with safe margins and thumbnail clarity.` : 'Platform fit: suitable for marketplace, Shopify, and social commerce usage.',
    `Output constraints: aspect ratio ${aspect}, resolution ${resolution}, ${imageCount} separate output image${imageCount > 1 ? 's' : ''}. Do not combine multiple requested images into one collage, grid, contact sheet, storyboard, or multi-panel canvas.`,
    hasReferenceImages ? 'Reference handling: preserve the reference product identity, proportions, color, logo placement, material, and distinctive details.' : 'Product handling: infer only visible or explicitly provided product details; do not invent brand marks.',
    'Text handling: if text is needed, keep it minimal and use clean placeholder-like short phrases instead of dense copy.',
    NEGATIVE_PROMPT,
  ].join('\n')

  return {
    prompt,
    template: template.id,
    templateLabel: template.label,
    category: category?.id || 'general',
    style: style?.id || 'commercial',
    platform: platform || 'general e-commerce',
    fallback: true,
  }
}

export async function buildEcomOptimizerMessages(input = {}, fetchImpl = fetch) {
  const { brief, system, user } = await buildEcomOptimizerContext(input, fetchImpl)
  return { brief, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }
}

export async function buildEcomOptimizerResponsesRequest(input = {}, model = '', fetchImpl = fetch) {
  const { brief, system, user } = await buildEcomOptimizerContext(input, fetchImpl)
  const trimmedModel = typeof model === 'string' ? model.trim() : ''
  return {
    brief,
    request: {
      model: trimmedModel,
      instructions: system,
      input: [{ role: 'user', content: buildResponsesUserContent(user, input) }],
      reasoning: { effort: 'medium' },
      text: {
        format: {
          type: 'json_schema',
          name: 'ecom_prompt_optimization',
          schema: OPTIMIZER_RESPONSE_SCHEMA,
          strict: true,
        },
      },
      temperature: OPTIMIZER_TEMPERATURE,
      max_output_tokens: OPTIMIZER_MAX_OUTPUT_TOKENS,
      stream: true,
    },
  }
}

export async function buildEcomOptimizerChatRequest(input = {}, model = '', fetchImpl = fetch) {
  const { brief, system, user } = await buildEcomOptimizerContext(input, fetchImpl)
  const trimmedModel = typeof model === 'string' ? model.trim() : ''
  return {
    brief,
    request: {
      model: trimmedModel,
      messages: [{ role: 'system', content: system }, { role: 'user', content: buildChatUserContent(user, input) }],
      temperature: OPTIMIZER_TEMPERATURE,
      max_tokens: OPTIMIZER_MAX_OUTPUT_TOKENS,
      response_format: { type: 'json_object' },
    },
  }
}

export function isEcomOptimizerModel(model) {
  return typeof model === 'string' && OPTIMIZER_MODEL_REGEX.test(model.trim())
}

export async function optimizeEcomPrompt({ endpoint, apiKey, model, input = {}, fetchImpl = fetch, onProgress } = {}) {
  const trimmedModel = typeof model === 'string' ? model.trim() : ''
  const brief = buildEcomPromptBrief(input)
  if (!trimmedModel) throw new Error('prompt optimizer model is not configured')
  if (!isEcomOptimizerModel(trimmedModel)) throw new Error('prompt optimizer model must match gpt-x.x')

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  }

  const { request: responsesRequest } = await buildEcomOptimizerResponsesRequest(input, trimmedModel, fetchImpl)
  const responsesResult = await postJsonStream(fetchImpl, `${endpoint}/v1/responses`, headers, responsesRequest, onProgress)
  if (!responsesResult.ok) {
    throw new Error(responsesResult.error || responsesResult.text || `responses API error (${responsesResult.status})`)
  }

  const optimized = parseOptimizerResult({ output_text: responsesResult.outputText }, brief, input)
  if (optimized?.fallback) throw new Error('prompt optimizer returned an invalid structured result')
  return { optimized, transport: 'responses' }
}

export function parseOptimizerResult(data, fallbackBrief, input = {}) {
  const content = extractMessageContent(data)
  if (!content) return fallbackBrief
  const parsed = parseJsonObject(content)
  const prompt = typeof parsed?.prompt === 'string' ? parsed.prompt.trim() : ''
  const prompts = shouldAllowPromptList(input) ? parsePromptList(parsed?.prompts) : []
  if (!prompt && prompts.length === 0) return fallbackBrief
  return {
    prompt: prompt || prompts.map((item) => `${item.title}\n${item.prompt}`).join('\n\n'),
    prompts,
    template: typeof parsed.template === 'string' && parsed.template.trim() ? parsed.template.trim() : fallbackBrief.template,
    templateLabel: fallbackBrief.templateLabel,
    category: typeof parsed.category === 'string' && parsed.category.trim() ? parsed.category.trim() : fallbackBrief.category,
    style: typeof parsed.style === 'string' && parsed.style.trim() ? parsed.style.trim() : fallbackBrief.style,
    platform: fallbackBrief.platform,
    notes: Array.isArray(parsed.notes) ? parsed.notes.filter((item) => typeof item === 'string').slice(0, 4) : [],
    fallback: false,
    rawContent: content,
  }
}

async function buildEcomOptimizerContext(input = {}, fetchImpl = fetch) {
  const brief = buildEcomPromptBrief(input)
  const remoteSkill = await loadEcomDetailsImageSkill(fetchImpl)
  const selectedTemplates = selectRemoteTemplates(remoteSkill.templates, input)
  const skillContext = buildRemoteSkillContext(remoteSkill, selectedTemplates)
  const system = [
    'You are an e-commerce image prompt editor using the live ecom-details-image skill from GitHub.',
    'Your job is conservative enhancement, not creative replacement.',
    'The user intent is the highest-priority source of truth. Preserve the product, subject, camera angle, composition, style, scene, color, materials, mood, and all concrete details unless they violate safety rules.',
    'Do not replace the user request with a generic e-commerce concept, campaign idea, lifestyle scene, or template-derived composition.',
    'Keep the original user intent visibly present near the beginning of the prompt. Add professional e-commerce photography constraints after it.',
    'Use SKILL.md and matched template JSON only as supporting guidance for product fidelity, lighting, scale, whitespace, realism, anti-AI artifacts, and platform-safe constraints.',
    'If no template is selected, use only the general SKILL.md guidance and do not pretend a template matched.',
    'The prompt field and every prompts[].prompt value must be written in English for the image generation model, but preserve exact product names, visible text, brand-neutral descriptors, and user-specified terms when important.',
    'Return prompts[] only when the user explicitly asks for multiple distinct output images, an image set, Amazon/PDP/detail-page/full-set images, or count is greater than 1. Otherwise return one prompt and an empty prompts array.',
    'Treat every explicitly requested image count or image set as separate output images, not one canvas containing multiple images.',
    'Never ask the image model to combine multiple requested outputs into a collage, grid, contact sheet, storyboard, or multi-panel image unless the user explicitly asks for that layout.',
    'The prompts[].title values and notes array must be written in Simplified Chinese for the user review dialog.',
    'When reference images are provided, inspect them directly and describe visible product details accurately: silhouette, material, texture, color, construction, fit, labels, proportions, and defects worth preserving or avoiding.',
    'Apply template details only when they support the original user intent. Never let Campaign Style Lock, examples, variants, or platform defaults override concrete user instructions.',
    'Do not add unverifiable claims, fake logos, certification badges, discounts, or medical/legal promises.',
    'Return only JSON with this shape: {"prompt":"English enhanced prompt that preserves the original intent first","prompts":[{"title":"中文图片标题","prompt":"English image prompt"}],"template":"...","category":"...","style":"...","notes":["中文优化说明"]}.',
    'Put selected template file names in template only when a template actually matched; otherwise use an empty string. Note whether live GitHub skill data was used.',
    skillContext,
  ].filter(Boolean).join('\n\n')

  const user = JSON.stringify({
    userIntent: input.prompt || '',
    mode: input.mode || 'generate',
    aspectRatio: input.aspectRatio || 'auto',
    resolution: input.resolution || 'auto',
    count: clampCount(input.count),
    hasReferenceImages: Boolean(input.hasReferenceImages),
    localFallbackBrief: brief,
    liveSkill: {
      source: remoteSkill.source,
      loadedAt: remoteSkill.loadedAt,
      stale: Boolean(remoteSkill.stale),
      warning: remoteSkill.warning || '',
      templateCount: remoteSkill.templates.length,
      selectedTemplateFiles: selectedTemplates.map((template) => template.fileName),
    },
  })

  return { brief, system, user }
}

async function loadEcomDetailsImageSkill(fetchImpl = fetch) {
  const now = Date.now()
  if (remoteSkillCache && now - remoteSkillCache.fetchedAt < ECOM_SKILL_CACHE_TTL_MS) return remoteSkillCache.value
  if (remoteSkillPromise) return remoteSkillPromise

  remoteSkillPromise = fetchRemoteEcomSkill(fetchImpl)
    .then((value) => {
      remoteSkillCache = { fetchedAt: Date.now(), value }
      return value
    })
    .catch((error) => {
      if (remoteSkillCache?.value) return { ...remoteSkillCache.value, stale: true, warning: error.message || 'using stale ecom skill cache' }
      return buildEmptyRemoteSkill(error)
    })
    .finally(() => {
      remoteSkillPromise = null
    })

  return remoteSkillPromise
}

async function fetchRemoteEcomSkill(fetchImpl) {
  const [skillMarkdown, templateList] = await Promise.all([
    fetchText(fetchImpl, `${ECOM_SKILL_ROOT}/SKILL.md`),
    fetchJson(fetchImpl, ECOM_SKILL_TEMPLATE_LIST_URL),
  ])
  const files = Array.isArray(templateList)
    ? templateList.filter((item) => item?.type === 'file' && item.name?.endsWith('.json') && item.download_url)
    : []
  if (files.length === 0) throw new Error('remote ecom skill templates are empty')

  const templates = await Promise.all(files.map(async (file) => {
    const data = await fetchJson(fetchImpl, file.download_url)
    return normalizeRemoteTemplate(file.name, data)
  }))

  return {
    source: `${ECOM_SKILL_REPO}@${ECOM_SKILL_BRANCH}`,
    loadedAt: new Date().toISOString(),
    skillMarkdown: truncateText(stripFrontmatter(skillMarkdown), ECOM_SKILL_MAX_CONTEXT_CHARS),
    templates: templates.filter(Boolean),
    stale: false,
    warning: '',
  }
}

function buildEmptyRemoteSkill(error) {
  return {
    source: `${ECOM_SKILL_REPO}@${ECOM_SKILL_BRANCH}`,
    loadedAt: '',
    skillMarkdown: '',
    templates: [],
    stale: false,
    warning: error?.message || 'failed to load remote ecom skill',
  }
}

function normalizeRemoteTemplate(fileName, data) {
  if (!data || typeof data !== 'object') return null
  return {
    fileName,
    id: stringValue(data.id) || fileName.replace(/\.json$/i, ''),
    name: stringValue(data.name) || fileName,
    keywords: stringArray(data.keywords),
    triggerPhrases: stringArray(data.trigger_phrases),
    promptTemplate: data.prompt_template && typeof data.prompt_template === 'object' ? data.prompt_template : {},
    defaults: data.defaults && typeof data.defaults === 'object' ? data.defaults : {},
    variants: data.variants && typeof data.variants === 'object' ? data.variants : {},
    categoryTips: data.category_tips && typeof data.category_tips === 'object' ? data.category_tips : {},
    examples: stringArray(data.examples),
    antiAiTips: stringValue(data.anti_ai_tips),
    supportsImageReference: Boolean(data.supports_image_reference),
  }
}

function selectRemoteTemplates(templates, input = {}) {
  if (!Array.isArray(templates) || templates.length === 0) return []
  const source = normalizeSource(input).toLowerCase()
  const scored = templates.map((template, index) => {
    const needles = [...template.keywords, ...template.triggerPhrases, template.id, template.name]
      .filter(Boolean)
      .map((value) => value.toLowerCase())
    const score = needles.reduce((total, keyword) => total + (source.includes(keyword) ? keyword.length : 0), 0)
    return { template, index, score }
  })
  const matched = scored
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((item) => item.template)
  if (matched.length > 0) return matched.slice(0, 4)
  return []
}

function buildRemoteSkillContext(remoteSkill, selectedTemplates) {
  const catalog = remoteSkill.templates.map((template) => ({
    file: template.fileName,
    id: template.id,
    name: template.name,
    keywords: template.keywords,
    trigger_phrases: template.triggerPhrases,
  }))
  const payload = {
    source: remoteSkill.source,
    loadedAt: remoteSkill.loadedAt,
    warning: remoteSkill.warning || '',
    skillMarkdown: remoteSkill.skillMarkdown || '',
    templateCatalog: catalog,
    selectedTemplates,
  }
  return `Live ecom-details-image skill data:\n${truncateText(JSON.stringify(payload), ECOM_SKILL_MAX_CONTEXT_CHARS)}`
}

async function fetchText(fetchImpl, url) {
  const controller = typeof AbortController === 'function' ? new AbortController() : null
  const timeout = controller ? setTimeout(() => controller.abort(), ECOM_SKILL_FETCH_TIMEOUT_MS) : null
  try {
    const response = await fetchImpl(url, {
      headers: { Accept: 'text/plain, application/json;q=0.9' },
      signal: controller?.signal,
    })
    const text = await response.text()
    if (!response.ok) throw new Error(text || `failed to fetch ${url}`)
    return text
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error(`timed out fetching ${url}`)
    throw error
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

async function fetchJson(fetchImpl, url) {
  const text = await fetchText(fetchImpl, url)
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`invalid JSON from ${url}`)
  }
}

function stripFrontmatter(text) {
  if (typeof text !== 'string') return ''
  return text.replace(/^---[\s\S]*?---\s*/, '').trim()
}

function truncateText(value, maxLength) {
  const text = typeof value === 'string' ? value : ''
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength).trim()}\n...[truncated]`
}

function stringValue(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function stringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim()) : []
}

function readPositiveNumberEnv(name, fallback) {
  const raw = globalThis?.process?.env?.[name]
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function normalizeSource(input) {
  return [input.prompt, input.platform, input.productType, input.style]
    .filter((item) => typeof item === 'string' && item.trim())
    .join(' ')
    .trim()
}

function pickByKeywords(items, source) {
  const haystack = source.toLowerCase()
  return items.find((item) => item.keywords.some((keyword) => haystack.includes(keyword.toLowerCase()))) || null
}

function detectPlatform(source) {
  const value = source.toLowerCase()
  if (value.includes('amazon') || value.includes('亚马逊')) return 'Amazon'
  if (value.includes('shopify')) return 'Shopify'
  if (value.includes('tiktok') || value.includes('抖音')) return 'TikTok'
  if (value.includes('instagram')) return 'Instagram'
  if (value.includes('小红书')) return 'Xiaohongshu'
  if (value.includes('淘宝')) return 'Taobao'
  if (value.includes('天猫')) return 'Tmall'
  return ''
}

function extractProductName(source) {
  const trimmed = source.trim().replace(/\s+/g, ' ')
  if (!trimmed) return 'the product'
  return trimmed.length > 96 ? `${trimmed.slice(0, 96).trim()}...` : trimmed
}

function clampCount(value) {
  const count = Number(value)
  if (!Number.isFinite(count)) return 1
  return Math.max(1, Math.min(8, Math.round(count)))
}

function shouldAllowPromptList(input = {}) {
  if (clampCount(input.count) > 1) return true
  const source = normalizeSource(input).toLowerCase()
  return /\b(amazon|pdp|detail[ -]?page|full[ -]?set|image set|multiple images|a\+ content)\b/.test(source)
    || /(亚马逊|详情页|详情图|整套|套图|多图|主图\s*[+和与]?\s*详情)/.test(source)
}

function extractMessageContent(data) {
  if (!data || typeof data !== 'object') return ''
  if (typeof data.output_text === 'string' && data.output_text.trim()) return data.output_text.trim()

  const output = Array.isArray(data.output) ? data.output : []
  for (const item of output) {
    const text = extractContentText(item)
    if (text) return text
  }

  const choice = Array.isArray(data.choices) ? data.choices[0] : null
  const messageContent = choice?.message?.content
  if (typeof messageContent === 'string') return messageContent.trim()
  if (Array.isArray(messageContent)) {
    const text = messageContent.map(extractContentText).filter(Boolean).join('\n').trim()
    if (text) return text
  }
  if (typeof choice?.text === 'string') return choice.text.trim()
  if (typeof data.output_text === 'string') return data.output_text.trim()
  return ''
}

function extractContentText(value) {
  if (!value || typeof value !== 'object') return ''
  if (typeof value.text === 'string') return value.text.trim()
  if (typeof value.output_text === 'string') return value.output_text.trim()
  if (Array.isArray(value.content)) {
    return value.content.map(extractContentText).filter(Boolean).join('\n').trim()
  }
  return ''
}

function buildResponsesUserContent(user, input) {
  const content = [{ type: 'input_text', text: user }]
  for (const url of referenceImageUrls(input)) {
    content.push({ type: 'input_image', image_url: url })
  }
  return content
}

function buildChatUserContent(user, input) {
  const urls = referenceImageUrls(input)
  if (urls.length === 0) return user
  return [
    { type: 'text', text: user },
    ...urls.map((url) => ({ type: 'image_url', image_url: { url } })),
  ]
}

function referenceImageUrls(input = {}) {
  const refs = Array.isArray(input.referenceImages) ? input.referenceImages : []
  return refs.map((ref) => {
    const value = typeof ref === 'string' ? ref : ref?.url || ref?.image_url || ref?.dataUrl
    return typeof value === 'string' && isProviderImageUrl(value.trim()) ? value.trim() : ''
  }).filter(Boolean).slice(0, 8)
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

function parseJsonObject(text) {
  try {
    return JSON.parse(text)
  } catch {
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return null
    try {
      return JSON.parse(match[0])
    } catch {
      return null
    }
  }
}

function parsePromptList(value) {
  if (!Array.isArray(value)) return []
  return value.map((item, index) => {
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
}

function shouldFallbackToChat(status, text) {
  if (status === 404 || status === 405 || status === 410 || status === 501) return true
  if (status !== 400 || typeof text !== 'string' || !text.trim()) return false
  const lower = text.toLowerCase()
  return lower.includes('responses') || lower.includes('unknown endpoint') || lower.includes('unknown route') || lower.includes('unsupported') || lower.includes('not implemented')
}

async function postJsonStream(fetchImpl, url, headers, body, onProgress) {
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { ...headers, Accept: 'text/event-stream' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const text = await response.text()
    return { ok: false, status: response.status, text, error: text }
  }
  if (!response.body) return { ok: false, status: response.status, text: '', error: 'stream response is not readable' }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let outputText = ''
  let chunkCount = 0
  let deltaCount = 0
  let tokenCount = 0
  let phase = 'starting'
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
        if (event) {
          const result = handleResponsesStreamEvent(event, { chunkCount, deltaCount, tokenCount, outputText, phase })
          chunkCount = result.chunkCount
          deltaCount = result.deltaCount
          tokenCount = result.tokenCount
          outputText = result.outputText
          phase = result.phase
          if (result.progress) onProgress?.(result.progress)
          if (result.error) return { ok: false, status: response.status, text: result.error, error: result.error }
        }
        index = buffer.indexOf('\n\n')
      }
    }
    buffer += decoder.decode()
    const event = parseSseEvent(buffer)
    if (event) {
      const result = handleResponsesStreamEvent(event, { chunkCount, deltaCount, tokenCount, outputText, phase })
      chunkCount = result.chunkCount
      deltaCount = result.deltaCount
      tokenCount = result.tokenCount
      outputText = result.outputText
      phase = result.phase
      if (result.progress) onProgress?.(result.progress)
      if (result.error) return { ok: false, status: response.status, text: result.error, error: result.error }
    }
  } finally {
    reader.releaseLock()
  }
  return { ok: true, status: response.status, text: outputText, outputText, usage: { output_tokens: tokenCount } }
}

function handleResponsesStreamEvent(event, state) {
  const data = event.data && typeof event.data === 'object' ? event.data : {}
  let { chunkCount, deltaCount, tokenCount, outputText, phase } = state
  chunkCount += 1
  let delta = ''
  if (event.event === 'response.output_text.delta') {
    delta = typeof data.delta === 'string' ? data.delta : ''
    outputText += delta
    deltaCount += 1
  }
  const usageTokens = data.response?.usage?.output_tokens ?? data.usage?.output_tokens
  if (Number.isFinite(usageTokens)) tokenCount = usageTokens
  const logprobTokens = Array.isArray(data.logprobs) ? data.logprobs.length : 0
  if (logprobTokens > 0) tokenCount += logprobTokens
  const failed = event.event === 'response.failed' || event.event === 'response.incomplete'
  const error = failed ? data.response?.error?.message || data.error?.message || data.error || event.event : ''
  const nextPhase = detectOptimizerPhase({ event: event.event, delta, outputText, currentPhase: phase })
  const shouldReport = failed || event.event === 'response.completed' || nextPhase !== phase
  phase = nextPhase
  return {
    chunkCount,
    deltaCount,
    tokenCount,
    outputText,
    phase,
    error,
    progress: shouldReport ? {
      stage: failed ? 'failed' : event.event === 'response.completed' ? 'completed' : 'stream',
      event: event.event,
      phase,
      message: phaseMessage(phase),
    } : null,
  }
}

function detectOptimizerPhase({ event, delta, outputText, currentPhase }) {
  if (event === 'response.completed') return 'completed'
  if (event === 'response.failed' || event === 'response.incomplete') return 'failed'
  if (event === 'response.in_progress') return 'reading'
  const text = `${outputText.slice(-800)} ${delta}`.toLowerCase()
  if (text.includes('notes') || text.includes('优化说明')) return 'notes'
  if (text.includes('prompts') || text.includes('title') || text.includes('image prompt')) return 'prompts'
  if (text.includes('campaign style lock') || text.includes('template') || text.includes('amazon') || text.includes('pdp')) return 'structure'
  if (text.includes('reference') || text.includes('image') || text.includes('shirt') || text.includes('product')) return 'reference'
  return currentPhase === 'starting' ? 'reading' : currentPhase
}

function phaseMessage(phase) {
  const messages = {
    starting: '意图模型正在准备优化',
    reading: '意图模型正在读取需求和参考图',
    reference: '意图模型正在分析商品细节',
    structure: '意图模型正在规划详情页结构',
    prompts: '意图模型正在生成分图提示词',
    notes: '意图模型正在整理中文优化说明',
    completed: '意图模型优化完成',
    failed: '意图模型优化失败',
  }
  return messages[phase] || messages.reading
}

function parseSseEvent(chunk) {
  if (!chunk || !chunk.trim()) return null
  const lines = chunk.split('\n')
  let event = 'message'
  const data = []
  for (const line of lines) {
    if (line.startsWith('event:')) event = line.slice(6).trim()
    if (line.startsWith('data:')) data.push(line.slice(5).trimStart())
  }
  if (data.length === 0 || data.join('').trim() === '[DONE]') return null
  try {
    return { event, data: JSON.parse(data.join('\n')) }
  } catch {
    return { event, data: data.join('\n') }
  }
}

async function postJson(fetchImpl, url, headers, body) {
  const response = await fetchImpl(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  const text = await response.text()
  if (!response.ok) {
    return { ok: false, status: response.status, text, error: text }
  }
  let data = {}
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    data = text ? { output_text: text } : {}
  }
  return { ok: true, status: response.status, text, data }
}
