import { useState, useEffect, useMemo } from 'react'
import { X, Search, Star, Copy, Check } from 'lucide-react'

const FALLBACK_PROMPTS = [
  { id: 'p1', title: '赛博朋克城市夜景', prompt: 'A futuristic cyberpunk city at night with neon signs, flying cars, rain-slicked streets, cinematic lighting, ultra-detailed', category: '场景' },
  { id: 'p2', title: '可爱猫咪肖像', prompt: 'A cute fluffy kitten looking at the camera, soft natural lighting, bokeh background, professional pet photography, high quality', category: '动物' },
  { id: 'p3', title: '极简室内设计', prompt: 'Minimalist interior design, Scandinavian style, warm sunlight through windows, clean lines, cozy atmosphere, architectural photography', category: '设计' },
  { id: 'p4', title: '奇幻森林精灵', prompt: 'A mystical forest elf with glowing wings, magical atmosphere, enchanted forest, ethereal lighting, fantasy art, intricate details', category: '人物' },
  { id: 'p5', title: '星空下的雪山', prompt: 'Snow-capped mountain under the starry night sky, Milky Way visible, serene landscape, long exposure photography, ultra HD', category: '风景' },
  { id: 'p6', title: '复古蒸汽波', prompt: 'Vaporwave aesthetic, retro 80s style, pastel colors, marble statue, palm trees, synthwave, glitch effect, nostalgic', category: '风格' },
  { id: 'p7', title: '精致美食摄影', prompt: 'Gourmet food photography, beautifully plated dish, soft window light, shallow depth of field, restaurant quality, appetizing, 8k', category: '美食' },
  { id: 'p8', title: '水墨山水画', prompt: 'Traditional Chinese ink wash painting, misty mountains, pine trees, waterfall, ancient temple, minimalist brush strokes, serene', category: '艺术' },
  { id: 'p9', title: '未来机甲战士', prompt: 'Futuristic mecha warrior, detailed mechanical design, glowing energy core, cinematic pose, sci-fi concept art, epic scale', category: '人物' },
  { id: 'p10', title: '樱花树下', prompt: 'Cherry blossom trees in full bloom, petals falling in the wind, soft pink atmosphere, Japanese garden, spring season, dreamy', category: '风景' },
  { id: 'p11', title: '抽象几何艺术', prompt: 'Abstract geometric art, vibrant colors, Bauhaus style, clean lines, modern composition, balanced shapes, gallery quality', category: '艺术' },
  { id: 'p12', title: '蒸汽朋克机械', prompt: 'Steampunk mechanical contraption, brass gears, copper pipes, Victorian era design, intricate craftsmanship, warm tones', category: '风格' },
]

const CATEGORIES = ['全部', '场景', '动物', '设计', '人物', '风景', '风格', '美食', '艺术']

export default function PromptMarket({ open, onClose, onSelectPrompt, onToggleFavorite, isFavorite }) {
  const [query, setQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState('全部')
  const [copiedId, setCopiedId] = useState(null)
  const [prompts, setPrompts] = useState(FALLBACK_PROMPTS)

  useEffect(() => {
    if (!open) return
    fetch('https://raw.githubusercontent.com/glidea/banana-prompt-quicker/main/prompts.json')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          const mapped = data.map((p, i) => ({
            id: p.id || `remote-${i}`,
            title: p.title || p.prompt?.slice(0, 20) || `提示 ${i + 1}`,
            prompt: p.prompt || p.text || '',
            category: p.category || p.tag || '通用',
          }))
          setPrompts(mapped)
        }
      })
      .catch(() => { /* fallback to defaults */ })
  }, [open])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return prompts.filter((p) => {
      if (activeCategory !== '全部' && p.category !== activeCategory) return false
      if (!q) return true
      return p.title.toLowerCase().includes(q) || p.prompt.toLowerCase().includes(q)
    })
  }, [prompts, query, activeCategory])

  const handleCopy = (promptText) => {
    navigator.clipboard.writeText(promptText)
      .then(() => {
        setCopiedId(promptText)
        setTimeout(() => setCopiedId(null), 1500)
      })
      .catch(() => {})
  }

  const handleUse = (promptText) => {
    onSelectPrompt(promptText)
    onClose()
  }

  useEffect(() => {
    if (!open) return
    const handleKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-ink-base/80 backdrop-blur-sm">
      <div className="max-w-3xl mx-auto mt-20 mb-10 border border-border-subtle rounded-card bg-surface-01 shadow-lift">
        <div className="sticky top-0 z-10 border-b border-border-subtle bg-surface-01 px-s-5 py-s-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl text-ink-primary">提示词市场</h2>
            <button
              aria-label="关闭"
              className="grid h-9 w-9 place-items-center rounded-input border border-border-subtle bg-surface-02 text-ink-secondary transition hover:bg-surface-03"
              onClick={onClose}
              type="button"
            >
              <X size={16} />
            </button>
          </div>
          <div className="relative mt-s-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" size={15} />
            <input
              className="h-9 w-full rounded-pill border border-border-subtle bg-surface-03 pl-10 pr-s-4 text-sm text-ink-primary outline-none transition placeholder:text-ink-muted focus:border-accent focus:ring-2 focus:ring-accent-soft"
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索灵感提示词..."
              value={query}
            />
          </div>
          <div className="mt-s-3 flex gap-s-2 overflow-x-auto pb-s-1">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                className={`shrink-0 rounded-pill border px-s-3 py-s-1 text-xs font-medium transition ${
                  activeCategory === cat
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-border-subtle bg-surface-01 text-ink-muted hover:border-border-strong'
                }`}
                onClick={() => setActiveCategory(cat)}
                type="button"
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        <div className="px-s-5 py-s-4">
          {filtered.length === 0 ? (
            <div className="flex h-40 items-center justify-center text-sm text-ink-muted">
              没有匹配的提示词
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-s-3 md:grid-cols-2 lg:grid-cols-3">
              {filtered.map((p) => {
                const fav = isFavorite?.(p.id)
                return (
                  <div
                    key={p.id}
                    className="rounded-card border border-border-subtle bg-surface-01 p-s-3 transition-colors hover:border-border-strong hover:bg-surface-02"
                  >
                    <span className="rounded-pill bg-accent/10 px-s-2 py-0 text-[10px] font-medium text-accent">
                      {p.category || '通用'}
                    </span>
                    <p className="mt-s-2 line-clamp-3 text-sm text-ink-primary">
                      {p.prompt}
                    </p>
                    <div className="mt-s-3 flex items-center gap-s-2">
                      {onToggleFavorite && (
                        <button
                          aria-label={fav ? '取消收藏' : '收藏'}
                          className={`grid h-7 w-7 place-items-center rounded-input border transition ${
                            fav
                              ? 'border-accent bg-accent/20 text-accent'
                              : 'border-border-subtle bg-surface-01 text-ink-muted hover:bg-surface-02'
                          }`}
                          onClick={() => onToggleFavorite(p)}
                          type="button"
                        >
                          <Star size={14} fill={fav ? 'currentColor' : 'none'} />
                        </button>
                      )}
                      <button
                        aria-label={copiedId === p.prompt ? '已复制' : '复制'}
                        className="grid h-7 w-7 place-items-center rounded-input border border-border-subtle bg-surface-01 text-ink-muted transition hover:bg-surface-02"
                        onClick={() => handleCopy(p.prompt)}
                        type="button"
                      >
                        {copiedId === p.prompt ? <Check size={14} className="text-success" /> : <Copy size={14} />}
                      </button>
                      <button
                        className="ml-auto rounded-input bg-accent px-s-3 py-s-1 text-xs text-ink-base-l"
                        onClick={() => handleUse(p.prompt)}
                        type="button"
                      >
                        使用
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}