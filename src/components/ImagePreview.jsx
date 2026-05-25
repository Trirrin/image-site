import { useEffect, useCallback } from 'react'
import { X, ChevronLeft, ChevronRight, Download, ExternalLink } from 'lucide-react'
import FallbackImage from './FallbackImage'
import { loadImageBlob } from '../storage/conversationStore'

export default function ImagePreview({ open, items, index, onClose, onIndexChange }) {
  useEffect(() => {
    if (!open) return
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') onIndexChange(Math.max(0, index - 1))
      else if (e.key === 'ArrowRight') onIndexChange(Math.min(items.length - 1, index + 1))
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, index, items.length, onClose, onIndexChange])

  const handleDownload = useCallback(async (item) => {
    const primaryUrl = item.image.url
    const fallbackUrl = item.image.sourceUrl || primaryUrl
    let url = primaryUrl
    let blobUrl = ''
    try {
      if (!primaryUrl && item.image.localImageId) {
        const blob = await loadImageBlob(item.image.localImageId)
        if (blob) {
          blobUrl = URL.createObjectURL(blob)
          url = blobUrl
        }
      } else {
        const res = await fetch(primaryUrl)
        if (!res.ok && fallbackUrl !== primaryUrl) throw new Error('primary image unavailable')
        if (res.ok) {
          const blob = await res.blob()
          blobUrl = URL.createObjectURL(blob)
          url = blobUrl
        }
      }
    } catch {
      url = fallbackUrl
    }
    const a = document.createElement('a')
    a.href = url
    const seg = fallbackUrl.split('?')[0].split('/').pop()
    a.download = (seg && seg.includes('.')) ? seg : `image-site-${item.image.id || Date.now()}.png`
    document.body.appendChild(a)
    a.click()
    a.remove()
    if (blobUrl) setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)
  }, [])
  if (!open || items.length === 0) return null

  const item = items[Math.max(0, Math.min(index, items.length - 1))]
  if (!item) return null

  return (
    <div className="fixed inset-0 z-50 bg-ink-base/90 backdrop-blur-md">
      <button
        aria-label="关闭"
        className="absolute right-s-5 top-s-5 z-10 grid h-10 w-10 place-items-center rounded-input bg-surface-01/80 text-ink-muted backdrop-blur transition hover:bg-surface-02 hover:text-ink-primary"
        onClick={onClose}
        type="button"
      >
        <X size={20} />
      </button>

      {item.turnPrompt && (
        <div className="absolute top-s-5 left-s-5 z-10 max-w-xs rounded-card border border-border-subtle bg-surface-glass px-s-4 py-s-3 backdrop-blur">
          <p className="line-clamp-2 text-sm text-ink-primary">{item.turnPrompt}</p>
          <p className="mt-s-1 font-mono text-xs text-ink-faint">
            {item.turnModel}{item.turnSize ? ` · ${item.turnSize}` : ''}
          </p>
        </div>
      )}

      <div className="flex h-full items-center justify-center">
        <FallbackImage
          alt={item.turnPrompt}
          className="max-h-[85vh] rounded-std border border-border-subtle object-contain"
          image={item.image}
        />
      </div>

      <div className="absolute bottom-0 left-0 right-0 border-t border-border-subtle bg-surface-glass px-s-5 py-s-3 backdrop-blur">
        <div className="flex items-center justify-between">
          <span className="rounded-pill bg-surface-03 px-s-3 py-s-1 text-xs text-ink-secondary">
            {index + 1} / {items.length}
          </span>

          <div className="flex items-center gap-s-2">
            <button
              aria-label="上一张"
              className="grid h-10 w-10 place-items-center rounded-input bg-surface-02 text-ink-secondary transition hover:bg-surface-03 disabled:opacity-30"
              disabled={index <= 0}
              onClick={() => onIndexChange(index - 1)}
              type="button"
            >
              <ChevronLeft size={20} />
            </button>
            <button
              aria-label="下一张"
              className="grid h-10 w-10 place-items-center rounded-input bg-surface-02 text-ink-secondary transition hover:bg-surface-03 disabled:opacity-30"
              disabled={index >= items.length - 1}
              onClick={() => onIndexChange(index + 1)}
              type="button"
            >
              <ChevronRight size={20} />
            </button>
          </div>

          <div className="flex items-center gap-s-2">
            <button
              aria-label="下载"
              className="grid h-10 w-10 place-items-center rounded-input bg-surface-02 text-ink-secondary transition hover:bg-surface-03"
              onClick={() => handleDownload(item)}
              type="button"
            >
              <Download size={18} />
            </button>
            <button
              aria-label="打开原图"
              className="grid h-10 w-10 place-items-center rounded-input bg-surface-02 text-ink-secondary transition hover:bg-surface-03"
              onClick={() => {
                const url = item.image.sourceUrl || item.image.url
                if (url) window.open(url, '_blank')
              }}
              type="button"
            >
              <ExternalLink size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}