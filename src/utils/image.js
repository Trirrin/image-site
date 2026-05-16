import { SIZE_MAP } from './constants'

export function getSize(aspectRatio, resolution) {
  if (resolution === 'auto') return ''
  const ratio = aspectRatio || '1:1'
  return SIZE_MAP[ratio]?.[resolution] ?? ''
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || !bytes || bytes <= 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

export function formatDimensions(w, h) {
  if (!w || !h) return ''
  return `${w}×${h}`
}

export function getFormatFromUrl(url, contentType) {
  if (contentType) {
    const m = contentType.match(/image\/([a-z0-9]+)/i)
    if (m) {
      const t = m[1].toLowerCase()
      return t === 'jpeg' ? 'jpg' : t
    }
  }
  const ext = url.split('?')[0].split('#')[0].split('.').pop()?.toLowerCase()
  return !ext || ext.length > 5 ? 'image' : ext === 'jpeg' ? 'jpg' : ext
}

function canProbeImageHeaders(url) {
  return typeof url === 'string' && !url.startsWith('blob:') && !url.startsWith('data:')
}

function loadImageMeta(url, fileSize, format) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve({
      width: img.naturalWidth,
      height: img.naturalHeight,
      size: Number.isFinite(fileSize) ? fileSize : undefined,
      format,
    })
    img.onerror = () => resolve({ size: Number.isFinite(fileSize) ? fileSize : undefined, format })
    img.src = url
  })
}

export async function getImageMeta(url) {
  if (!url) return {}

  try {
    if (!canProbeImageHeaders(url)) return loadImageMeta(url, undefined, getFormatFromUrl(url))

    const fetchRes = await fetch(url, { method: 'HEAD' })
    const contentType = fetchRes.ok ? (fetchRes.headers.get('Content-Type') ?? undefined) : undefined
    const cl = fetchRes.ok ? fetchRes.headers.get('Content-Length') : null
    const fileSize = cl ? Number(cl) : undefined
    const format = getFormatFromUrl(url, contentType)

    return loadImageMeta(url, fileSize, format)
  } catch {
    return loadImageMeta(url, undefined, getFormatFromUrl(url))
  }
}

export function truncatePrompt(prompt, max = 60) {
  const clean = prompt?.trim().replace(/\s+/g, ' ') || ''
  return clean.length <= max ? clean || '（无提示词）' : `${clean.slice(0, max)}…`
}

export function formatDate(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
    hour12: false,
  }).format(d)
}

export function classifyOrientation(aspectRatio, size) {
  const s = size || aspectRatio
  if (!s) return 'all'
  const m = s.match(/^(\d+)(?::|x)(\d+)$/)
  if (!m) return 'all'
  const w = Number(m[1]), h = Number(m[2])
  if (!Number.isFinite(w) || !Number.isFinite(h) || w === 0 || h === 0) return 'all'
  if (w === h) return 'square'
  return w > h ? 'landscape' : 'portrait'
}

export function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(reader.error ?? new Error('read file failed'))
    reader.readAsDataURL(file)
  })
}

export function isImageFile(file) {
  return file.type.startsWith('image/') || /\.(avif|bmp|gif|heic|heif|jpeg|jpg|png|svg|webp)$/i.test(file.name)
}
