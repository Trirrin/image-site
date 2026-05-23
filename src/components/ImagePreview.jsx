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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/85 backdrop-blur">
      <button
        aria-label="关闭"
        className="absolute right-6 top-6 grid h-10 w-10 place-items-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
        onClick={onClose}
        type="button"
      >
        <X size={20} />
      </button>

      <div className="flex items-center gap-4 max-w-[92vw] max-h-[92vh]">
        {index > 0 && (
          <button
            aria-label="上一张"
            className="grid h-12 w-12 place-items-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
            onClick={() => onIndexChange(index - 1)}
            type="button"
          >
            <ChevronLeft size={24} />
          </button>
        )}

        <div className="relative max-h-[88vh] max-w-[85%]">
          <FallbackImage
            alt={item.turnPrompt}
            className="max-h-[88vh] max-w-full rounded-[1.25rem] object-contain shadow-float"
            image={item.image}
          />
          <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-3">
            <div className="max-w-[85%]">
              <p className="rounded-2xl bg-charcoal/60 px-4 py-2 text-sm font-medium text-white/85 backdrop-blur line-clamp-3">
                {item.turnPrompt}
              </p>
              <p className="mt-1 rounded-xl bg-charcoal/60 px-3 py-1 text-xs text-white/70 backdrop-blur inline-block">
                {item.turnModel} {item.turnSize ? `· ${item.turnSize}` : ''}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                aria-label="下载"
                className="grid h-10 w-10 place-items-center rounded-full bg-white/20 text-white transition hover:bg-white/45"
                onClick={() => handleDownload(item)}
                type="button"
              >
                <Download size={18} />
              </button>
              <button
                aria-label="打开原图"
                className="grid h-10 w-10 place-items-center rounded-full bg-white/20 text-white transition hover:bg-white/45"
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

        {index < items.length - 1 && (
          <button
            aria-label="下一张"
            className="grid h-12 w-12 place-items-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
            onClick={() => onIndexChange(index + 1)}
            type="button"
          >
            <ChevronRight size={24} />
          </button>
        )}
      </div>

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-white/20 px-4 py-1.5 text-sm text-white/80 backdrop-blur">
        {index + 1} / {items.length}
      </div>
    </div>
  )
}
