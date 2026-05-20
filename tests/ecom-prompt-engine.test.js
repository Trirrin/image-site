import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildEcomOptimizerResponsesRequest,
  buildEcomSkillCatalog,
  buildEcomSkillRouterResponsesRequest,
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
    keywords: ['白底图', '主图', 'hero image', 'packshot'],
    trigger_phrases: ['产品主图', '电商主图'],
    prompt_template: { type: 'product photography' },
  },
  'https://example.test/11-infographic.json': {
    id: 'infographic',
    name: 'Infographic',
    keywords: ['信息图', 'infographic', 'A+', '详情页'],
    trigger_phrases: ['详情页图', 'A+Content', '卖点图'],
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
      keywords: ['白底图', '主图', 'hero image', 'packshot'],
      triggerPhrases: ['产品主图', '电商主图'],
      supportsImageReference: true,
    },
    {
      fileName: '11-infographic.json',
      id: 'infographic',
      name: 'Infographic',
      keywords: ['信息图', 'infographic', 'A+', '详情页'],
      triggerPhrases: ['详情页图', 'A+Content', '卖点图'],
      supportsImageReference: true,
    },
  ],
}

test('uses the skill default hero template when no keyword matches', async () => {
  const result = await buildEcomOptimizerResponsesRequest({ prompt: 'make this product look premium' }, 'gpt-4.1', fakeFetch)
  const liveSkill = liveSkillFromRequest(result)
  assert.deepEqual(liveSkill.selectedTemplateFiles, ['01-hero-image.json'])
  assert.equal(result.request.max_output_tokens, 8000)
})

test('keeps explicit infographic template matches', async () => {
  const result = await buildEcomOptimizerResponsesRequest({ prompt: '护肤品详情页卖点图' }, 'gpt-4.1', fakeFetch)
  const liveSkill = liveSkillFromRequest(result)
  assert.deepEqual(liveSkill.selectedTemplateFiles, ['11-infographic.json'])
})

test('skill router request exposes only the skill catalog and load_skill tool', () => {
  const request = buildEcomSkillRouterResponsesRequest({ prompt: 'make an Amazon A+ infographic' }, 'gpt-4.1', remoteSkillFixture)
  const userText = request.input[0].content[0].text
  const payload = JSON.parse(userText)

  assert.equal(request.tools[0].name, 'load_skill')
  assert.deepEqual(payload.availableSkills.map((item) => item.skill_id), ['01-hero-image.json', '11-infographic.json'])
  assert.equal(userText.includes('prompt_template'), false)
})

test('resolves skill router load calls to selected template content', () => {
  const result = resolveEcomSkillLoad(remoteSkillFixture, ['template:11-infographic.json'], { prompt: 'generic product' })
  assert.deepEqual(result.requestedSkillIds, ['template:11-infographic.json'])
  assert.deepEqual(result.selectedSkillIds, ['11-infographic.json'])
  assert.equal(result.selectedTemplates[0].id, 'infographic')
})

test('falls back to default template when skill router selects nothing usable', () => {
  const result = resolveEcomSkillLoad(remoteSkillFixture, ['missing-template'], { prompt: 'generic product' })
  assert.deepEqual(result.requestedSkillIds, ['missing-template'])
  assert.deepEqual(result.selectedSkillIds, ['01-hero-image.json'])
})

test('builds a compact skill catalog from loaded templates', () => {
  const catalog = buildEcomSkillCatalog(remoteSkillFixture)
  assert.deepEqual(catalog.map((item) => item.skill_id), ['01-hero-image.json', '11-infographic.json'])
  assert.equal(catalog[0].type, 'ecom-image-template')
})
