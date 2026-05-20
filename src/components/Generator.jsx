import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import {
  ChevronDown, Sparkles, LoaderCircle, ArrowUp, X,
  SlidersHorizontal, ImagePlus, Store, WandSparkles,
} from 'lucide-react'
import Popover, { PopoverItem } from './Popover'
import {
  ASPECT_RATIOS, RESOLUTIONS, QUALITY_OPTIONS, IMAGE_COUNTS,
  MAX_REFERENCE_IMAGES,
} from '../utils/constants'
import { readFileAsDataURL, isImageFile } from '../utils/image'

const MODE_OPTIONS = [
  { value: 'generate', label: '生成' },
  { value: 'edit', label: '修改' },
]

export default function Generator({
  prompt, onPromptChange, onSubmit, isBusy,
  referenceImages, onReferenceImagesChange,
  models, model, onModelChange,
  mode, onModeChange,
  aspectRatio, onAspectRatioChange,
  resolution, onResolutionChange,
  count, onCountChange,
  quality, onQualityChange,
  ecomSkillAvailable = false, ecomSkillEnabled, onEcomSkillEnabledChange,
  optimizerModels = [], optimizerModel, onOptimizerModelChange,
  onOpenPromptMarket,
}) {
  const [dragOver, setDragOver] = useState(false)
  const [modelOpen, setModelOpen] = useState(false)
  const [ratioOpen, setRatioOpen] = useState(false)
  const [resOpen, setResOpen] = useState(false)
  const [countOpen, setCountOpen] = useState(false)
  const [qualOpen, setQualOpen] = useState(false)
  const [optimizerOpen, setOptimizerOpen] = useState(false)
  const textareaRef = useRef(null)
  const fileRef = useRef(null)

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    const maxH = Math.min(320, Math.max(72, Math.floor(window.innerHeight * 0.42)))
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 72), maxH)}px`
  }, [prompt])

  const modelLabel = useMemo(() =>
    models.find((m) => m.model_key === model)?.display_name || model || '选择模型',
    [models, model])

  const optimizerLabel = useMemo(() => {
    if (!ecomSkillAvailable) return '不可用'
    return optimizerModels.find((m) => m.model_key === optimizerModel)?.display_name || optimizerModel || '自动选择'
  }, [ecomSkillAvailable, optimizerModels, optimizerModel])

  const ratioLabel = useMemo(() =>
    ASPECT_RATIOS.find((r) => r.value === aspectRatio)?.label ?? 'Auto',
    [aspectRatio])

  const resLabel = useMemo(() =>
    RESOLUTIONS.find((r) => r.value === resolution)?.label ?? 'Auto',
    [resolution])

  const qualLabel = useMemo(() =>
    QUALITY_OPTIONS.find((q) => q.value === quality)?.label ?? 'High',
    [quality])

  const canSubmit = !isBusy && (prompt.trim().length > 0 || referenceImages.length > 0)

  const addImagesFromFiles = useCallback(async (files) => {
    const imageFiles = Array.from(files).filter(isImageFile)
    if (imageFiles.length === 0) return
    const remaining = Math.max(0, MAX_REFERENCE_IMAGES - referenceImages.length)
    const toProcess = imageFiles.slice(0, remaining)
    const added = []
    for (const file of toProcess) {
      const dataUrl = await readFileAsDataURL(file).catch(() => null)
      if (dataUrl) {
        added.push({ name: file.name, type: file.type || 'image/png', dataUrl, source: 'upload' })
      }
    }
    if (added.length) onReferenceImagesChange([...referenceImages, ...added])
  }, [referenceImages, onReferenceImagesChange])

  const addImagesFromUrls = useCallback(async (urls) => {
    const remaining = Math.max(0, MAX_REFERENCE_IMAGES - referenceImages.length)
    const toProcess = urls.slice(0, remaining)
    const added = []
    for (const url of toProcess) {
      try {
        const res = await fetch(url)
        if (!res.ok) continue
        const blob = await res.blob()
        if (!blob.type.startsWith('image/')) continue
        const dataUrl = await readFileAsDataURL(blob)
        const name = url.split('/').pop()?.split('?')[0] || 'image.png'
        added.push({ name, type: blob.type, dataUrl, source: 'url' })
      } catch { /* skip invalid urls */ }
    }
    if (added.length) onReferenceImagesChange([...referenceImages, ...added])
  }, [referenceImages, onReferenceImagesChange])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files.length > 0) addImagesFromFiles(e.dataTransfer.files)
  }, [addImagesFromFiles])

  const handlePaste = useCallback((e) => {
    const items = e.clipboardData?.items
    if (!items) return
    const files = []
    const textUrls = []
    for (const item of Array.from(items)) {
      if (item.kind === 'file') {
        const file = item.getAsFile()
        if (file && isImageFile(file)) files.push(file)
      } else if (item.kind === 'string') {
        item.getAsString((str) => {
          const trimmed = str.trim()
          if (/^https?:\/\/.+\.(avif|bmp|gif|heic|heif|jpe?g|png|svg|webp)/i.test(trimmed)) {
            textUrls.push(trimmed)
          }
        })
      }
    }
    if (files.length > 0) {
      e.preventDefault()
      addImagesFromFiles(files)
    } else if (textUrls.length > 0) {
      e.preventDefault()
      addImagesFromUrls(textUrls)
    }
  }, [addImagesFromFiles, addImagesFromUrls])

  const handleFileChange = (e) => {
    if (e.target.files?.length) addImagesFromFiles(e.target.files)
    e.target.value = ''
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      if (canSubmit) onSubmit()
    }
  }

  const removeImage = (idx) => {
    onReferenceImagesChange(referenceImages.filter((_, i) => i !== idx))
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 px-4 pb-5 sm:px-6">
      <div
        className={`pointer-events-auto mx-auto w-full max-w-6xl rounded-[1.9rem] border bg-white/92 p-2 shadow-float backdrop-blur transition ${
          dragOver ? 'border-champagne ring-2 ring-amberSoft' : 'border-borderSoft/70'
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onPaste={handlePaste}
      >
        {referenceImages.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 px-3 pb-2 pt-2">
            {referenceImages.map((img, idx) => (
              <div key={`${idx}-${img.name}`} className="group relative h-14 w-14 overflow-hidden rounded-xl border border-white bg-white shadow-sm">
                <img alt={img.name} className="h-full w-full object-cover" src={img.dataUrl} />
                {idx === 0 && (
                  <span className="absolute left-0.5 top-0.5 rounded-full bg-champagne px-1.5 py-0 text-[9px] font-medium text-white">主图</span>
                )}
                <button
                  aria-label="移除参考图"
                  className="absolute right-0.5 top-0.5 grid h-5 w-5 place-items-center rounded-full bg-charcoal/75 text-white opacity-0 transition group-hover:opacity-100"
                  onClick={() => removeImage(idx)}
                  type="button"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
            <span className="text-[11px] text-stoneText">
              {referenceImages.length}/{MAX_REFERENCE_IMAGES} · 第 1 张作为主参考
            </span>
          </div>
        )}

        <div className="rounded-[1.4rem] bg-pearl/85 p-3">
          <textarea
            ref={textareaRef}
            className="block w-full resize-none bg-transparent px-2 py-1 text-[15px] leading-7 text-charcoal outline-none placeholder:text-stoneText/80"
            onChange={(e) => onPromptChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="描述你想创作的画面，Enter 提交 / Shift+Enter 换行"
            rows={2}
            value={prompt}
          />

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <button
              aria-label="添加参考图"
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-3 text-xs font-medium text-charcoal shadow-sm transition hover:bg-muted"
              onClick={() => fileRef.current?.click()}
              type="button"
            >
              <ImagePlus size={13} />
              参考图
            </button>

            <button
              aria-label="灵感市场"
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-3 text-xs font-medium text-charcoal shadow-sm transition hover:bg-muted"
              onClick={onOpenPromptMarket}
              type="button"
            >
              <Store size={13} />
              灵感
            </button>

            <button
              aria-pressed={ecomSkillEnabled}
              className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${
                ecomSkillEnabled ? 'bg-charcoal text-white' : 'bg-white text-charcoal hover:bg-muted'
              }`}
              disabled={!ecomSkillAvailable}
              onClick={() => onEcomSkillEnabledChange(!ecomSkillEnabled)}
              title={ecomSkillAvailable ? '使用电商 Skill 优化提示词' : '上游没有匹配 gpt-x.x 的意图模型'}
              type="button"
            >
              <WandSparkles size={13} />
              电商 Skill
            </button>

            <div className="inline-flex h-9 overflow-hidden rounded-full bg-white p-0.5 text-xs font-medium text-charcoal shadow-sm">
              {MODE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  className={`rounded-full px-3 transition ${
                    mode === option.value ? 'bg-charcoal text-white' : 'text-stoneText hover:bg-muted'
                  }`}
                  onClick={() => onModeChange(option.value)}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>

            <span className="mx-1 hidden h-4 w-px bg-borderSoft sm:inline-block" />

            <Popover align="start" open={modelOpen} onClose={setModelOpen} side="top" trigger={
              <span className="inline-flex h-9 max-w-[200px] items-center gap-1.5 rounded-full bg-white px-3 text-xs font-medium text-charcoal shadow-sm transition hover:bg-muted">
                <Sparkles size={13} />
                <span className="truncate">{modelLabel}</span>
                <ChevronDown size={12} />
              </span>
            }>
              {models.length === 0 ? (
                <p className="px-3 py-2 text-xs text-stoneText">上游没有匹配 gpt-image* 的生图模型。</p>
              ) : (
                models.map((m) => (
                  <PopoverItem key={m.model_key} active={m.model_key === model} onSelect={() => { onModelChange(m.model_key); setModelOpen(false) }}>
                    <span className="truncate">{m.display_name || m.model_key}</span>
                  </PopoverItem>
                ))
              )}
            </Popover>

            {ecomSkillEnabled && (
              <Popover align="start" disabled={!ecomSkillAvailable} open={optimizerOpen} onClose={setOptimizerOpen} side="top" trigger={
                <span className="inline-flex h-9 max-w-[200px] items-center gap-1.5 rounded-full bg-white px-3 text-xs font-medium text-charcoal shadow-sm transition hover:bg-muted">
                  <WandSparkles size={13} />
                  <span className="truncate">意图 · {optimizerLabel}</span>
                  <ChevronDown size={12} />
                </span>
              }>
                <PopoverItem active={!optimizerModel} onSelect={() => { onOptimizerModelChange(''); setOptimizerOpen(false) }}>
                  <span>自动选择</span>
                </PopoverItem>
                {optimizerModels.map((m) => (
                  <PopoverItem key={m.model_key} active={m.model_key === optimizerModel} onSelect={() => { onOptimizerModelChange(m.model_key); setOptimizerOpen(false) }}>
                    <span className="truncate">{m.display_name || m.model_key}</span>
                  </PopoverItem>
                ))}
              </Popover>
            )}

            <Popover align="start" open={ratioOpen} onClose={setRatioOpen} side="top" trigger={
              <span className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-3 text-xs font-medium text-charcoal shadow-sm transition hover:bg-muted">
                比例 · {ratioLabel} <ChevronDown size={12} />
              </span>
            }>
              {ASPECT_RATIOS.map((r) => (
                <PopoverItem key={r.value || 'auto'} active={r.value === aspectRatio} onSelect={() => { onAspectRatioChange(r.value); setRatioOpen(false) }}>
                  <span>{r.label}</span>
                </PopoverItem>
              ))}
            </Popover>

            <Popover align="start" open={resOpen} onClose={setResOpen} side="top" trigger={
              <span className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-3 text-xs font-medium text-charcoal shadow-sm transition hover:bg-muted">
                分辨率 · {resLabel} <ChevronDown size={12} />
              </span>
            }>
              {RESOLUTIONS.map((r) => (
                <PopoverItem key={r.value} active={r.value === resolution} onSelect={() => { onResolutionChange(r.value); setResOpen(false) }}>
                  <span>{r.label}</span>
                </PopoverItem>
              ))}
            </Popover>

            <Popover align="start" open={countOpen} onClose={setCountOpen} side="top" trigger={
              <span className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-3 text-xs font-medium text-charcoal shadow-sm transition hover:bg-muted">
                数量 · {count} <ChevronDown size={12} />
              </span>
            }>
              {IMAGE_COUNTS.map((n) => (
                <PopoverItem key={n} active={n === count} onSelect={() => { onCountChange(n); setCountOpen(false) }}>
                  <span>{n} 张</span>
                </PopoverItem>
              ))}
            </Popover>

            <Popover align="start" open={qualOpen} onClose={setQualOpen} side="top" trigger={
              <span className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-3 text-xs font-medium text-charcoal shadow-sm transition hover:bg-muted">
                <SlidersHorizontal size={12} />{qualLabel}<ChevronDown size={12} />
              </span>
            }>
              {QUALITY_OPTIONS.map((q) => (
                <PopoverItem key={q.value} active={q.value === quality} onSelect={() => { onQualityChange(q.value); setQualOpen(false) }}>
                  <span className="flex flex-col gap-0.5 text-left">
                    <span className="font-medium">{q.label}</span>
                    <span className="text-[11px] text-stoneText">{q.description}</span>
                  </span>
                </PopoverItem>
              ))}
            </Popover>

            <div className="ml-auto flex items-center gap-2">
              {isBusy && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amberSoft px-3 py-1 text-xs font-medium text-champagne">
                  <LoaderCircle className="animate-spin" size={12} />
                  生成中
                </span>
              )}
              <button
                aria-label="发送"
                className="grid h-10 w-10 place-items-center rounded-full bg-champagne text-white shadow-button transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!canSubmit}
                onClick={onSubmit}
                type="button"
              >
                {isBusy ? <LoaderCircle className="animate-spin" size={16} /> : <ArrowUp size={16} />}
              </button>
            </div>
          </div>
        </div>

        <input
          accept="image/*"
          className="hidden"
          multiple
          onChange={handleFileChange}
          ref={fileRef}
          type="file"
        />
      </div>
    </div>
  )
}
