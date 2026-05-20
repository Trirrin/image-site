import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { Menu, RotateCcw } from 'lucide-react'
import Generator from './components/Generator'
import Library from './components/Library'
import ImagePreview from './components/ImagePreview'
import PromptMarket from './components/PromptMarket'
import PromptReviewDialog from './components/PromptReviewDialog'
import Sidebar from './components/Sidebar'
import FallbackImage from './components/FallbackImage'
import Login from './components/Login'
import Settings from './components/Settings'
import { clearStoredUser, getStoredUser } from './utils/authStorage'
import { fetchModels, optimizePromptStream, createImageJob, fetchJob } from './api/backend'
import { useSettings } from './hooks/useSettings'
import { useConversations } from './hooks/useConversations'
import { usePromptFavorites } from './hooks/usePromptFavorites'
import { getSize, readFileAsDataURL } from './utils/image'
import { IMAGE_MODEL_REGEX, OPTIMIZER_MODEL_REGEX } from './utils/constants'
import { applyPromptReviewEdit } from './utils/promptOptimization'

const activeJobPollers = new Map()
const JOB_POLL_INTERVAL_MS = 5000
const JOB_POLL_TIMEOUT_MS = 30 * 60 * 1000
const MISSING_JOB_ERROR = '生成任务未创建，请重试'
const ECOM_SKILL_FAILURE_MESSAGE = '电商 Skill 优化失败。请关闭「电商 Skill」后再直接生图。'
const DEFAULT_GENERATION_SETTINGS = {
  mode: 'generate',
  aspectRatio: '',
  resolution: 'auto',
  count: 1,
  quality: 'high',
}

const getDefaultModel = (models) => models[0]?.model_key || ''
const filterImageModels = (models) => models.filter((item) => IMAGE_MODEL_REGEX.test(item.model_key))
function isProviderImageUrl(url) {
  if (typeof url !== 'string') return false
  const value = url.trim()
  if (/^data:image\/[a-z0-9.+-]+(?:;[a-z0-9.+-]+=[^;,]+)*(?:;base64)?,.+/i.test(value)) return true
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

async function toProviderImageUrl(url) {
  if (isProviderImageUrl(url)) return url.trim()
  if (typeof url !== 'string' || !url.startsWith('blob:')) return ''
  try {
    const response = await fetch(url)
    if (!response.ok) return ''
    const blob = await response.blob()
    if (!blob.type.startsWith('image/')) return ''
    const dataUrl = await readFileAsDataURL(blob)
    return isProviderImageUrl(dataUrl) ? dataUrl : ''
  } catch {
    return ''
  }
}

function normalizeOptimizedPromptItems(prompts) {
  if (!Array.isArray(prompts)) return []
  return prompts.map((item) => {
    if (typeof item === 'string') return item.trim()
    return typeof item?.prompt === 'string' ? item.prompt.trim() : ''
  }).filter(Boolean)
}

function promptTextIncludesItem(text, item) {
  if (!text || !item) return false
  const needle = item.length > 80 ? item.slice(0, 80) : item
  return text.includes(needle)
}

function buildJobPromptText(optimizedPrompt, fallbackPrompt) {
  const fallback = typeof fallbackPrompt === 'string' ? fallbackPrompt.trim() : ''
  const prompt = typeof optimizedPrompt?.prompt === 'string' ? optimizedPrompt.prompt.trim() : ''
  const items = normalizeOptimizedPromptItems(optimizedPrompt?.prompts)
  if (items.length === 0) return { prompt: prompt || fallback }

  const lead = prompt && !items.some((item) => promptTextIncludesItem(prompt, item)) ? prompt : fallback
  const opener = lead
    ? `Create ${items.length} separate output images, one image per numbered prompt below. Do not combine these prompts into one collage, grid, contact sheet, storyboard, or multi-panel image. ${lead}`
    : `Create ${items.length} separate output images, one image per numbered prompt below. Do not combine these prompts into one collage, grid, contact sheet, storyboard, or multi-panel image.`
  return {
    prompt: [opener, ...items.map((item, index) => `Output image ${index + 1}: ${item}`)].join('\n\n'),
  }
}

export default function App() {
  const { config, updateConfig, isConfigured, promptOptimizerModel, updatePromptOptimizerModel } = useSettings()
  const {
    conversations, activeId, setActiveId, loading: conversationsLoading,
    saveConversation, deleteConversation, addTurn, getConversation,
  } = useConversations()
  const { addFavorite, removeFavorite, isFavorite } = usePromptFavorites()

  const [view, setView] = useState('chat')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const [prompt, setPrompt] = useState('')
  const [referenceImages, setReferenceImages] = useState([])
  const [model, setModel] = useState('')
  const [mode, setMode] = useState(DEFAULT_GENERATION_SETTINGS.mode)
  const [aspectRatio, setAspectRatio] = useState(DEFAULT_GENERATION_SETTINGS.aspectRatio)
  const [resolution, setResolution] = useState(DEFAULT_GENERATION_SETTINGS.resolution)
  const [count, setCount] = useState(DEFAULT_GENERATION_SETTINGS.count)
  const [quality, setQuality] = useState(DEFAULT_GENERATION_SETTINGS.quality)
  const [useEcomSkill, setUseEcomSkill] = useState(false)
  const [submittingConversationId, setSubmittingConversationId] = useState(null)
  const [pendingPromptDraft, setPendingPromptDraft] = useState(null)
  const [optimizerStatus, setOptimizerStatus] = useState('')
  const [optimizingTurn, setOptimizingTurn] = useState(null)

  const [promptMarketOpen, setPromptMarketOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const [models, setModels] = useState([])

  const imageModels = useMemo(
    () => filterImageModels(models),
    [models]
  )

  const resetGenerationSettings = useCallback((nextModels = imageModels) => {
    setModel(getDefaultModel(nextModels))
    setMode(DEFAULT_GENERATION_SETTINGS.mode)
    setAspectRatio(DEFAULT_GENERATION_SETTINGS.aspectRatio)
    setResolution(DEFAULT_GENERATION_SETTINGS.resolution)
    setCount(DEFAULT_GENERATION_SETTINGS.count)
    setQuality(DEFAULT_GENERATION_SETTINGS.quality)
  }, [imageModels])

  const applyModels = useCallback((nextModels) => {
    const safeModels = Array.isArray(nextModels) ? nextModels : []
    const nextImageModels = filterImageModels(safeModels)
    setModels((current) => {
      if (current.length === safeModels.length && current.every((item, index) => item.model_key === safeModels[index]?.model_key)) return current
      return safeModels
    })
    setModel((current) => {
      if (nextImageModels.some((item) => item.model_key === current)) return current
      return getDefaultModel(nextImageModels)
    })
  }, [])

  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewItems, setPreviewItems] = useState([])
  const [previewIndex, setPreviewIndex] = useState(0)

  const [error, setError] = useState('')
  const errorTimer = useRef(null)

  const [loginUser, setLoginUser] = useState(() => getStoredUser())
  const [showLogin, setShowLogin] = useState(() => {
    const user = getStoredUser()
    return !user?.token || config.groupId == null
  })

  const handleLoginSuccess = useCallback(({ endpoint, apiKey, groupId, groupName }) => {
    updateConfig({ endpoint, apiKey, groupId, groupName })
    setLoginUser(getStoredUser())
    setShowLogin(false)
  }, [updateConfig])

  const handleLogout = useCallback(() => {
    clearStoredUser()
    setLoginUser(null)
    updateConfig({ endpoint: '', apiKey: '', groupId: null, groupName: '' })
    setSettingsOpen(false)
    setShowLogin(true)
  }, [updateConfig])

  const showError = useCallback((msg) => {
    setError(msg)
    clearTimeout(errorTimer.current)
    errorTimer.current = setTimeout(() => setError(''), 4000)
  }, [])

  const fetchedRef = useRef(false)

  const normalizeModels = useCallback((data) => {
    const rawList = data?.data || data?.models || data || []
    return (Array.isArray(rawList) ? rawList : []).map((m) => {
      if (typeof m === 'string') return { model_key: m, display_name: m }
      const key = m.id || m.model_key || m.model
      return { model_key: key, display_name: m.display_name || m.name || key }
    }).filter((m) => m.model_key)
  }, [])

  useEffect(() => {
    if (!isConfigured) {
      fetchedRef.current = ''
      queueMicrotask(() => applyModels([]))
      return
    }
    const cacheKey = `${config.endpoint}::${config.apiKey}`
    if (fetchedRef.current === cacheKey) return
    fetchedRef.current = cacheKey

    const requestConfig = {
      endpoint: config.endpoint,
      apiKey: config.apiKey,
      clientId: config.clientId,
      groupId: config.groupId,
    }
    fetchModels(requestConfig)
      .then((data) => applyModels(normalizeModels(data)))
      .catch(() => applyModels([]))
  }, [applyModels, config.apiKey, config.clientId, config.endpoint, config.groupId, isConfigured, normalizeModels])

  const refreshModels = useCallback(() => {
    if (!config.endpoint || !config.apiKey) return
    fetchedRef.current = ''
    const requestConfig = {
      endpoint: config.endpoint,
      apiKey: config.apiKey,
      clientId: config.clientId,
      groupId: config.groupId,
    }
    fetchModels(requestConfig)
      .then((data) => applyModels(normalizeModels(data)))
      .catch(() => {})
  }, [applyModels, config.apiKey, config.clientId, config.endpoint, config.groupId, normalizeModels])

  const optimizerModels = useMemo(
    () => models.filter((item) => OPTIMIZER_MODEL_REGEX.test(item.model_key)),
    [models]
  )
  const optimizerAvailable = optimizerModels.length > 0
  const ecomSkillActive = useEcomSkill && optimizerAvailable


  useEffect(() => {
    if (!promptOptimizerModel) return
    if (optimizerModels.some((item) => item.model_key === promptOptimizerModel)) return
    updatePromptOptimizerModel('')
  }, [optimizerModels, promptOptimizerModel, updatePromptOptimizerModel])

  const resolveOptimizerModel = useCallback(() => {
    if (promptOptimizerModel && optimizerModels.some((item) => item.model_key === promptOptimizerModel)) return promptOptimizerModel
    return getDefaultModel(optimizerModels)
  }, [optimizerModels, promptOptimizerModel])

  const buildOptimizedPrompt = useCallback(async ({ submittedPrompt, requestMode, refs }) => {
    if (!ecomSkillActive) return null
    const optimizerModel = resolveOptimizerModel()
    if (!optimizerModel) throw new Error(ECOM_SKILL_FAILURE_MESSAGE)
    setOptimizerStatus('意图模型正在优化提示词')
    let optimized
    try {
      const result = await optimizePromptStream({
        endpoint: config.endpoint,
        apiKey: config.apiKey,
        model: optimizerModel || '',
        input: {
          prompt: submittedPrompt,
          mode: requestMode,
          aspectRatio,
          resolution,
          count,
          hasReferenceImages: refs.length > 0,
          referenceImages: refs,
        },
        onStatus: (status) => {
          if (status?.message) setOptimizerStatus(status.message)
        },
      })
      optimized = result.optimized
    } catch {
      throw new Error(ECOM_SKILL_FAILURE_MESSAGE)
    }
    const optimizedPrompt = typeof optimized?.prompt === 'string' ? optimized.prompt.trim() : ''
    if (!optimizedPrompt || optimized?.disabled || optimized?.fallback) {
      throw new Error(ECOM_SKILL_FAILURE_MESSAGE)
    }
    return {
      ...optimized,
      model: optimizerModel || optimized?.model || '',
      originalPrompt: submittedPrompt,
      prompt: optimizedPrompt,
    }
  }, [aspectRatio, config.apiKey, config.endpoint, count, ecomSkillActive, resolution, resolveOptimizerModel])

  const updateTurn = useCallback(async (conversationId, turnId, updater) => {
    const conv = await getConversation(conversationId)
    if (!conv) return null
    const index = (conv.turns || []).findIndex((turn) => turn.id === turnId)
    if (index < 0) return conv
    const turns = [...(conv.turns || [])]
    turns[index] = updater(turns[index])
    const next = { ...conv, turns, updatedAt: new Date().toISOString() }
    await saveConversation(next)
    return next
  }, [getConversation, saveConversation])

  const getLastConversationImages = useCallback((conversation) => {
    const turns = conversation?.turns || []
    for (let i = turns.length - 1; i >= 0; i -= 1) {
      const images = turns[i]?.status === 'success' ? turns[i].images || [] : []
      const usableImages = images.filter((image) => image?.url)
      if (usableImages.length > 0) return usableImages
    }
    return []
  }, [])

  const completeJobTurn = useCallback(async (conversationId, turnId, job) => {
    const images = (job.images || []).map((img, idx) => ({
      id: img.id || `img-${Date.now()}-${idx}`,
      url: img.url,
    }))
    if (job.status === 'success' && images.length === 0) throw new Error('未返回图片，请检查模型配置')

    const latest = await updateTurn(conversationId, turnId, (turn) => ({
      ...turn,
      status: job.status === 'success' ? 'success' : 'error',
      progress: job.progress ?? 100,
      images: job.status === 'success' ? images : [],
      error: job.status === 'error' ? (job.error || '生成失败') : '',
    }))

    if (latest?.title === '新的会话') {
      const turn = latest.turns.find((item) => item.id === turnId)
      if (turn?.prompt?.trim()) {
        await saveConversation({ ...latest, title: turn.prompt.trim().slice(0, 30) })
      }
    }

    return images
  }, [saveConversation, updateTurn])

  const waitForJob = useCallback(async (conversationId, turnId, jobId) => {
    const startedAt = Date.now()
    for (;;) {
      if (Date.now() - startedAt > JOB_POLL_TIMEOUT_MS) {
        const error = new Error('生成任务超时，请稍后重试')
        await updateTurn(conversationId, turnId, (turn) => ({ ...turn, status: 'error', progress: 100, error: error.message }))
        throw error
      }

      let job
      try {
        ;({ job } = await fetchJob({ clientId: config.clientId, jobId }))
      } catch (err) {
        const message = err.message || '无法获取生成任务'
        await updateTurn(conversationId, turnId, (turn) => ({ ...turn, status: 'error', error: message }))
        throw err
      }
      await updateTurn(conversationId, turnId, (turn) => ({
        ...turn,
        status: job.status === 'error' ? 'error' : job.status === 'success' ? 'success' : 'pending',
        progress: job.progress ?? turn.progress ?? 0,
        error: job.status === 'error' ? (job.error || '生成失败') : turn.error,
      }))
      if (job.status === 'success' || job.status === 'error') return completeJobTurn(conversationId, turnId, job)
      await new Promise((resolve) => setTimeout(resolve, JOB_POLL_INTERVAL_MS))
    }
  }, [completeJobTurn, config.clientId, updateTurn])

  const startJobPoll = useCallback((conversationId, turnId, jobId) => {
    if (!jobId) return Promise.resolve([])
    const existing = activeJobPollers.get(jobId)
    if (existing) return existing

    const poller = Promise.resolve()
      .then(() => waitForJob(conversationId, turnId, jobId))
      .finally(() => {
        activeJobPollers.delete(jobId)
      })
    activeJobPollers.set(jobId, poller)
    return poller
  }, [waitForJob])

  useEffect(() => {
    if (!config.clientId || conversationsLoading) return
    conversations.forEach((conv) => {
      ;(conv.turns || [])
        .filter((turn) => turn.status === 'pending' && turn.jobId)
        .forEach((turn) => {
          startJobPoll(conv.id, turn.id, turn.jobId).catch(() => {})
        })
    })
  }, [config.clientId, conversations, conversationsLoading, startJobPoll])

  useEffect(() => {
    if (conversationsLoading || submittingConversationId) return
    conversations.forEach((conv) => {
      ;(conv.turns || [])
        .filter((turn) => turn.status === 'pending' && !turn.jobId)
        .forEach((turn) => {
          updateTurn(conv.id, turn.id, (current) => {
            if (current.status === 'error' && current.error) return current
            return {
              ...current,
              status: 'error',
              progress: 100,
              error: current.error || MISSING_JOB_ERROR,
            }
          }).catch(() => {})
        })
    })
  }, [conversations, conversationsLoading, submittingConversationId, updateTurn])

  const ensureActiveConversation = useCallback(async () => {
    if (activeId) {
      const conv = await getConversation(activeId)
      if (conv) return conv
    }
    const conv = {
      id: `conv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: '新的会话',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      turns: [],
    }
    await saveConversation(conv)
    setActiveId(conv.id)
    return conv
  }, [activeId, getConversation, saveConversation, setActiveId])

  const createGenerationTurn = useCallback(async (draft) => {
    const turnId = draft.turnId || `turn-${Date.now()}`
    const { prompt: finalPrompt } = buildJobPromptText(draft.optimizedPrompt, draft.submittedPrompt)
    const body = {
      prompt: finalPrompt,
      mode: draft.requestMode,
      n: draft.count,
      size: draft.size || undefined,
    }
    if (draft.model) body.model = draft.model
    if (draft.quality && draft.quality !== 'high') body.quality = draft.quality
    if (draft.refs.length > 0) body.sourceImages = draft.refs

    const { job } = await createImageJob({
      clientId: config.clientId,
      endpoint: config.endpoint,
      apiKey: config.apiKey,
      request: body,
    })
    if (!job?.id) throw new Error(MISSING_JOB_ERROR)

    const turn = {
      id: turnId,
      prompt: finalPrompt,
      originalPrompt: draft.submittedPrompt,
      optimizedPrompt: draft.optimizedPrompt,
      model: draft.model,
      mode: draft.requestMode,
      contextImageId: draft.contextImages[draft.contextImages.length - 1]?.id || '',
      contextImageIds: draft.contextImages.map((image) => image.id).filter(Boolean),
      aspectRatio: draft.aspectRatio,
      resolution: draft.resolution,
      size: draft.size,
      count: draft.count,
      quality: draft.quality,
      status: 'pending',
      sourceImages: draft.refs,
      jobId: job.id,
      progress: job.progress ?? 0,
      images: [],
      createdAt: new Date().toISOString(),
    }

    await addTurn(draft.conversationId, turn)
    setPrompt('')
    setReferenceImages([])

    startJobPoll(draft.conversationId, turnId, job.id)
      .then((images) => {
        if (images.length > 0 && draft.submittedPrompt) {
          addFavorite({ id: `fav-${Date.now()}`, title: draft.submittedPrompt.slice(0, 30), prompt: draft.submittedPrompt, category: '收藏' })
        }
      })
      .catch((err) => {
        const message = err.message || '生成失败，请重试'
        showError(message)
        updateTurn(draft.conversationId, turnId, (turn) => ({ ...turn, status: 'error', error: message }))
      })
      .finally(() => setSubmittingConversationId((current) => current === draft.conversationId ? null : current))
  }, [addFavorite, addTurn, config.apiKey, config.clientId, config.endpoint, showError, startJobPoll, updateTurn])

  const prepareGenerationDraft = useCallback(async (conversation = null) => {
    const selectedModel = imageModels.some((item) => item.model_key === model) ? model : getDefaultModel(imageModels)
    if (!selectedModel) throw new Error('上游没有匹配 gpt-image* 的生图模型')

    const conv = conversation || await ensureActiveConversation()
    const submittedPrompt = prompt.trim()
    const size = getSize(aspectRatio, resolution)
    const manualRefs = referenceImages.map((r) => ({
      url: r.dataUrl,
      name: r.name,
    })).filter((ref) => isProviderImageUrl(ref.url))
    const contextImages = manualRefs.length === 0 ? getLastConversationImages(conv) : []
    const contextRefs = []
    for (const [idx, image] of contextImages.entries()) {
      const url = await toProviderImageUrl(image.sourceUrl || image.url)
      if (url) contextRefs.push({ url, name: `previous-image-${idx + 1}` })
    }
    const refs = manualRefs.length > 0 ? manualRefs : contextRefs
    if (referenceImages.length > 0 && refs.length === 0) throw new Error('参考图必须是有效图片')
    if (contextImages.length > 0 && refs.length === 0) throw new Error('上一张图片不能作为参考图，请重新上传')

    const requestMode = refs.length > 0 ? 'edit' : mode
    const optimizedPrompt = await buildOptimizedPrompt({ submittedPrompt, requestMode, refs })

    return {
      turnId: `turn-${Date.now()}`,
      conversationId: conv.id,
      submittedPrompt,
      optimizedPrompt,
      requestMode,
      refs,
      contextImages,
      model: selectedModel,
      aspectRatio,
      resolution,
      size,
      count,
      quality,
      needsReview: Boolean(optimizedPrompt),
    }
  }, [aspectRatio, buildOptimizedPrompt, count, ensureActiveConversation, getLastConversationImages, imageModels, mode, model, prompt, quality, referenceImages, resolution])

  const removeOptimizingTurn = useCallback((turnId) => {
    setOptimizingTurn((current) => current?.id === turnId ? null : current)
  }, [])

  const handleSubmit = useCallback(async () => {
    if (!isConfigured) {
      setShowLogin(true)
      return
    }
    if (!prompt.trim() && referenceImages.length === 0) {
      showError('请先输入提示词或上传参考图')
      return
    }

    const optimisticTurnId = `optimizing-${Date.now()}`
    const submittedPrompt = prompt.trim()
    const previewRefs = referenceImages.map((image) => ({
      id: `${optimisticTurnId}-${image.name}`,
      url: image.dataUrl,
    }))

    setError('')
    setPendingPromptDraft(null)
    setOptimizerStatus('')

    let draft = null
    try {
      const conv = await ensureActiveConversation()
      setOptimizingTurn({
        id: optimisticTurnId,
        conversationId: conv.id,
        prompt: submittedPrompt,
        originalPrompt: submittedPrompt,
        model,
        mode: referenceImages.length > 0 ? 'edit' : mode,
        size: getSize(aspectRatio, resolution),
        resolution,
        status: 'optimizing',
        progress: 5,
        images: previewRefs,
        createdAt: new Date().toISOString(),
      })
      setPrompt('')
      setReferenceImages([])

      draft = await prepareGenerationDraft(conv)
      removeOptimizingTurn(optimisticTurnId)
      setOptimizerStatus('')
      if (draft.needsReview) {
        setPendingPromptDraft(draft)
        return
      }

      setOptimizerStatus('')
      setSubmittingConversationId(draft.conversationId)
      await createGenerationTurn(draft)
    } catch (err) {
      removeOptimizingTurn(optimisticTurnId)
      setOptimizerStatus('')
      const message = err.message || '生成失败，请重试'
      showError(message)
      setSubmittingConversationId(null)
      if (draft?.conversationId && draft?.turnId) {
        await updateTurn(draft.conversationId, draft.turnId, (turn) => ({
          ...turn,
          status: 'error',
          error: message,
        }))
      }
    }
  }, [aspectRatio, createGenerationTurn, ensureActiveConversation, isConfigured, mode, model, prepareGenerationDraft, prompt, referenceImages, removeOptimizingTurn, resolution, showError, updateTurn])

  const handleConfirmPromptDraft = useCallback(async (editedPrompt = '') => {
    if (!pendingPromptDraft) return
    const draft = applyPromptReviewEdit(pendingPromptDraft, editedPrompt)
    setPendingPromptDraft(null)
    setOptimizerStatus('')
    setSubmittingConversationId(draft.conversationId)
    try {
      await createGenerationTurn(draft)
    } catch (err) {
      const message = err.message || '生成失败，请重试'
      showError(message)
      setSubmittingConversationId(null)
    }
  }, [createGenerationTurn, pendingPromptDraft, showError])

  const handleCancelPromptDraft = useCallback(() => {
    setPendingPromptDraft(null)
    setOptimizerStatus('')
  }, [])

  const handleRetryTurn = useCallback(async (conversationId, turn) => {
    if (!isConfigured) {
      setShowLogin(true)
      return
    }
    if (!conversationId || !turn || turn.status !== 'error') return

    const { prompt: promptText } = buildJobPromptText(turn.optimizedPrompt, turn.prompt || turn.originalPrompt || '')
    const sourceImages = Array.isArray(turn.sourceImages) ? turn.sourceImages : []
    if (turn.mode === 'edit' && sourceImages.length === 0) {
      showError('这个失败任务没有保存参考图，不能重试；请重新提交。')
      return
    }

    const body = {
      prompt: promptText,
      mode: turn.mode === 'edit' ? 'edit' : 'generate',
      n: turn.count || 1,
      size: turn.size || undefined,
    }
    if (turn.model) body.model = turn.model
    if (turn.quality && turn.quality !== 'high') body.quality = turn.quality
    if (sourceImages.length > 0) body.sourceImages = sourceImages

    setError('')
    setSubmittingConversationId(conversationId)
    try {
      const { job } = await createImageJob({
        clientId: config.clientId,
        endpoint: config.endpoint,
        apiKey: config.apiKey,
        request: body,
      })
      if (!job?.id) throw new Error(MISSING_JOB_ERROR)

      await updateTurn(conversationId, turn.id, (current) => ({
        ...current,
        status: 'pending',
        jobId: job.id,
        progress: job.progress ?? 0,
        error: '',
        images: [],
        sourceImages,
        retriedAt: new Date().toISOString(),
      }))

      startJobPoll(conversationId, turn.id, job.id)
        .catch((err) => {
          const message = err.message || '生成失败，请重试'
          showError(message)
          updateTurn(conversationId, turn.id, (current) => ({ ...current, status: 'error', error: message }))
        })
        .finally(() => setSubmittingConversationId((current) => current === conversationId ? null : current))
    } catch (err) {
      const message = err.message || '重试失败，请稍后再试'
      showError(message)
      setSubmittingConversationId(null)
    }
  }, [config.apiKey, config.clientId, config.endpoint, isConfigured, showError, startJobPoll, updateTurn])
  const handleCreateConversation = useCallback(async () => {
    const conv = {
      id: `conv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: '新的会话',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      turns: [],
    }
    await saveConversation(conv)
    setActiveId(conv.id)
    setPrompt('')
    setReferenceImages([])
    resetGenerationSettings()
    setView('chat')
    setSidebarOpen(false)
  }, [resetGenerationSettings, saveConversation, setActiveId])

  const handleDeleteConversation = useCallback(async (id) => {
    await deleteConversation(id)
  }, [deleteConversation])

  const handleSelectConversation = useCallback(async (id) => {
    setActiveId(id)
    setView('chat')
    setSidebarOpen(false)
  }, [setActiveId])

  const handleDeleteImage = useCallback((item) => {
    if (!confirm('确定要删除这张图片吗？')) return
    getConversation(item.conversationId).then((conv) => {
      if (!conv) return
      const turns = (conv.turns || []).flatMap((turn) => {
        if (turn.id !== item.turnId) return [turn]
        const images = (turn.images || []).filter((img) => img.id !== item.image.id)
        return images.length > 0 ? [{ ...turn, images }] : []
      })
      saveConversation({ ...conv, turns, updatedAt: new Date().toISOString() })
    })
  }, [getConversation, saveConversation])

  const handleJumpToTurn = useCallback((convId) => {
    setActiveId(convId)
    setView('chat')
  }, [setActiveId])

  const handleOpenPreview = useCallback((items, idx) => {
    setPreviewItems(items)
    setPreviewIndex(idx)
    setPreviewOpen(true)
  }, [])

  const handleReferenceImagesChange = useCallback((images) => {
    setReferenceImages(images)
    if (images.length > 0) setMode('edit')
  }, [])

  const savedConversationTurns = conversations.find((c) => c.id === activeId)?.turns || []
  const activeOptimizingTurn = optimizingTurn?.conversationId === activeId ? optimizingTurn : null
  const activeConversationTurns = activeOptimizingTurn ? [...savedConversationTurns, activeOptimizingTurn] : savedConversationTurns
  const activeConversationBusy = activeConversationTurns.some((turn) => (turn.status === 'pending' && turn.jobId) || turn.status === 'optimizing')
    || submittingConversationId === activeId
    || (activeId == null && submittingConversationId != null)
  const hasContextImage = getLastConversationImages({ turns: savedConversationTurns }).length > 0
  const effectiveMode = referenceImages.length > 0 || hasContextImage ? 'edit' : mode
  const displayView = prompt.trim() || referenceImages.length > 0 || activeConversationBusy || activeConversationTurns.length > 0

  return (
    <div className="flex h-screen overflow-hidden bg-pearl">
      <Sidebar
        activeId={activeId}
        conversations={conversations}
        isOpen={sidebarOpen}
        onCreate={handleCreateConversation}
        onDelete={handleDeleteConversation}
        onSelect={handleSelectConversation}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        onLogout={loginUser ? handleLogout : undefined}
        onOpenSettings={loginUser ? () => setSettingsOpen(true) : undefined}
      />

      <div className="flex flex-1 flex-col min-w-0">
        <div className="flex items-center justify-between gap-3 border-b border-borderSoft/70 bg-surface/60 px-4 py-3 md:hidden">
          <div className="flex items-center gap-2">
            <button
              aria-label="菜单"
              className="grid h-9 w-9 place-items-center rounded-full border border-borderSoft bg-white text-stoneText"
              onClick={() => setSidebarOpen(true)}
              type="button"
            >
              <Menu size={15} />
            </button>
            <span className="text-sm font-semibold text-charcoal">Image Site</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              className={`rounded-full px-4 py-1.5 text-xs font-medium transition ${
                view === 'chat' ? 'bg-amberSoft text-charcoal' : 'text-stoneText hover:text-charcoal'
              }`}
              onClick={() => setView('chat')}
              type="button"
            >
              生成
            </button>
            <button
              className={`rounded-full px-4 py-1.5 text-xs font-medium transition ${
                view === 'library' ? 'bg-amberSoft text-charcoal' : 'text-stoneText hover:text-charcoal'
              }`}
              onClick={() => setView('library')}
              type="button"
            >
              图库
            </button>
          </div>
        </div>

        <div className="hidden border-b border-borderSoft/70 bg-surface/60 px-5 py-3 md:flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              className={`rounded-full px-5 py-2 text-sm font-medium transition ${
                view === 'chat' ? 'bg-amberSoft text-charcoal' : 'text-stoneText hover:text-charcoal'
              }`}
              onClick={() => setView('chat')}
              type="button"
            >
              生成
            </button>
            <button
              className={`rounded-full px-5 py-2 text-sm font-medium transition ${
                view === 'library' ? 'bg-amberSoft text-charcoal' : 'text-stoneText hover:text-charcoal'
              }`}
              onClick={() => setView('library')}
              type="button"
            >
              图库
            </button>
          </div>
        </div>

        {view === 'chat' && (
          <div className="flex-1 relative overflow-hidden">
            <div className="absolute inset-0 overflow-y-auto pb-56 [scrollbar-width:thin]">
              <div className="mx-auto max-w-6xl px-5 py-5">
                {!displayView ? (
                  <div className="flex min-h-52 flex-col items-center justify-center gap-4 text-center">
                    <div className="grid h-16 w-16 place-items-center rounded-[1.75rem] bg-white/80 text-champagne shadow-warm">
                      <img className="h-8 w-8 object-contain" src="/logo.svg" alt="" onError={(e) => { e.target.style.display = 'none' }} />
                    </div>
                    <div>
                      <h2 className="text-xl font-semibold tracking-tight text-charcoal">开始创作</h2>
                      <p className="mt-1 text-sm text-stoneText max-w-md">
                        在下方输入描述，选择模型和参数，生成令人惊叹的 AI 图像。
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {activeConversationTurns.map((turn) => (
                      <div key={turn.id} className="rounded-[1.25rem] border border-borderSoft/70 bg-white/80 p-4 shadow-soft">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-charcoal">{turn.originalPrompt || turn.prompt || '（空提示词）'}</p>
                            {turn.optimizedPrompt?.prompt && turn.optimizedPrompt.prompt !== turn.originalPrompt && (
                              <details className="mt-2 rounded-xl border border-borderSoft/70 bg-pearl/80 px-3 py-2 text-xs text-stoneText">
                                <summary className="cursor-pointer font-medium text-charcoal">已用电商 Skill 优化提示词</summary>
                                <p className="mt-2 whitespace-pre-wrap leading-5">{turn.optimizedPrompt.prompt}</p>
                              </details>
                            )}
                            <p className="mt-1 text-[11px] text-stoneText">
                              {turn.model && `${turn.model} · `}{turn.size || turn.resolution || ''}{turn.optimizedPrompt?.model ? ` · 意图模型 ${turn.optimizedPrompt.model}` : ''}
                            </p>
                          </div>
                          <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-medium ${
                            turn.status === 'success' ? 'bg-emerald-50 text-emerald-700' :
                            turn.status === 'error' ? 'bg-red-50 text-red-700' :
                            'bg-amber-50 text-amber-700'
                          }`}>
                            {turn.status === 'success' ? '已完成' : turn.status === 'error' ? '失败' : turn.status === 'optimizing' ? '优化中' : '生成中'}
                          </span>
                        </div>

                        {(turn.status === 'pending' || turn.status === 'optimizing') && (
                          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-amber-100">
                            <div
                              className="h-full rounded-full bg-champagne transition-all duration-500"
                              style={{ width: `${Math.max(5, Math.min(100, turn.progress || 5))}%` }}
                            />
                          </div>
                        )}

                        {turn.status === 'optimizing' && optimizerStatus && (
                          <p className="mt-2 text-xs font-medium text-amber-800">{optimizerStatus}</p>
                        )}

                        {turn.images.length > 0 && (
                          <div className={`mt-3 grid max-w-3xl gap-2 ${
                            turn.images.length === 1 ? 'grid-cols-1' :
                            'grid-cols-2'
                          }`}>
                            {turn.images.map((img) => (
                              <FallbackImage
                                key={img.id}
                                alt={turn.prompt}
                                className="h-auto max-h-[34vh] w-full rounded-xl border border-borderSoft/70 bg-pearl object-contain cursor-pointer transition hover:opacity-90 sm:max-h-[42vh]"
                                image={img}
                                loading="lazy"
                                onClick={() => {
                                  const items = turn.images.map((i) => ({
                                    image: i,
                                    conversationId: activeId,
                                    conversationTitle: conversations.find(c => c.id === activeId)?.title || '',
                                    turnId: turn.id,
                                    turnPrompt: turn.prompt,
                                    turnModel: turn.model,
                                    turnSize: turn.size,
                                    turnAspectRatio: turn.aspectRatio,
                                    turnCreatedAt: turn.createdAt,
                                  }))
                                  setPreviewItems(items)
                                  setPreviewIndex(0)
                                  setPreviewOpen(true)
                                }}
                              />
                            ))}
                          </div>
                        )}

                        {turn.status === 'error' && (
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <p className="min-w-0 flex-1 text-xs text-red-700">{turn.error || '生成失败'}</p>
                            <button
                              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3 text-xs font-medium text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                              disabled={activeConversationBusy}
                              onClick={() => handleRetryTurn(activeId, turn)}
                              type="button"
                            >
                              <RotateCcw size={12} />
                              重试
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>


            {error && (
              <div className="pointer-events-none absolute bottom-[180px] left-1/2 z-20 -translate-x-1/2 px-4">
                <div className="pointer-events-auto rounded-full bg-red-50 px-5 py-2.5 text-sm font-medium text-red-700 shadow-soft border border-red-200">
                  {error}
                </div>
              </div>
            )}

            <Generator
              aspectRatio={aspectRatio}
              count={count}
              ecomSkillAvailable={optimizerAvailable}
              ecomSkillEnabled={ecomSkillActive}
              isBusy={activeConversationBusy}
              model={model}
              models={imageModels}
              optimizerModels={optimizerModels}
              mode={effectiveMode}
              onAspectRatioChange={setAspectRatio}
              onCountChange={setCount}
              onEcomSkillEnabledChange={setUseEcomSkill}
              onModelChange={setModel}
              onOptimizerModelChange={updatePromptOptimizerModel}
              onModeChange={setMode}
              onOpenPromptMarket={() => setPromptMarketOpen(true)}
              onPromptChange={setPrompt}
              onQualityChange={setQuality}
              onReferenceImagesChange={handleReferenceImagesChange}
              onResolutionChange={setResolution}
              onSubmit={handleSubmit}
              prompt={prompt}
              optimizerModel={promptOptimizerModel}
              quality={quality}
              referenceImages={referenceImages}
              resolution={resolution}
            />
          </div>
        )}

        {view === 'library' && (
          <Library
            conversations={conversations}
            onDelete={handleDeleteImage}
            onJumpToTurn={handleJumpToTurn}
            onPreview={handleOpenPreview}
          />
        )}
      </div>

      {showLogin && (
        <Login onLoginSuccess={handleLoginSuccess} />
      )}

      {settingsOpen && (
        <Settings
          config={config}
          models={optimizerModels}
          optimizerAvailable={optimizerAvailable}
          onClose={() => setSettingsOpen(false)}
          onPromptOptimizerModelChange={updatePromptOptimizerModel}
          onRefreshModels={refreshModels}
          onUpdateConfig={updateConfig}
          promptOptimizerModel={promptOptimizerModel}
          user={loginUser}
        />
      )}

      {promptMarketOpen && (
        <PromptMarket
          isFavorite={isFavorite}
          onClose={() => setPromptMarketOpen(false)}
          onSelectPrompt={(text) => {
            setPrompt(text)
            setPromptMarketOpen(false)
          }}
          onToggleFavorite={(promptItem) => {
            if (isFavorite(promptItem.id)) {
              removeFavorite(promptItem.id)
            } else {
              addFavorite(promptItem)
            }
          }}
          open={promptMarketOpen}
        />
      )}

      {pendingPromptDraft?.conversationId === activeId && (
        <PromptReviewDialog
          key={pendingPromptDraft.turnId || pendingPromptDraft.conversationId}
          draft={pendingPromptDraft}
          isBusy={submittingConversationId === pendingPromptDraft.conversationId}
          onCancel={handleCancelPromptDraft}
          onConfirm={handleConfirmPromptDraft}
        />
      )}

      {previewOpen && (
        <ImagePreview
          index={previewIndex}
          items={previewItems}
          onClose={() => setPreviewOpen(false)}
          onIndexChange={setPreviewIndex}
          open={previewOpen}
        />
      )}
    </div>
  )
}
