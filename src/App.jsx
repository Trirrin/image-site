import { useState, useCallback, useEffect, useRef } from 'react'
import { Menu } from 'lucide-react'
import Generator from './components/Generator'
import Library from './components/Library'
import ImagePreview from './components/ImagePreview'
import PromptMarket from './components/PromptMarket'
import Sidebar from './components/Sidebar'
import FallbackImage from './components/FallbackImage'
import Login from './components/Login'
import Settings from './components/Settings'
import { clearStoredUser, getStoredUser } from './utils/authStorage'
import { fetchModels, createImageJob, fetchJob } from './api/backend'
import { useSettings } from './hooks/useSettings'
import { useConversations } from './hooks/useConversations'
import { usePromptFavorites } from './hooks/usePromptFavorites'
import { getSize } from './utils/image'

const activeJobPollers = new Map()
const JOB_POLL_INTERVAL_MS = 5000
const MISSING_JOB_ERROR = '生成任务未创建，请重试'
const DEFAULT_GENERATION_SETTINGS = {
  mode: 'generate',
  aspectRatio: '',
  resolution: 'auto',
  count: 1,
  quality: 'high',
}

const getDefaultModel = (models) => models[0]?.model_key || ''

export default function App() {
  const { config, updateConfig, isConfigured } = useSettings()
  const {
    conversations, activeId, setActiveId,
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
  const [submittingConversationId, setSubmittingConversationId] = useState(null)

  const [promptMarketOpen, setPromptMarketOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const [models, setModels] = useState([])

  const resetGenerationSettings = useCallback((nextModels = models) => {
    setModel(getDefaultModel(nextModels))
    setMode(DEFAULT_GENERATION_SETTINGS.mode)
    setAspectRatio(DEFAULT_GENERATION_SETTINGS.aspectRatio)
    setResolution(DEFAULT_GENERATION_SETTINGS.resolution)
    setCount(DEFAULT_GENERATION_SETTINGS.count)
    setQuality(DEFAULT_GENERATION_SETTINGS.quality)
  }, [models])

  const applyModels = useCallback((nextModels) => {
    setModels(nextModels)
    setModel((current) => {
      if (nextModels.some((item) => item.model_key === current)) return current
      return getDefaultModel(nextModels)
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
      queueMicrotask(() => applyModels([]))
      return
    }
    const cacheKey = `${config.endpoint}::${config.apiKey}`
    if (fetchedRef.current === cacheKey) return
    fetchedRef.current = cacheKey

    fetchModels(config)
      .then((data) => applyModels(normalizeModels(data)))
      .catch(() => applyModels([]))
  }, [applyModels, config, isConfigured, normalizeModels])

  const refreshModels = useCallback(() => {
    if (!config.endpoint || !config.apiKey) return
    fetchedRef.current = ''
    fetchModels(config)
      .then((data) => applyModels(normalizeModels(data)))
      .catch(() => {})
  }, [applyModels, config, normalizeModels])

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

  const getLastConversationImage = useCallback((conversation) => {
    const turns = conversation?.turns || []
    for (let i = turns.length - 1; i >= 0; i -= 1) {
      const images = turns[i]?.status === 'success' ? turns[i].images || [] : []
      const image = images[images.length - 1]
      if (image?.url) return image
    }
    return null
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
    for (;;) {
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
    if (!config.clientId) return
    conversations.forEach((conv) => {
      ;(conv.turns || [])
        .filter((turn) => turn.status === 'pending' && turn.jobId)
        .forEach((turn) => {
          startJobPoll(conv.id, turn.id, turn.jobId).catch(() => {})
        })
    })
  }, [config.clientId, conversations, startJobPoll])

  useEffect(() => {
    if (submittingConversationId) return
    conversations.forEach((conv) => {
      ;(conv.turns || [])
        .filter((turn) => turn.status === 'pending' && !turn.jobId)
        .forEach((turn) => {
          updateTurn(conv.id, turn.id, (current) => ({
            ...current,
            status: 'error',
            progress: 100,
            error: current.error || MISSING_JOB_ERROR,
          })).catch(() => {})
        })
    })
  }, [conversations, submittingConversationId, updateTurn])

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

  const handleSubmit = useCallback(async () => {
    if (!isConfigured) {
      setShowLogin(true)
      return
    }
    if (!prompt.trim() && referenceImages.length === 0) {
      showError('请先输入提示词或上传参考图')
      return
    }

    setError('')
    const turnId = `turn-${Date.now()}`
    let conversationId = activeId

    try {
      const conv = await ensureActiveConversation()
      conversationId = conv.id
      setSubmittingConversationId(conv.id)

      const size = getSize(aspectRatio, resolution)
      const manualRefs = referenceImages.map((r) => ({
        url: r.dataUrl,
        name: r.name,
      }))
      const contextImage = manualRefs.length === 0 ? getLastConversationImage(conv) : null
      const refs = contextImage ? [{ url: contextImage.sourceUrl || contextImage.url, name: 'previous-image' }] : manualRefs
      const requestMode = refs.length > 0 ? 'edit' : mode

      const body = {
        prompt: prompt.trim(),
        mode: requestMode,
        n: count,
        size: size || undefined,
      }
      if (model) body.model = model
      if (quality && quality !== 'high') body.quality = quality
      if (refs.length > 0) body.sourceImages = refs

      const { job } = await createImageJob({
        clientId: config.clientId,
        endpoint: config.endpoint,
        apiKey: config.apiKey,
        request: body,
      })
      if (!job?.id) throw new Error(MISSING_JOB_ERROR)

      const turn = {
        id: turnId,
        prompt: prompt.trim(),
        model,
        mode: requestMode,
        contextImageId: contextImage?.id || '',
        aspectRatio,
        resolution,
        size,
        count,
        quality,
        status: 'pending',
        jobId: job.id,
        progress: job.progress ?? 0,
        images: [],
        createdAt: new Date().toISOString(),
      }

      await addTurn(conv.id, turn)

      startJobPoll(conv.id, turnId, job.id)
        .then((images) => {
          if (images.length > 0 && prompt.trim()) {
            addFavorite({ id: `fav-${Date.now()}`, title: prompt.trim().slice(0, 30), prompt: prompt.trim(), category: '收藏' })
          }
        })
        .catch((err) => {
          const message = err.message || '生成失败，请重试'
          showError(message)
          updateTurn(conv.id, turnId, (turn) => ({ ...turn, status: 'error', error: message }))
        })
        .finally(() => setSubmittingConversationId((current) => current === conv.id ? null : current))
    } catch (err) {
      const message = err.message || '生成失败，请重试'
      showError(message)
      setSubmittingConversationId(null)
      if (conversationId) {
        await updateTurn(conversationId, turnId, (turn) => ({
          ...turn,
          status: 'error',
          error: message,
        }))
      }
    }
  }, [isConfigured, config, prompt, referenceImages, model, mode, aspectRatio, resolution, count, quality, ensureActiveConversation, addTurn, showError, activeId, addFavorite, updateTurn, startJobPoll, getLastConversationImage])

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

  const activeConversationTurns = conversations.find((c) => c.id === activeId)?.turns || []
  const activeConversationBusy = activeConversationTurns.some((turn) => turn.status === 'pending' && turn.jobId)
    || submittingConversationId === activeId
    || (activeId == null && submittingConversationId != null)
  const hasContextImage = Boolean(getLastConversationImage({ turns: activeConversationTurns }))
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
                            <p className="text-sm font-medium text-charcoal">{turn.prompt || '（空提示词）'}</p>
                            <p className="mt-1 text-[11px] text-stoneText">
                              {turn.model && `${turn.model} · `}{turn.size || turn.resolution || ''}
                            </p>
                          </div>
                          <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-medium ${
                            turn.status === 'success' ? 'bg-emerald-50 text-emerald-700' :
                            turn.status === 'error' ? 'bg-red-50 text-red-700' :
                            'bg-amber-50 text-amber-700'
                          }`}>
                            {turn.status === 'success' ? '已完成' : turn.status === 'error' ? '失败' : '生成中'}
                          </span>
                        </div>

                        {turn.status === 'pending' && (
                          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-amber-100">
                            <div
                              className="h-full rounded-full bg-champagne transition-all duration-500"
                              style={{ width: `${Math.max(5, Math.min(100, turn.progress || 5))}%` }}
                            />
                          </div>
                        )}

                        {turn.status === 'success' && turn.images.length > 0 && (
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
                          <p className="mt-2 text-xs text-red-700">{turn.error || '生成失败'}</p>
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
              isBusy={activeConversationBusy}
              model={model}
              models={models}
              mode={effectiveMode}
              onAspectRatioChange={setAspectRatio}
              onCountChange={setCount}
              onModelChange={setModel}
              onModeChange={setMode}
              onOpenPromptMarket={() => setPromptMarketOpen(true)}
              onPromptChange={setPrompt}
              onQualityChange={setQuality}
              onReferenceImagesChange={handleReferenceImagesChange}
              onResolutionChange={setResolution}
              onSubmit={handleSubmit}
              prompt={prompt}
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
          onClose={() => setSettingsOpen(false)}
          onRefreshModels={refreshModels}
          onUpdateConfig={updateConfig}
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
