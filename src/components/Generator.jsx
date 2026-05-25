import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import {
  ChevronDown, Sparkles, LoaderCircle, ArrowUp, X,
  ImagePlus,
} from 'lucide-react'
import Popover, { PopoverItem } from './Popover'
import {
  ASPECT_RATIOS, RESOLUTIONS, QUALITY_OPTIONS, IMAGE_COUNTS,
  MAX_REFERENCE_IMAGES, MAX_REFERENCE_IMAGE_BYTES, MAX_REFERENCE_IMAGE_TOTAL_BYTES,
} from '../utils/constants'
import { readFileAsDataURL, isImageFile, formatBytes, referenceImageByteSize, dataUrlByteSize } from '../utils/image'

export default function Generator({
  prompt, onPromptChange, onSubmit, isBusy,
  referenceImages, onReferenceImagesChange,
  previousImages = [], selectedPreviousImageIds = [], onTogglePreviousImage,
  models, model, onModelChange,
  aspectRatio, onAspectRatioChange,
  resolution, onResolutionChange,
  count, onCountChange,
  quality, onQualityChange,
  onOpenPromptMarket,
  onReferenceImageError,
}) {
  const [dragOver, setDragOver] = useState(false)
  const [modelOpen, setModelOpen] = useState(false)
  const [ratioOpen, setRatioOpen] = useState(false)
  const [resOpen, setResOpen] = useState(false)
  const [countOpen, setCountOpen] = useState(false)
  const [qualOpen, setQualOpen] = useState(false)
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

  const ratioLabel = useMemo(() =>
    ASPECT_RATIOS.find((r) => r.value === aspectRatio)?.label ?? '自动',
    [aspectRatio])

  const resLabel = useMemo(() =>
    RESOLUTIONS.find((r) => r.value === resolution)?.label ?? '自动',
    [resolution])

  const qualLabel = useMemo(() =>
    QUALITY_OPTIONS.find((q) => q.value === quality)?.label ?? '高',
    [quality])

  const selectedPreviousCount = selectedPreviousImageIds.length
  const canSubmit = !isBusy && (prompt.trim().length > 0 || referenceImages.length > 0 || selectedPreviousCount > 0)
  const currentReferenceBytes = useMemo(
    () => referenceImages.reduce((sum, image) => sum + referenceImageByteSize(image), 0),
    [referenceImages]
  )

  const reportReferenceLimit = useCallback((reason) => {
    onReferenceImageError?.(reason)
  }, [onReferenceImageError])

  const addImagesFromFiles = useCallback(async (files) => {
    const imageFiles = Array.from(files).filter(isImageFile)
    if (imageFiles.length === 0) return
    const remaining = Math.max(0, MAX_REFERENCE_IMAGES - referenceImages.length)
    const toProcess = imageFiles.slice(0, remaining)
    const added = []
    let totalBytes = currentReferenceBytes
    let skipped = 0
    for (const file of toProcess) {
      if (file.size > MAX_REFERENCE_IMAGE_BYTES || totalBytes + file.size > MAX_REFERENCE_IMAGE_TOTAL_BYTES) {
        skipped += 1
        continue
      }
      const dataUrl = await readFileAsDataURL(file).catch(() => null)
      const byteSize = file.size || dataUrlByteSize(dataUrl)
      if (!dataUrl || byteSize > MAX_REFERENCE_IMAGE_BYTES || totalBytes + byteSize > MAX_REFERENCE_IMAGE_TOTAL_BYTES) {
        skipped += 1
        continue
      }
      totalBytes += byteSize
      added.push({ name: file.name, type: file.type || 'image/png', dataUrl, source: 'upload', byteSize })
    }
    if (skipped > 0) reportReferenceLimit(`参考图过大，单张最多 ${formatBytes(MAX_REFERENCE_IMAGE_BYTES)}，总计最多 ${formatBytes(MAX_REFERENCE_IMAGE_TOTAL_BYTES)}`)
    if (added.length) onReferenceImagesChange([...referenceImages, ...added])
  }, [currentReferenceBytes, referenceImages, onReferenceImagesChange, reportReferenceLimit])

  const addImagesFromUrls = useCallback(async (urls) => {
    const remaining = Math.max(0, MAX_REFERENCE_IMAGES - referenceImages.length)
    const toProcess = urls.slice(0, remaining)
    const added = []
    let totalBytes = currentReferenceBytes
    let skipped = 0
    for (const url of toProcess) {
      try {
        const res = await fetch(url)
        if (!res.ok) continue
        const length = Number(res.headers.get('Content-Length') || 0)
        if (length > MAX_REFERENCE_IMAGE_BYTES || totalBytes + length > MAX_REFERENCE_IMAGE_TOTAL_BYTES) {
          skipped += 1
          continue
        }
        const blob = await res.blob()
        if (!blob.type.startsWith('image/')) continue
        if (blob.size > MAX_REFERENCE_IMAGE_BYTES || totalBytes + blob.size > MAX_REFERENCE_IMAGE_TOTAL_BYTES) {
          skipped += 1
          continue
        }
        const dataUrl = await readFileAsDataURL(blob)
        const byteSize = blob.size || dataUrlByteSize(dataUrl)
        if (!dataUrl || byteSize > MAX_REFERENCE_IMAGE_BYTES || totalBytes + byteSize > MAX_REFERENCE_IMAGE_TOTAL_BYTES) {
          skipped += 1
          continue
        }
        totalBytes += byteSize
        const name = url.split('/').pop()?.split('?')[0] || '图片.png'
        added.push({ name, type: blob.type, dataUrl, source: 'url', byteSize })
      } catch { /* skip invalid urls */ }
    }
    if (skipped > 0) reportReferenceLimit(`参考图过大，单张最多 ${formatBytes(MAX_REFERENCE_IMAGE_BYTES)}，总计最多 ${formatBytes(MAX_REFERENCE_IMAGE_TOTAL_BYTES)}`)
    if (added.length) onReferenceImagesChange([...referenceImages, ...added])
  }, [currentReferenceBytes, referenceImages, onReferenceImagesChange, reportReferenceLimit])

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

  const pillBase = 'rounded-pill border px-s-3 py-s-1 text-xs font-medium transition'
  const pillOff = 'border-border-subtle bg-surface-02 text-ink-secondary hover:border-border-strong hover:text-ink-primary'
  const pillOn = 'border-accent bg-accent/10 text-accent'

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 px-4 pb-5 sm:px-6">
      <div
        className={`pointer-events-auto mx-auto w-full max-w-6xl rounded-card border bg-surface-01/92 p-2 shadow-glass backdrop-blur transition ${
          dragOver ? 'border-accent ring-2 ring-accent' : 'border-border-subtle'
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onPaste={handlePaste}
      >
        {previousImages.length > 0 && (
          <div className="px-3 pb-2 pt-1">
            <div className="mb-2 flex items-center justify-between">
              <p className="font-mono text-xs uppercase text-ink-faint">上一轮图片</p>
              <span className="text-[11px] text-ink-muted">{selectedPreviousCount}/{previousImages.length}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {previousImages.map((img, idx) => {
                const selected = selectedPreviousImageIds.includes(img.id)
                return (
                  <button
                    key={img.id || `previous-${idx}`}
                    aria-pressed={selected}
                    className={`group relative h-16 w-16 overflow-hidden rounded-input border transition ${
                      selected ? 'border-accent ring-2 ring-accent' : 'border-border-subtle hover:border-accent/60'
                    }`}
                    onClick={() => onTogglePreviousImage?.(img.id)}
                    type="button"
                  >
                    <img alt={`上一轮图片 ${idx + 1}`} className="h-full w-full object-cover" src={img.sourceUrl || img.url} />
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {referenceImages.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 px-3 pb-2">
            {referenceImages.map((img, idx) => (
              <div key={`${idx}-${img.name}`} className="group relative h-14 w-14 overflow-hidden rounded-std">
                <img alt={img.name} className="h-full w-full object-cover" src={img.dataUrl} />
                <div className="absolute inset-0 bg-ink-base/0 transition group-hover:bg-ink-base/40" />
                <button
                  aria-label="移除参考图"
                  className="absolute right-0.5 top-0.5 grid h-5 w-5 place-items-center rounded-full bg-danger/80 text-white opacity-0 transition group-hover:opacity-100"
                  onClick={() => removeImage(idx)}
                  type="button"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
            <span className="text-[11px] text-ink-muted">
              {referenceImages.length}/{MAX_REFERENCE_IMAGES}
            </span>
          </div>
        )}

        {(previousImages.length > 0 || referenceImages.length > 0) && (
          <div className="mx-3 border-t border-border-subtle" />
        )}

        <div className="flex items-end gap-2 px-3 py-2">
          <div className="flex shrink-0 flex-col items-center gap-1.5 pb-0.5">
            <button
              aria-label="添加参考图"
              className="grid h-9 w-9 place-items-center rounded-input text-ink-muted transition hover:bg-surface-02 hover:text-ink-primary"
              onClick={() => fileRef.current?.click()}
              type="button"
            >
              <ImagePlus size={16} />
            </button>
            <button
              aria-label="灵感市场"
              className="grid h-9 w-9 place-items-center rounded-input text-ink-muted transition hover:bg-surface-02 hover:text-ink-primary"
              onClick={onOpenPromptMarket}
              type="button"
            >
              <Sparkles size={16} />
            </button>
          </div>

          <textarea
            ref={textareaRef}
            className="flex-1 min-w-0 resize-none bg-transparent px-2 py-1 text-[15px] leading-7 text-ink-primary outline-none placeholder:text-ink-faint"
            onChange={(e) => onPromptChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="描述你想创作的画面，回车提交 / 上档键+回车换行"
            rows={2}
            value={prompt}
          />

          <button
            aria-label="发送"
            className="mb-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-input bg-accent text-ink-base-l transition hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canSubmit}
            onClick={onSubmit}
            type="button"
          >
            {isBusy ? <LoaderCircle className="animate-spin" size={16} /> : <ArrowUp size={16} />}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 border-t border-border-subtle/60 px-3 pb-2 pt-1.5">
          <Popover align="start" open={modelOpen} onClose={setModelOpen} side="top" trigger={
            <span className={`${pillBase} ${modelOpen ? pillOn : pillOff}`}>
              <span className="max-w-[120px] inline-block truncate align-bottom">{modelLabel}</span> <ChevronDown size={12} className="inline" />
            </span>
          }>
            {models.length === 0 ? (
              <p className="px-3 py-2 text-xs text-ink-muted">上游没有匹配 gpt-image* 的生图模型。</p>
            ) : (
              models.map((m) => (
                <PopoverItem key={m.model_key} active={m.model_key === model} onSelect={() => { onModelChange(m.model_key); setModelOpen(false) }}>
                  <span className="truncate">{m.display_name || m.model_key}</span>
                </PopoverItem>
              ))
            )}
          </Popover>

          <Popover align="start" open={ratioOpen} onClose={setRatioOpen} side="top" trigger={
            <span className={`${pillBase} ${ratioOpen ? pillOn : pillOff}`}>
              比例 · {ratioLabel} <ChevronDown size={12} className="inline" />
            </span>
          }>
            {ASPECT_RATIOS.map((r) => (
              <PopoverItem key={r.value || 'auto'} active={r.value === aspectRatio} onSelect={() => { onAspectRatioChange(r.value); setRatioOpen(false) }}>
                <span>{r.label}</span>
              </PopoverItem>
            ))}
          </Popover>

          <Popover align="start" open={resOpen} onClose={setResOpen} side="top" trigger={
            <span className={`${pillBase} ${resOpen ? pillOn : pillOff}`}>
              {resLabel} <ChevronDown size={12} className="inline" />
            </span>
          }>
            {RESOLUTIONS.map((r) => (
              <PopoverItem key={r.value} active={r.value === resolution} onSelect={() => { onResolutionChange(r.value); setResOpen(false) }}>
                <span>{r.label}</span>
              </PopoverItem>
            ))}
          </Popover>

          <Popover align="start" open={countOpen} onClose={setCountOpen} side="top" trigger={
            <span className={`${pillBase} ${countOpen ? pillOn : pillOff}`}>
              {count}张 <ChevronDown size={12} className="inline" />
            </span>
          }>
            {IMAGE_COUNTS.map((n) => (
              <PopoverItem key={n} active={n === count} onSelect={() => { onCountChange(n); setCountOpen(false) }}>
                <span>{n} 张</span>
              </PopoverItem>
            ))}
          </Popover>

          <Popover align="start" open={qualOpen} onClose={setQualOpen} side="top" trigger={
            <span className={`${pillBase} ${qualOpen ? pillOn : pillOff}`}>
              {qualLabel} <ChevronDown size={12} className="inline" />
            </span>
          }>
            {QUALITY_OPTIONS.map((q) => (
              <PopoverItem key={q.value} active={q.value === quality} onSelect={() => { onQualityChange(q.value); setQualOpen(false) }}>
                <span className="flex flex-col gap-0.5 text-left">
                  <span className="font-medium">{q.label}</span>
                  <span className="text-[11px] text-ink-muted">{q.description}</span>
                </span>
              </PopoverItem>
            ))}
          </Popover>
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