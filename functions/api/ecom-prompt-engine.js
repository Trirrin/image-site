const OPTIMIZER_TEMPERATURE = 0.25
const OPTIMIZER_MAX_OUTPUT_TOKENS = readPositiveNumberEnv('ECOM_OPTIMIZER_MAX_OUTPUT_TOKENS', 8000)
const OPTIMIZER_MODEL_REGEX = /^gpt-\d+\.\d+$/i
const OPTIMIZER_WEB_SEARCH_ENABLED = readBooleanEnv('ECOM_OPTIMIZER_WEB_SEARCH_ENABLED', true)
const OPTIMIZER_WEB_SEARCH_REQUIRED = readBooleanEnv('ECOM_OPTIMIZER_WEB_SEARCH_REQUIRED', true)
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
    imagePlan: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          role: { type: 'string' },
          creativeHook: { type: 'string' },
          composition: { type: 'string' },
          visualEvidence: { type: 'string' },
          differentiation: { type: 'string' },
          mustAvoid: { type: 'string' },
        },
        required: ['title', 'role', 'creativeHook', 'composition', 'visualEvidence', 'differentiation', 'mustAvoid'],
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
  required: ['prompt', 'prompts', 'imagePlan', 'template', 'category', 'style', 'notes'],
}
const SKILL_ROUTER_MAX_OUTPUT_TOKENS = readPositiveNumberEnv('ECOM_SKILL_ROUTER_MAX_OUTPUT_TOKENS', 900)
const SKILL_ROUTER_MAX_SKILLS = 4
const SKILL_LOAD_TOOL_NAME = 'load_skill'

const ECOM_SKILL_REPO = 'liangdabiao/ecom-details-image'
const ECOM_SKILL_BRANCH = 'main'
const ECOM_SKILL_ROOT = `https://raw.githubusercontent.com/${ECOM_SKILL_REPO}/${ECOM_SKILL_BRANCH}/.claude/skills/ecom-details-image`
const ECOM_SKILL_TEMPLATE_LIST_URL = `https://api.github.com/repos/${ECOM_SKILL_REPO}/contents/.claude/skills/ecom-details-image/references/templates?ref=${ECOM_SKILL_BRANCH}`
const ECOM_SKILL_CACHE_TTL_MS = readPositiveNumberEnv('ECOM_SKILL_CACHE_TTL_MS', 5 * 60 * 1000)
const ECOM_SKILL_FETCH_TIMEOUT_MS = readPositiveNumberEnv('ECOM_SKILL_FETCH_TIMEOUT_MS', 8000)
const ECOM_SKILL_MAX_CONTEXT_CHARS = readPositiveNumberEnv('ECOM_SKILL_MAX_CONTEXT_CHARS', 120000)
const DEFAULT_REMOTE_TEMPLATE_FILE_NAME = '01-hero-image.json'

let remoteSkillCache = null
let remoteSkillPromise = null


export function buildEcomPromptBrief(input = {}) {
  const source = normalizeSource(input)
  const aspect = typeof input.aspectRatio === 'string' && input.aspectRatio ? input.aspectRatio : 'auto'
  const resolution = typeof input.resolution === 'string' && input.resolution ? input.resolution : 'auto'
  const imageCountHint = clampCount(input.count)
  const hasReferenceImages = Boolean(input.hasReferenceImages)

  const prompt = [
    `User intent: ${source || 'Create an e-commerce product image.'}`,
    `Skill supplement: aspect ratio ${aspect}, resolution ${resolution}, UI count hint ${imageCountHint}. Infer the final number of separate outputs from the user intent; if multiple images are requested, keep them separate and never merge them into one collage or multi-panel canvas.`,
    hasReferenceImages ? 'Reference handling: preserve the reference product identity, proportions, color, logo placement, material, and distinctive visible details.' : 'Product handling: infer only visible or explicitly provided product details; do not invent brand marks.',
    'E-commerce safety: avoid fake claims, fake badges, watermarks, broken labels, distorted product geometry, clutter, and dense text.',
  ].join('\n')
  return {
    prompt,
    template: '',
    templateLabel: '',
    category: 'llm-inferred',
    style: 'llm-inferred',
    platform: 'llm-inferred',
    fallback: true,
  }
}

export async function buildEcomOptimizerMessages(input = {}, fetchImpl = fetch, contextOptions = {}) {
  const { brief, system, user } = await buildEcomOptimizerContext(input, fetchImpl, contextOptions)
  return { brief, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }
}

export async function buildEcomOptimizerResponsesRequest(input = {}, model = '', fetchImpl = fetch, contextOptions = {}) {
  const { brief, system, user } = await buildEcomOptimizerContext(input, fetchImpl, contextOptions)
  const trimmedModel = typeof model === 'string' ? model.trim() : ''
  const request = {
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
  }
  applyOptimizerWebSearch(request, input, contextOptions)
  return { brief, request }
}

export async function buildEcomOptimizerChatRequest(input = {}, model = '', fetchImpl = fetch, contextOptions = {}) {
  const { brief, system, user } = await buildEcomOptimizerContext(input, fetchImpl, contextOptions)
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

  const remoteSkill = await loadEcomDetailsImageSkill(fetchImpl)
  const skillRoute = await routeEcomSkillsWithAgent({ endpoint, headers, model: trimmedModel, input, remoteSkill, fetchImpl, onProgress })
  const { request: responsesRequest } = await buildEcomOptimizerResponsesRequest(input, trimmedModel, fetchImpl, {
    remoteSkill,
    selectedTemplates: skillRoute.selectedTemplates,
    skillRouting: skillRoute.skillRouting,
  })
  if (hasOptimizerWebSearch(responsesRequest)) {
    onProgress?.({ stage: 'research', phase: 'web-search', message: '意图模型正在联网查找同类海报灵感' })
  }
  let responsesResult = await postJsonStream(fetchImpl, `${endpoint}/v1/responses`, headers, responsesRequest, onProgress)
  if (!responsesResult.ok && hasOptimizerWebSearch(responsesRequest) && shouldRetryWithoutWebSearch(responsesResult)) {
    onProgress?.({ stage: 'fallback', phase: 'web-search-fallback', message: '联网灵感不可用，正在降级为离线优化' })
    responsesResult = await postJsonStream(fetchImpl, `${endpoint}/v1/responses`, headers, withoutOptimizerWebSearch(responsesRequest), onProgress)
  }
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
  const imagePlan = parseImagePlan(parsed?.imagePlan)
  const rawPrompt = typeof parsed?.prompt === 'string' ? parsed.prompt.trim() : ''
  const prompt = decoratePromptWithPlan(rawPrompt, imagePlan[0])
  const prompts = parsePromptList(parsed?.prompts, imagePlan)
  if (!prompt && prompts.length === 0) return fallbackBrief
  return {
    prompt: prompt || prompts.map((item) => `${item.title}\n${item.prompt}`).join('\n\n'),
    prompts,
    imagePlan,
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

async function buildEcomOptimizerContext(input = {}, fetchImpl = fetch, contextOptions = {}) {
  const brief = buildEcomPromptBrief(input)
  const remoteSkill = contextOptions.remoteSkill || await loadEcomDetailsImageSkill(fetchImpl)
  const selectedTemplates = Array.isArray(contextOptions.selectedTemplates)
    ? contextOptions.selectedTemplates
    : selectDefaultRemoteTemplates(remoteSkill.templates)
  const skillContext = buildRemoteSkillContext(remoteSkill, selectedTemplates, contextOptions.skillRouting)
  const system = [
    'You are a minimal e-commerce skill supplementer, not a prompt polisher and not an art director.',
    'Your job is to preserve the user request and add only the missing operational constraints from the live ecom-details-image skill.',
    'Do not rewrite the prompt into a long campaign concept. Do not add decorative props, new backgrounds, slogans, detailed lighting schemes, color palettes, typography systems, claims, callout labels, or composition micro-control unless the user explicitly asks for them.',
    'Do not invent numeric layout ratios, exact color codes, lighting temperatures, platform overlay zones, camera distances, or fixed whitespace percentages unless the user supplied them.',
    'The user intent is the source of truth. Keep the original requested product, subject, count, scene, style, platform, aspect ratio, and reference-image identity.',
    'Use SKILL.md and selected template JSON only to supplement: product fidelity, separate-output planning, marketplace safety, readable product identity, anti-AI artifact avoidance, and no-collage constraints.',
    'Do not use local string rules for routing, category detection, platform detection, style detection, or image-count detection. Infer those decisions semantically from the full user intent and reference images.',
    'If the user asks for multiple images or an image set, return prompts[] with one concise prompt per separate image. The first sentence of each prompt must preserve the user request; the rest should only add a short skill supplement for that image role.',
    'If the user asks for one image, return one concise prompt and an empty prompts array.',
    'Keep prompt and prompts[].prompt concise: normally 40-100 English words per image. Prefer simple constraints over rich creative writing.',
    'Keep imagePlan[] brief. It is for planning/review only; do not turn it into detailed art direction.',
    'Reference images are product identity evidence. Preserve visible product details accurately, but do not copy the exact reference composition unless the user asks for reproduction.',
    'Text discipline: do not ask the image model to render long paragraphs. Use only short placeholder-like labels if the user requested detail or infographic images.',
    'Never ask the image model to combine multiple requested outputs into a collage, grid, contact sheet, storyboard, split-screen, or multi-panel image unless the user explicitly asks for that layout.',
    'The prompts[].title values and notes array must be written in Simplified Chinese for the user review dialog.',
    'Return only JSON with this shape: {"prompt":"concise English prompt preserving the original user intent plus skill supplement","prompts":[{"title":"中文图片标题","prompt":"concise English prompt for this separate image"}],"imagePlan":[{"title":"中文图片标题","role":"short role","creativeHook":"short note only","composition":"short composition note","visualEvidence":"short fidelity note","differentiation":"short difference note","mustAvoid":"short avoid note"}],"template":"...","category":"...","style":"...","notes":["中文优化说明"]}.',
    'Put selected template file names in template only when a template actually matched; otherwise use an empty string. In notes, state that the optimizer only added skill constraints and did not rewrite the user prompt creatively.',
    skillContext,
  ].filter(Boolean).join('\n\n')

  const user = JSON.stringify({
    userIntent: input.prompt || '',
    mode: input.mode || 'generate',
    aspectRatio: input.aspectRatio || 'auto',
    resolution: input.resolution || 'auto',
    count: clampCount(input.count),
    countInterpretation: 'UI count hint only. Infer the final output image count from userIntent and reference images.',
    hasReferenceImages: Boolean(input.hasReferenceImages),
    creativeResearchTask: buildCreativeResearchTask(input, brief),
    localFallbackBrief: brief,
    liveSkill: {
      source: remoteSkill.source,
      loadedAt: remoteSkill.loadedAt,
      stale: Boolean(remoteSkill.stale),
      warning: remoteSkill.warning || '',
      templateCount: remoteSkill.templates.length,
      selectedTemplateFiles: selectedTemplates.map((template) => template.fileName),
      routing: contextOptions.skillRouting || null,
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
    promptTemplate: data.prompt_template && typeof data.prompt_template === 'object' ? data.prompt_template : {},
    defaults: data.defaults && typeof data.defaults === 'object' ? data.defaults : {},
    variants: data.variants && typeof data.variants === 'object' ? data.variants : {},
    categoryTips: data.category_tips && typeof data.category_tips === 'object' ? data.category_tips : {},
    examples: stringArray(data.examples),
    antiAiTips: stringValue(data.anti_ai_tips),
    supportsImageReference: Boolean(data.supports_image_reference),
  }
}

function selectDefaultRemoteTemplates(templates) {
  if (!Array.isArray(templates) || templates.length === 0) return []
  const defaultTemplate = templates.find((template) => template.fileName === DEFAULT_REMOTE_TEMPLATE_FILE_NAME)
    || templates.find((template) => template.id === 'hero-image')
    || templates[0]
  return defaultTemplate ? [defaultTemplate] : []
}

export function buildEcomSkillCatalog(remoteSkill = {}) {
  const templates = Array.isArray(remoteSkill.templates) ? remoteSkill.templates : []
  return templates.map((template) => ({
    skill_id: template.fileName,
    id: template.id,
    name: template.name,
    type: 'ecom-image-template',
    supports_image_reference: template.supportsImageReference,
  }))
}

export function buildEcomSkillRouterResponsesRequest(input = {}, model = '', remoteSkill = {}) {
  const trimmedModel = typeof model === 'string' ? model.trim() : ''
  return {
    model: trimmedModel,
    instructions: [
      'You are a skill routing agent for e-commerce image prompt optimization.',
      'You can see the full catalog of available skill/template types, but not their full content yet.',
      `Call ${SKILL_LOAD_TOOL_NAME} exactly once with the smallest useful set of skill_ids from the catalog.`,
      'Use semantic reasoning from the whole user intent, requested deliverables, reference-image context, and catalog names. Do not select by local string matching.',
      `Select at most ${SKILL_ROUTER_MAX_SKILLS} skill_ids. Prefer the single best semantic fit unless the user asks for a multi-image set with distinct visual types.`,
      `When the intent is genuinely underspecified, call ${SKILL_LOAD_TOOL_NAME} with ${DEFAULT_REMOTE_TEMPLATE_FILE_NAME}.`,
      'Do not write the optimized prompt in this step. Only choose which skill contents must be loaded.',
    ].join('\n'),
    input: [{
      role: 'user',
      content: [{
        type: 'input_text',
        text: JSON.stringify({
          userIntent: input.prompt || '',
          mode: input.mode || 'generate',
          aspectRatio: input.aspectRatio || 'auto',
          resolution: input.resolution || 'auto',
          count: clampCount(input.count),
          countInterpretation: 'UI count hint only. The router must infer deliverables from userIntent semantically.',
          hasReferenceImages: Boolean(input.hasReferenceImages),
          skillSource: remoteSkill.source || `${ECOM_SKILL_REPO}@${ECOM_SKILL_BRANCH}`,
          availableSkills: buildEcomSkillCatalog(remoteSkill),
        }),
      }],
    }],
    tools: [{
      type: 'function',
      name: SKILL_LOAD_TOOL_NAME,
      description: 'Load full e-commerce image skill/template content by skill_id before prompt optimization.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          skill_ids: {
            type: 'array',
            items: { type: 'string' },
            minItems: 1,
            maxItems: SKILL_ROUTER_MAX_SKILLS,
          },
          reason: { type: 'string' },
        },
        required: ['skill_ids', 'reason'],
      },
      strict: true,
    }],
    tool_choice: { type: 'function', name: SKILL_LOAD_TOOL_NAME },
    temperature: 0,
    max_output_tokens: SKILL_ROUTER_MAX_OUTPUT_TOKENS,
    stream: false,
  }
}

export function resolveEcomSkillLoad(remoteSkill = {}, skillIds = []) {
  const templates = Array.isArray(remoteSkill.templates) ? remoteSkill.templates : []
  const requestedIds = normalizeSkillIds(skillIds)
  const selected = []
  for (const skillId of requestedIds) {
    const template = findTemplateBySkillId(templates, skillId)
    if (template && !selected.some((item) => item.fileName === template.fileName)) selected.push(template)
    if (selected.length >= SKILL_ROUTER_MAX_SKILLS) break
  }
  const selectedTemplates = selected.length > 0 ? selected : selectDefaultRemoteTemplates(templates)
  return {
    selectedTemplates,
    selectedSkillIds: selectedTemplates.map((template) => template.fileName),
    requestedSkillIds: requestedIds,
  }
}

async function routeEcomSkillsWithAgent({ endpoint, headers, model, input = {}, remoteSkill, fetchImpl = fetch, onProgress } = {}) {
  const fallback = () => {
    const resolved = resolveEcomSkillLoad(remoteSkill, [])
    return {
      ...resolved,
      skillRouting: {
        mode: 'heuristic-fallback',
        toolName: SKILL_LOAD_TOOL_NAME,
        toolUsed: false,
        requestedSkillIds: [],
        selectedSkillIds: resolved.selectedSkillIds,
        reason: 'Skill router unavailable; used local template selection.',
        warning: '',
      },
    }
  }

  if (!remoteSkill?.templates?.length) return fallback()
  onProgress?.({ stage: 'routing', phase: 'skill-routing', message: '意图模型正在选择 Skill' })
  const request = buildEcomSkillRouterResponsesRequest(input, model, remoteSkill)
  let result
  try {
    result = await postJson(fetchImpl, `${endpoint}/v1/responses`, { ...headers, Accept: 'application/json' }, request)
  } catch (error) {
    const resolved = fallback()
    resolved.skillRouting.warning = error?.message || 'skill router request failed'
    return resolved
  }
  if (!result.ok) {
    const resolved = fallback()
    resolved.skillRouting.warning = result.error || result.text || `skill router error (${result.status})`
    return resolved
  }

  const calls = extractResponsesFunctionCalls(result.data, SKILL_LOAD_TOOL_NAME)
  const toolArgs = calls.map((call) => parseToolArguments(call.arguments ?? call.args)).filter(Boolean)
  const skillIds = toolArgs.flatMap((args) => Array.isArray(args.skill_ids) ? args.skill_ids : [])
  const reason = toolArgs.map((args) => stringValue(args.reason)).filter(Boolean).join(' ')
  const resolved = resolveEcomSkillLoad(remoteSkill, skillIds)
  return {
    ...resolved,
    skillRouting: {
      mode: 'agent-function-call',
      toolName: SKILL_LOAD_TOOL_NAME,
      toolUsed: calls.length > 0,
      requestedSkillIds: resolved.requestedSkillIds,
      selectedSkillIds: resolved.selectedSkillIds,
      reason: reason || 'Skill router selected templates with load_skill.',
      warning: calls.length > 0 ? '' : 'skill router did not call load_skill; used local template selection',
    },
  }
}

function parseToolArguments(value) {
  if (value && typeof value === 'object') return value
  if (typeof value === 'string') return parseJsonObject(value)
  return null
}

function extractResponsesFunctionCalls(data, name) {
  const output = Array.isArray(data?.output) ? data.output : []
  return output.filter((item) => item?.type === 'function_call' && item.name === name)
}

function normalizeSkillIds(value) {
  return (Array.isArray(value) ? value : [])
    .filter((item) => typeof item === 'string' && item.trim())
    .map((item) => item.trim())
}

function findTemplateBySkillId(templates, skillId) {
  const normalized = skillId.replace(/^template:/i, '').replace(/^skill:/i, '').trim().toLowerCase()
  return templates.find((template) => [template.fileName, template.id, template.name]
    .filter(Boolean)
    .some((value) => value.toLowerCase() === normalized)) || null
}

function buildRemoteSkillContext(remoteSkill, selectedTemplates, skillRouting = null) {
  const payload = {
    source: remoteSkill.source,
    loadedAt: remoteSkill.loadedAt,
    warning: remoteSkill.warning || '',
    skillMarkdown: remoteSkill.skillMarkdown || '',
    selectedTemplates,
  }
  if (skillRouting) {
    payload.skillRouting = skillRouting
  } else {
    payload.templateCatalog = buildEcomSkillCatalog(remoteSkill)
  }
  return `Live ecom-details-image skill data:\n${truncateText(JSON.stringify(payload), ECOM_SKILL_MAX_CONTEXT_CHARS)}`
}

function applyOptimizerWebSearch(request, input = {}, contextOptions = {}) {
  if (!shouldUseOptimizerWebSearch(input, contextOptions)) return request
  request.tools = [...(Array.isArray(request.tools) ? request.tools : []), buildOptimizerWebSearchTool()]
  request.tool_choice = OPTIMIZER_WEB_SEARCH_REQUIRED ? 'required' : 'auto'
  request.include = Array.from(new Set([...(Array.isArray(request.include) ? request.include : []), 'web_search_call.action.sources']))
  return request
}

function shouldUseOptimizerWebSearch(input = {}, contextOptions = {}) {
  if (!OPTIMIZER_WEB_SEARCH_ENABLED || contextOptions.disableWebSearch) return false
  return input.webSearch === true
}
function buildOptimizerWebSearchTool() {
  return { type: 'web_search', external_web_access: true }
}

function hasOptimizerWebSearch(request = {}) {
  return Array.isArray(request.tools) && request.tools.some((tool) => tool?.type === 'web_search' || tool?.type === 'web_search_preview')
}

function withoutOptimizerWebSearch(request = {}) {
  const next = { ...request }
  next.tools = Array.isArray(request.tools) ? request.tools.filter((tool) => tool?.type !== 'web_search' && tool?.type !== 'web_search_preview') : []
  if (next.tools.length === 0) delete next.tools
  delete next.tool_choice
  delete next.max_tool_calls
  if (Array.isArray(next.include)) {
    next.include = next.include.filter((item) => item !== 'web_search_call.action.sources')
    if (next.include.length === 0) delete next.include
  }
  return next
}

function shouldRetryWithoutWebSearch(result = {}) {
  const text = `${result.error || ''} ${result.text || ''}`.toLowerCase()
  if (!text.trim()) return false
  const namesWebSearch = text.includes('web_search') || text.includes('web search')
  const namesToolParams = text.includes('tool_choice') || text.includes('tools') || text.includes('include')
  const rejectsTooling = text.includes('unsupported') || text.includes('not supported') || text.includes('unknown parameter') || text.includes('invalid')
  return (result.status === 400 || result.status === 404 || result.status === 422) && (namesWebSearch || (namesToolParams && rejectsTooling))
}

function buildCreativeResearchTask(input = {}, brief = {}) {
  const intent = normalizeSource(input) || 'generic e-commerce product image'
  return [
    `Supplement this user intent with e-commerce skill constraints only: ${intent}`,
    `Fallback labels are ${brief.category || 'llm-inferred'}, ${brief.style || 'llm-inferred'}, ${brief.platform || 'llm-inferred'}, but the LLM must infer final decisions from the full intent.`,
    'Infer the final output image count and role sequence from the user intent. If the request implies a set such as main image plus detail image, 5+7, PDP/A+ set, model display, or variants, create separate concise prompts for each output image.',
    'Do not perform creative rewriting. Add only product fidelity, separate-output, reference-preservation, marketplace-safety, and no-collage constraints from the skill.',
  ].join(' ')
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

function readBooleanEnv(name, fallback) {
  const raw = globalThis?.process?.env?.[name]
  if (typeof raw !== 'string' || !raw.trim()) return fallback
  if (/^(1|true|yes|on)$/i.test(raw.trim())) return true
  if (/^(0|false|no|off)$/i.test(raw.trim())) return false
  return fallback
}

function normalizeSource(input) {
  return [input.prompt, input.platform, input.productType, input.style]
    .filter((item) => typeof item === 'string' && item.trim())
    .join(' ')
    .trim()
}


function clampCount(value) {
  const count = Number(value)
  if (!Number.isFinite(count)) return 1
  return Math.max(1, Math.min(14, Math.round(count)))
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

function parseImagePlan(value) {
  if (!Array.isArray(value)) return []
  return value.map((item, index) => {
    if (!item || typeof item !== 'object') return null
    const plan = {
      title: stringValue(item.title) || `Image ${index + 1}`,
      role: stringValue(item.role),
      creativeHook: stringValue(item.creativeHook),
      composition: stringValue(item.composition),
      visualEvidence: stringValue(item.visualEvidence),
      differentiation: stringValue(item.differentiation),
      mustAvoid: stringValue(item.mustAvoid),
    }
    return Object.values(plan).some(Boolean) ? plan : null
  }).filter(Boolean).slice(0, 14)
}

function parsePromptList(value, imagePlan = []) {
  if (!Array.isArray(value)) return []
  return value.map((item, index) => {
    const plan = imagePlan[index]
    if (typeof item === 'string') {
      const prompt = decoratePromptWithPlan(item.trim(), plan)
      return prompt ? { title: plan?.title || `Image ${index + 1}`, prompt } : null
    }
    if (!item || typeof item !== 'object') return null
    const prompt = decoratePromptWithPlan(typeof item.prompt === 'string' ? item.prompt.trim() : '', plan)
    if (!prompt) return null
    const title = typeof item.title === 'string' && item.title.trim() ? item.title.trim() : plan?.title || `Image ${index + 1}`
    return { title, prompt }
  }).filter(Boolean).slice(0, 14)
}

function decoratePromptWithPlan(prompt) {
  return prompt
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
  if (event.includes('web_search')) return 'research'
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
    research: '意图模型正在联网查找同类海报灵感',
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
