import { useState, useEffect, useMemo } from 'react'
import { ArrowDownUp, Check, Search, Download, Trash2, ExternalLink, Image } from 'lucide-react'
import ViewToggle from './ViewToggle'
import Popover, { PopoverItem } from './Popover'
import StatusChip from './StatusChip'
import FallbackImage from './FallbackImage'
import { loadImageBlob } from '../storage/conversationStore'
import { formatBytes, formatDimensions, truncatePrompt, formatDate, classifyOrientation, getImageMeta } from '../utils/image'

const LIBRARY_PAGE_SIZE = 60

const ORIENTATIONS = [
  { key: null, label: '全部' },
  { key: 'landscape', label: '横版' },
  { key: 'portrait', label: '竖版' },
  { key: 'square', label: '方形' },
]

export default function Library({
  conversations, onPreview, onJumpToTurn, onDelete,
}) {
  const [query, setQuery] = useState('')
  const [sortBy, setSortBy] = useState('newest')
  const [orientationFilter, setOrientationFilter] = useState(null)
  const [viewMode, setViewMode] = useState('grid')
  const [sortOpen, setSortOpen] = useState(false)
  const [visibleCount, setVisibleCount] = useState(LIBRARY_PAGE_SIZE)

  const allImages = useMemo(() => {
    const result = []
    for (const conv of conversations) {
      for (const turn of conv.turns || []) {
        if (turn.status !== 'success') continue
        for (const img of turn.images || []) {
          if (img.url || img.localImageId) {
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
      if (orientationFilter && classifyOrientation(item.turnAspectRatio, item.turnSize) !== orientationFilter) return false
      if (!q) return true
      return (
        item.turnPrompt.toLowerCase().includes(q) ||
        item.conversationTitle.toLowerCase().includes(q) ||
        item.turnModel.toLowerCase().includes(q)
      )
    })
    items.sort((a, b) => {
      const cmp = a.turnCreatedAt.localeCompare(b.turnCreatedAt)
      return sortBy === 'newest' ? -cmp : cmp
    })
    return items
  }, [allImages, query, orientationFilter, sortBy])

  const effectiveVisibleCount = Math.min(visibleCount, Math.max(filtered.length, LIBRARY_PAGE_SIZE))
  const visibleItems = useMemo(() => filtered.slice(0, effectiveVisibleCount), [filtered, effectiveVisibleCount])
  const totalCount = allImages.length
  const isEmpty = totalCount === 0
  const isNoMatch = !isEmpty && filtered.length === 0
  const hasMore = visibleItems.length < filtered.length

  const sortLabel = sortBy === 'newest' ? '最新优先' : '最旧优先'

  const handleDownload = async (item) => {
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
        if (!res.ok && fallbackUrl !== primaryUrl) throw new Error('主图不可用')
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
    const filename = `图片-${item.image.id || item.turnId || 'download'}.png`
    const seg = fallbackUrl.split('?')[0].split('/').pop()
    a.download = seg && seg.includes('.') ? seg : filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    if (blobUrl) setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)
  }

  return (
    <section className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b border-border-subtle bg-surface-02/60 px-5 py-3 backdrop-blur">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" size={15} />
          <input
            className="h-9 w-full rounded-input border border-border-subtle bg-surface-01 pl-9 pr-4 text-sm text-ink-primary outline-none transition placeholder:text-ink-faint focus:border-accent focus:ring-2 focus:ring-accent/20"
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索提示词、对话标题、模型…"
            value={query}
          />
        </div>
        <ViewToggle value={viewMode} onChange={setViewMode} />
        <Popover align="end" open={sortOpen} onClose={setSortOpen} side="bottom" trigger={
          <button
            type="button"
            className="inline-flex h-9 items-center gap-2 rounded-input border border-border-subtle bg-surface-01 px-3 text-xs font-medium text-ink-secondary transition hover:bg-surface-02 hover:text-ink-primary"
            onClick={() => setSortOpen((v) => !v)}
          >
            <ArrowDownUp size={13} />
            {sortLabel}
          </button>
        }>
          <PopoverItem active={sortBy === 'newest'} onSelect={() => { setSortBy('newest'); setSortOpen(false) }}>最新优先</PopoverItem>
          <PopoverItem active={sortBy === 'oldest'} onSelect={() => { setSortBy('oldest'); setSortOpen(false) }}>最旧优先</PopoverItem>
        </Popover>
        <span className="shrink-0 rounded-pill bg-surface-03 px-3 py-1 text-xs text-ink-secondary shadow-sm">
          共 {totalCount} 张 · 展示 {filtered.length}
        </span>
      </header>

      <div className="flex items-center gap-2 border-b border-border-subtle/60 bg-surface-01/40 px-5 py-2.5">
        {ORIENTATIONS.map(({ key, label }) => {
          const active = orientationFilter === key
          return (
            <button
              key={label}
              type="button"
              onClick={() => setOrientationFilter(key)}
              className={`inline-flex items-center gap-1.5 rounded-pill border px-3 py-1 text-xs font-medium transition ${
                active
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border-subtle bg-surface-01 text-ink-muted hover:border-border-strong hover:text-ink-secondary'
              }`}
            >
              {active && <Check size={11} />}
              {label}
            </button>
          )
        })}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto bg-ink-base pb-10 [scrollbar-width:thin]">
        {isEmpty ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center text-ink-muted">
            <div className="grid h-14 w-14 place-items-center rounded-card bg-surface-03 text-accent shadow-lift">
              <Image size={22} />
            </div>
            <div>
              <p className="text-base font-semibold text-ink-primary">暂无图片</p>
              <p className="mt-1 max-w-sm text-sm leading-6 text-ink-muted">生成图片后会在这里显示</p>
            </div>
          </div>
        ) : isNoMatch ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-ink-muted">
            没有匹配的图片，试试换一个关键词。
          </div>
        ) : viewMode === 'grid' ? (
          <div className="mx-auto max-w-7xl px-5 py-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {visibleItems.map((item, idx) => (
                <GridCard
                  key={`${item.turnId}-${item.image.id}`}
                  item={item}
                  onDelete={() => onDelete(item)}
                  onDownload={() => handleDownload(item)}
                  onJump={() => onJumpToTurn(item.conversationId, item.turnId)}
                  onPreview={() => onPreview(filtered, idx)}
                />
              ))}
            </div>
            {hasMore && (
              <div className="mt-5 flex justify-center">
                <button
                  className="inline-flex h-10 items-center rounded-pill border border-border-subtle bg-surface-02 px-5 text-sm font-medium text-ink-secondary shadow-sm transition hover:bg-surface-03"
                  onClick={() => setVisibleCount((c) => Math.min(c + LIBRARY_PAGE_SIZE, filtered.length))}
                  type="button"
                >
                  加载更多
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="mx-auto max-w-7xl px-5 py-5">
            <TableHeader />
            {visibleItems.map((item, idx) => (
              <TableRow
                key={`${item.turnId}-${item.image.id}`}
                item={item}
                onDelete={() => onDelete(item)}
                onDownload={() => handleDownload(item)}
                onJump={() => onJumpToTurn(item.conversationId, item.turnId)}
                onPreview={() => onPreview(filtered, idx)}
              />
            ))}
            {hasMore && (
              <div className="mt-5 flex justify-center">
                <button
                  className="inline-flex h-10 items-center rounded-pill border border-border-subtle bg-surface-02 px-5 text-sm font-medium text-ink-secondary shadow-sm transition hover:bg-surface-03"
                  onClick={() => setVisibleCount((c) => Math.min(c + LIBRARY_PAGE_SIZE, filtered.length))}
                  type="button"
                >
                  加载更多
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

function GridCard({ item, onPreview, onDelete, onDownload, onJump }) {
  const [meta, setMeta] = useState({})
  const [metaLoaded, setMetaLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    getImageMeta(item.image.url || item.image.sourceUrl).then((m) => {
      if (!cancelled) { setMeta(m); setMetaLoaded(true) }
    })
    return () => { cancelled = true }
  }, [item.image.sourceUrl, item.image.url])

  const dim = metaLoaded ? formatDimensions(meta.width, meta.height) : (item.turnSize || item.turnAspectRatio || '')
  const size = meta.size ? formatBytes(meta.size) : ''
  const fmt = metaLoaded && meta.format ? meta.format.toUpperCase() : ''
  const time = formatDate(item.turnCreatedAt)
  const info = [time, dim, size].filter(Boolean).join(' · ')

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-card border border-border-subtle bg-surface-01 transition hover:border-border-strong hover:bg-surface-02">
      <button className="relative block aspect-square w-full overflow-hidden bg-surface-02" onClick={onPreview} type="button">
        <FallbackImage
          alt={item.turnPrompt}
          className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
          image={item.image}
          loading="lazy"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-black/0 to-transparent opacity-0 transition group-hover:opacity-100" />
        <span className="pointer-events-none absolute bottom-2 left-2 right-2 line-clamp-2 text-left text-[11px] leading-4 text-white opacity-0 transition group-hover:opacity-100">
          {truncatePrompt(item.turnPrompt, 60)}
        </span>
      </button>

      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-medium text-ink-primary">{item.conversationTitle || '新对话'}</p>
          <p className="truncate text-[10px] text-ink-muted">{info}</p>
        </div>
        {fmt && <StatusChip status="ok" label={fmt} className="shrink-0 !text-[9px] !px-1.5 !py-0" />}
      </div>

      <div className="flex items-center justify-end gap-1 border-t border-border-hair px-2 py-1.5">
        <button
          aria-label="下载"
          className="grid h-7 w-7 place-items-center rounded-input text-ink-muted transition hover:bg-surface-03 hover:text-ink-primary"
          onClick={onDownload}
          type="button"
        >
          <Download size={13} />
        </button>
        <button
          aria-label="跳到来源对话"
          className="grid h-7 w-7 place-items-center rounded-input text-ink-muted transition hover:bg-surface-03 hover:text-ink-primary"
          onClick={onJump}
          type="button"
        >
          <ExternalLink size={13} />
        </button>
        <button
          aria-label="删除"
          className="grid h-7 w-7 place-items-center rounded-input text-ink-muted transition hover:bg-danger/15 hover:text-danger"
          onClick={onDelete}
          type="button"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </article>
  )
}

function TableHeader() {
  const cols = ['缩略图', '提示词', '模型', '尺寸', '日期', '操作']
  return (
    <div className="grid grid-cols-[3.5rem_1fr_6rem_5rem_6.5rem_7rem] gap-2 border-b border-border-subtle px-2 py-2 font-mono text-xs uppercase text-ink-faint">
      {cols.map((c) => (
        <span key={c}>{c}</span>
      ))}
    </div>
  )
}

function TableRow({ item, onPreview, onDelete, onDownload, onJump }) {
  const [meta, setMeta] = useState({})
  const [metaLoaded, setMetaLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    getImageMeta(item.image.url || item.image.sourceUrl).then((m) => {
      if (!cancelled) { setMeta(m); setMetaLoaded(true) }
    })
    return () => { cancelled = true }
  }, [item.image.sourceUrl, item.image.url])

  const dim = metaLoaded ? formatDimensions(meta.width, meta.height) : (item.turnSize || item.turnAspectRatio || '')
  const fmt = metaLoaded && meta.format ? meta.format.toUpperCase() : ''
  const time = formatDate(item.turnCreatedAt)

  return (
    <div
      className="grid cursor-pointer grid-cols-[3.5rem_1fr_6rem_5rem_6.5rem_7rem] items-center gap-2 border-b border-border-hair px-2 py-2 text-sm transition hover:bg-surface-02"
      onClick={onPreview}
      role="button"
      tabIndex={0}
    >
      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-input bg-surface-02">
        <FallbackImage
          alt={item.turnPrompt}
          className="h-10 w-10 object-cover"
          image={item.image}
          loading="lazy"
        />
      </div>
      <div className="min-w-0">
        <p className="truncate text-ink-primary">{truncatePrompt(item.turnPrompt, 50)}</p>
        <div className="flex items-center gap-1.5">
          {fmt && <StatusChip status="ok" label={fmt} className="!text-[9px] !px-1.5 !py-0" />}
          <span className="text-[10px] text-ink-muted">{item.conversationTitle || '新对话'}</span>
        </div>
      </div>
      <span className="truncate text-xs text-ink-muted">{item.turnModel}</span>
      <span className="truncate text-xs text-ink-muted">{dim}</span>
      <span className="text-xs text-ink-muted">{time}</span>
      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        <button
          aria-label="下载"
          className="grid h-7 w-7 place-items-center rounded-input text-ink-muted transition hover:bg-surface-03 hover:text-ink-primary"
          onClick={onDownload}
          type="button"
        >
          <Download size={13} />
        </button>
        <button
          aria-label="跳到来源对话"
          className="grid h-7 w-7 place-items-center rounded-input text-ink-muted transition hover:bg-surface-03 hover:text-ink-primary"
          onClick={onJump}
          type="button"
        >
          <ExternalLink size={13} />
        </button>
        <button
          aria-label="删除"
          className="grid h-7 w-7 place-items-center rounded-input text-ink-muted transition hover:bg-danger/15 hover:text-danger"
          onClick={onDelete}
          type="button"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )
}