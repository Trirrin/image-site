import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildEcomOptimizerResponsesRequest,
  buildEcomSkillCatalog,
  buildEcomSkillRouterResponsesRequest,
  parseOptimizerResult,
  resolveEcomSkillLoad,
} from '../functions/api/ecom-prompt-engine.js'

const templateList = [
  {
    name: '01-hero-image.json',
    type: 'file',
    download_url: 'https://example.test/01-hero-image.json',
  },
  {
    name: '11-infographic.json',
    type: 'file',
    download_url: 'https://example.test/11-infographic.json',
  },
]

const templates = {
  'https://example.test/01-hero-image.json': {
    id: 'hero-image',
    name: 'Hero Image',
    prompt_template: { type: 'product photography' },
  },
  'https://example.test/11-infographic.json': {
    id: 'infographic',
    name: 'Infographic',
    prompt_template: { type: 'e-commerce product infographic' },
  },
}

function fakeFetch(url) {
  const value = String(url)
  if (value.endsWith('/SKILL.md')) return okText('# ecom-details-image Skill')
  if (value.includes('/references/templates?')) return okText(JSON.stringify(templateList))
  if (templates[value]) return okText(JSON.stringify(templates[value]))
  return { ok: false, text: async () => 'not found' }
}

function okText(text) {
  return { ok: true, text: async () => text }
}

function liveSkillFromRequest(result) {
  const userText = result.request.input[0].content.find((item) => item.type === 'input_text').text
  return JSON.parse(userText).liveSkill
}
const remoteSkillFixture = {
  source: 'liangdabiao/ecom-details-image@main',
  loadedAt: '2026-05-20T00:00:00.000Z',
  warning: '',
  skillMarkdown: '# ecom-details-image Skill',
  templates: [
    {
      fileName: '01-hero-image.json',
      id: 'hero-image',
      name: 'Hero Image',
      supportsImageReference: true,
    },
    {
      fileName: '11-infographic.json',
      id: 'infographic',
      name: 'Infographic',
      supportsImageReference: true,
    },
  ],
}

test('uses only the default template before LLM routing selects a semantic match', async () => {
  const result = await buildEcomOptimizerResponsesRequest({ prompt: 'make this product look premium' }, 'gpt-4.1', fakeFetch)
  const liveSkill = liveSkillFromRequest(result)

  assert.deepEqual(liveSkill.selectedTemplateFiles, ['01-hero-image.json'])
  assert.match(result.request.instructions, /Do not use local string rules/)
  assert.equal(result.request.max_output_tokens, 8000)
})
test('does not use web search by default for skill-only supplementation', async () => {
  const result = await buildEcomOptimizerResponsesRequest({ prompt: '护肤品主图加详情图', count: 2 }, 'gpt-4.1', fakeFetch)
  const userText = result.request.input[0].content.find((item) => item.type === 'input_text').text
  const payload = JSON.parse(userText)

  assert.equal(result.request.tools, undefined)
  assert.equal(result.request.tool_choice, undefined)
  assert.equal(result.request.include, undefined)
  assert.match(payload.creativeResearchTask, /skill constraints only/)
})

test('can explicitly enable web search inspiration for optimizer requests', async () => {
  const result = await buildEcomOptimizerResponsesRequest({ prompt: '护肤品主图加详情图', count: 2, webSearch: true }, 'gpt-4.1', fakeFetch)

  assert.deepEqual(result.request.tools, [{ type: 'web_search', external_web_access: true }])
  assert.equal(result.request.tool_choice, 'required')
  assert.equal(result.request.max_tool_calls, undefined)
  assert.deepEqual(result.request.include, ['web_search_call.action.sources'])
})
test('requires structured image planning before final prompts', async () => {
  const result = await buildEcomOptimizerResponsesRequest({ prompt: '护肤品主图加详情图', count: 2 }, 'gpt-4.1', fakeFetch)
  const schema = result.request.text.format.schema

  assert.ok(schema.required.includes('imagePlan'))
  assert.deepEqual(schema.properties.imagePlan.items.required, ['title', 'role', 'creativeHook', 'composition', 'visualEvidence', 'differentiation', 'mustAvoid'])
  assert.match(result.request.instructions, /minimal e-commerce skill supplementer/)
  assert.match(result.request.instructions, /not a prompt polisher/)
  assert.match(result.request.instructions, /Keep imagePlan\[\] brief/)
  assert.match(result.request.instructions, /Reference images are product identity evidence/)
})
test('passes ecommerce set planning to the LLM instead of inferring count locally', async () => {
  const result = await buildEcomOptimizerResponsesRequest({ prompt: '给这个商品做5+7全套产品图，包含模特展示图', count: 1 }, 'gpt-4.1', fakeFetch)
  const userText = result.request.input[0].content.find((item) => item.type === 'input_text').text
  const payload = JSON.parse(userText)

  assert.equal(payload.count, 1)
  assert.match(payload.countInterpretation, /UI count hint only/)
  assert.match(payload.creativeResearchTask, /Infer the final output image count/)
  assert.match(payload.creativeResearchTask, /5\+7/)
  assert.match(result.request.instructions, /not a prompt polisher/)
  assert.match(result.request.instructions, /one concise prompt per separate image/)
})

test('does not keyword-match detail-page text to templates in local fallback context', async () => {
  const result = await buildEcomOptimizerResponsesRequest({ prompt: '护肤品详情页卖点图' }, 'gpt-4.1', fakeFetch)
  const liveSkill = liveSkillFromRequest(result)

  assert.deepEqual(liveSkill.selectedTemplateFiles, ['01-hero-image.json'])
  assert.match(result.request.instructions, /Infer those decisions semantically/)
})
test('can disable optimizer web search per request', async () => {
  const result = await buildEcomOptimizerResponsesRequest({ prompt: '护肤品详情页卖点图', webSearch: false }, 'gpt-4.1', fakeFetch)

  assert.equal(result.request.tools, undefined)
  assert.equal(result.request.tool_choice, undefined)
  assert.equal(result.request.include, undefined)
})

test('injects image plans into generated split prompts', () => {
  const optimized = parseOptimizerResult({
    output_text: JSON.stringify({
      prompt: '',
      prompts: [
        { title: '主图', prompt: 'Clean premium hero image of the jar.' },
        { title: '详情图', prompt: 'Ingredient texture scene around the jar.' },
      ],
      imagePlan: [
        {
          title: '主图',
          role: 'marketplace hero image for instant product recognition',
          creativeHook: 'quiet amber reflection, no dense text',
          composition: 'large jar at lower center, low camera distance, minimal background',
          visualEvidence: 'accurate jar silhouette and cream texture',
          differentiation: 'must stay clean and thumbnail-first',
          mustAvoid: 'infographic badges and crowded props',
        },
        {
          title: '详情图',
          role: 'detail-page benefit image with visual proof',
          creativeHook: 'macro cream ribbon and amber particles crossing the foreground',
          composition: 'product smaller on the right with diagonal depth and callout space',
          visualEvidence: 'visible creamy texture, hydrated glow cues, amber material cues',
          differentiation: 'must not reuse the hero packshot pose or plain white background',
          mustAvoid: 'same jar scale, same lid angle, decorative badges only',
        },
      ],
      template: '01-hero-image.json,11-infographic.json',
      category: 'beauty',
      style: 'premium',
      notes: ['已规划主图和详情图的不同角色'],
    }),
  }, { template: 'hero-main', templateLabel: 'Hero Main Image', category: 'beauty', style: 'commercial', platform: 'general' }, { prompt: '主图加详情图', count: 2 })

  assert.equal(optimized.prompts.length, 2)
  assert.equal(optimized.prompts[0].prompt, 'Clean premium hero image of the jar.')
  assert.equal(optimized.prompts[1].prompt, 'Ingredient texture scene around the jar.')
  assert.equal(optimized.imagePlan.length, 2)
})
test('trusts LLM split prompts even when UI count is one', () => {
  const optimized = parseOptimizerResult({
    output_text: JSON.stringify({
      prompt: '',
      prompts: [
        { title: '主图', prompt: 'First separate product hero prompt.' },
        { title: '详情图', prompt: 'Second separate detail prompt.' },
      ],
      imagePlan: [],
      template: 'llm-selected',
      category: 'beauty',
      style: 'premium',
      notes: ['LLM planned two outputs'],
    }),
  }, { template: '', templateLabel: '', category: 'llm-inferred', style: 'llm-inferred', platform: 'llm-inferred' }, { prompt: 'make it better', count: 1 })

  assert.equal(optimized.prompts.length, 2)
  assert.match(optimized.prompt, /First separate product hero prompt/)
})

test('skill router request exposes only the skill catalog and load_skill tool', () => {
  const request = buildEcomSkillRouterResponsesRequest({ prompt: 'make an Amazon A+ infographic' }, 'gpt-4.1', remoteSkillFixture)
  const userText = request.input[0].content[0].text
  const payload = JSON.parse(userText)

  assert.equal(request.tools[0].name, 'load_skill')
  assert.deepEqual(payload.availableSkills.map((item) => item.skill_id), ['01-hero-image.json', '11-infographic.json'])
  assert.equal(userText.includes('keywords'), false)
  assert.equal(userText.includes('trigger_phrases'), false)
  assert.equal(userText.includes('prompt_template'), false)
})

test('resolves skill router load calls to selected template content', () => {
  const result = resolveEcomSkillLoad(remoteSkillFixture, ['template:11-infographic.json'])
  assert.deepEqual(result.requestedSkillIds, ['template:11-infographic.json'])
  assert.deepEqual(result.selectedSkillIds, ['11-infographic.json'])
  assert.equal(result.selectedTemplates[0].id, 'infographic')
})

test('falls back to default template without keyword-based selection', () => {
  const result = resolveEcomSkillLoad(remoteSkillFixture, ['missing-template'])
  assert.deepEqual(result.requestedSkillIds, ['missing-template'])
  assert.deepEqual(result.selectedSkillIds, ['01-hero-image.json'])
})

test('builds a compact skill catalog from loaded templates', () => {
  const catalog = buildEcomSkillCatalog(remoteSkillFixture)
  assert.deepEqual(catalog.map((item) => item.skill_id), ['01-hero-image.json', '11-infographic.json'])
  assert.equal(catalog[0].type, 'ecom-image-template')
})
