import { useState, useEffect, useMemo } from 'react'
import { Search, ChevronDown, GalleryHorizontalEnd, Trash2, Download, ExternalLink } from 'lucide-react'
import Popover, { PopoverItem } from './Popover'
import FallbackImage from './FallbackImage'
import { formatBytes, formatDimensions, truncatePrompt, formatDate, classifyOrientation, getImageMeta } from '../utils/image'

export default function Library({
  conversations, onPreview, onJumpToTurn, onDelete,
}) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('newest')
  const [orientation, setOrientation] = useState('all')
  const [sortOpen, setSortOpen] = useState(false)
  const [orientOpen, setOrientOpen] = useState(false)

  const allImages = useMemo(() => {
    const result = []
    for (const conv of conversations) {
      for (const turn of conv.turns || []) {
        if (turn.status !== 'success') continue
        for (const img of turn.images || []) {
          if (img.url) {
            result.push({
              image: img,
              conversationId: conv.id,
              conversationTitle: conv.title,
              turnId: turn.id,
              turnPrompt: turn.prompt,
              turnModel: turn.model,
              turnSize: turn.size,
              turnAspectRatio: turn.aspectRatio,
              turnCreatedAt: turn.createdAt,
            })
          }
        }
      }
    }
    return result
  }, [conversations])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    let items = allImages.filter((item) => {
      if (orientation !== 'all' && classifyOrientation(item.turnAspectRatio, item.turnSize) !== orientation) return false
      if (!q) return true
      return (
        item.turnPrompt.toLowerCase().includes(q) ||
        item.conversationTitle.toLowerCase().includes(q) ||
        item.turnModel.toLowerCase().includes(q)
      )
    })
    items.sort((a, b) => {
      const cmp = a.turnCreatedAt.localeCompare(b.turnCreatedAt)
      return sort === 'newest' ? -cmp : cmp
    })
    return items
  }, [allImages, query, orientation, sort])

  const totalCount = allImages.length
  const isEmpty = totalCount === 0
  const isNoMatch = !isEmpty && filtered.length === 0

  const sortLabel = sort === 'newest' ? '最新优先' : '最旧优先'
  const orientLabel = orientation === 'all' ? '全部方向' : orientation === 'landscape' ? '横图' : orientation === 'portrait' ? '竖图' : '方图'

  const handleDownload = async (item) => {
    const primaryUrl = item.image.url
    const fallbackUrl = item.image.sourceUrl || primaryUrl
    let url = primaryUrl
    let blobUrl = ''
    try {
      const res = await fetch(primaryUrl)
      if (!res.ok && fallbackUrl !== primaryUrl) throw new Error('primary image unavailable')
      if (res.ok) {
        const blob = await res.blob()
        blobUrl = URL.createObjectURL(blob)
        url = blobUrl
      }
    } catch {
      url = fallbackUrl
    }
    const a = document.createElement('a')
    a.href = url
    const filename = `image-site-${item.image.id || item.turnId || 'download'}.png`
    const seg = fallbackUrl.split('?')[0].split('/').pop()
    a.download = seg && seg.includes('.') ? seg : filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    if (blobUrl) setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)
  }
  return (
    <section className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-borderSoft/70 bg-surface/60 px-5 py-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-2xl bg-amberSoft text-champagne">
            <GalleryHorizontalEnd size={16} />
          </span>
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-champagne">My library</p>
            <h2 className="text-lg font-semibold tracking-tight text-charcoal">我的图库</h2>
          </div>
        </div>
        <span className="rounded-full bg-white/70 px-3 py-1 text-xs text-stoneText shadow-sm">
          共 {totalCount} 张 · 展示 {filtered.length}
        </span>
      </header>

      <div className="border-b border-borderSoft/60 bg-surface/40 px-5 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stoneText" size={15} />
            <input
              className="h-10 w-full rounded-full border border-borderSoft bg-white pl-10 pr-4 text-sm text-charcoal shadow-innerSoft outline-none transition placeholder:text-stoneText/80 focus:border-champagne focus:ring-4 focus:ring-amberSoft"
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索 prompt、对话标题、模型"
              value={query}
            />
          </div>

          <Popover align="end" open={sortOpen} onClose={setSortOpen} side="bottom" trigger={
            <span className="inline-flex h-10 items-center gap-2 rounded-full border border-borderSoft bg-white px-4 text-xs font-medium text-charcoal shadow-sm transition hover:bg-muted">
              排序 · {sortLabel} <ChevronDown size={12} />
            </span>
          }>
            <PopoverItem active={sort === 'newest'} onSelect={() => { setSort('newest'); setSortOpen(false) }}>最新优先</PopoverItem>
            <PopoverItem active={sort === 'oldest'} onSelect={() => { setSort('oldest'); setSortOpen(false) }}>最旧优先</PopoverItem>
          </Popover>

          <Popover align="end" open={orientOpen} onClose={setOrientOpen} side="bottom" trigger={
            <span className="inline-flex h-10 items-center gap-2 rounded-full border border-borderSoft bg-white px-4 text-xs font-medium text-charcoal shadow-sm transition hover:bg-muted">
              方向 · {orientLabel} <ChevronDown size={12} />
            </span>
          }>
            {['all', 'landscape', 'portrait', 'square'].map((v) => (
              <PopoverItem key={v} active={orientation === v} onSelect={() => { setOrientation(v); setOrientOpen(false) }}>
                {v === 'all' ? '全部方向' : v === 'landscape' ? '横图' : v === 'portrait' ? '竖图' : '方图'}
              </PopoverItem>
            ))}
          </Popover>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto bg-gradient-to-b from-pearl/40 via-transparent to-transparent pb-10 [scrollbar-width:thin]">
        {isEmpty ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center text-stoneText">
            <div className="grid h-14 w-14 place-items-center rounded-[1.6rem] bg-white/80 text-champagne shadow-warm">
              <GalleryHorizontalEnd size={22} />
            </div>
            <div>
              <p className="text-base font-semibold text-charcoal">还没有生成记录</p>
              <p className="mt-1 max-w-sm text-sm leading-6">完成第一次创作后，所有生成图片会自动聚合到这里。</p>
            </div>
          </div>
        ) : isNoMatch ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-stoneText">
            没有匹配的图片，试试换一个关键词。
          </div>
        ) : (
          <div className="mx-auto max-w-7xl px-5 py-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {filtered.map((item, idx) => (
                <ImageCard
                  key={`${item.turnId}-${item.image.id}`}
                  item={item}
                  onDelete={() => onDelete(item)}
                  onDownload={() => handleDownload(item)}
                  onJump={() => onJumpToTurn(item.conversationId, item.turnId)}
                  onPreview={() => onPreview(filtered, idx)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

function ImageCard({ item, onPreview, onDelete, onDownload, onJump }) {
  const [meta, setMeta] = useState({})
  const [metaLoaded, setMetaLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    getImageMeta(item.image.url).then((m) => {
      if (!cancelled) { setMeta(m); setMetaLoaded(true) }
    })
    return () => { cancelled = true }
  }, [item.image.url])

  const dim = metaLoaded ? formatDimensions(meta.width, meta.height) : (item.turnSize || item.turnAspectRatio || '')
  const size = meta.size ? formatBytes(meta.size) : ''
  const fmt = metaLoaded && meta.format ? meta.format.toUpperCase() : ''
  const time = formatDate(item.turnCreatedAt)
  const info = [time, dim, size, fmt].filter(Boolean).join(' · ')

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-[1.2rem] border border-borderSoft/70 bg-white shadow-soft transition hover:-translate-y-0.5 hover:shadow-warm">
      <button className="relative block aspect-square w-full overflow-hidden bg-muted" onClick={onPreview} type="button">
        <FallbackImage
          alt={item.turnPrompt}
          className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
          image={item.image}
          loading="lazy"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-black/0 to-transparent opacity-0 transition group-hover:opacity-100" />
        {fmt && (
          <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-charcoal/75 px-2 py-0.5 text-[9px] font-semibold tracking-wider text-white opacity-0 transition group-hover:opacity-100">
            IMAGE {fmt}
          </span>
        )}
        <span className="pointer-events-none absolute bottom-2 left-2 right-2 line-clamp-2 text-left text-[11px] leading-4 text-white opacity-0 transition group-hover:opacity-100">
          {truncatePrompt(item.turnPrompt, 60)}
        </span>
      </button>

      <div className="flex items-center justify-between gap-1 px-2.5 py-2">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-medium text-charcoal">{item.conversationTitle || '新对话'}</p>
          <p className="truncate text-[10px] text-stoneText">{info}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            aria-label="下载"
            className="grid h-7 w-7 place-items-center rounded-full border border-borderSoft bg-white text-stoneText transition hover:bg-muted hover:text-charcoal"
            onClick={onDownload}
            type="button"
          >
            <Download size={11} />
          </button>
          <button
            aria-label="跳到来源对话"
            className="grid h-7 w-7 place-items-center rounded-full border border-borderSoft bg-white text-stoneText transition hover:bg-muted hover:text-charcoal"
            onClick={onJump}
            type="button"
          >
            <ExternalLink size={11} />
          </button>
          <button
            aria-label="删除"
            className="grid h-7 w-7 place-items-center rounded-full border border-borderSoft bg-white text-stoneText transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500"
            onClick={onDelete}
            type="button"
          >
            <Trash2 size={11} />
          </button>
        </div>
      </div>
    </article>
  )
}
