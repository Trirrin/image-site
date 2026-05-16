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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/85 backdrop-blur">
      <div className="relative flex h-[min(94dvh,860px)] w-[min(96vw,1180px)] flex-col overflow-hidden rounded-[1.5rem] bg-white/95 shadow-float backdrop-blur">
        <div className="flex items-center justify-between gap-3 border-b border-borderSoft/70 px-5 py-3">
          <h2 className="text-lg font-semibold tracking-tight text-charcoal">灵感市场</h2>
          <button
            aria-label="关闭"
            className="grid h-9 w-9 place-items-center rounded-full border border-borderSoft bg-white text-stoneText transition hover:bg-muted"
            onClick={onClose}
            type="button"
          >
            <X size={16} />
          </button>
        </div>

        <div className="border-b border-borderSoft/60 px-5 py-3">
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stoneText" size={15} />
            <input
              className="h-9 w-full rounded-full border border-borderSoft bg-white pl-10 pr-4 text-sm text-charcoal outline-none transition placeholder:text-stoneText/80 focus:border-champagne focus:ring-2 focus:ring-amberSoft"
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索灵感提示词..."
              value={query}
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
                  activeCategory === cat
                    ? 'bg-champagne text-white'
                    : 'bg-muted text-charcoal hover:bg-amberSoft'
                }`}
                onClick={() => setActiveCategory(cat)}
                type="button"
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {filtered.length === 0 ? (
            <div className="flex h-40 items-center justify-center text-sm text-stoneText">
              没有匹配的提示词
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3">
              {filtered.map((p) => {
                const fav = isFavorite?.(p.id)
                return (
                  <div
                    key={p.id}
                    className="group flex flex-col rounded-[1.25rem] border border-borderSoft/70 bg-surface/60 p-4 transition hover:border-champagne/70 hover:shadow-soft"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-sm font-medium text-charcoal">{p.title}</h3>
                        <span className="mt-0.5 inline-block rounded-full bg-amberSoft px-2 py-0 text-[10px] font-medium text-champagne">
                          {p.category || '通用'}
                        </span>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        {onToggleFavorite && (
                          <button
                            aria-label={fav ? '取消收藏' : '收藏'}
                            className={`grid h-7 w-7 place-items-center rounded-full border transition ${
                              fav
                                ? 'border-amber-200 bg-amber-100 text-amber-700'
                                : 'border-borderSoft bg-white text-stoneText hover:bg-muted'
                            }`}
                            onClick={() => onToggleFavorite(p)}
                            type="button"
                          >
                            <Star size={12} fill={fav ? 'currentColor' : 'none'} />
                          </button>
                        )}
                        <button
                          aria-label={copiedId === p.prompt ? '已复制' : '复制'}
                          className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-borderSoft bg-white text-stoneText transition hover:bg-muted"
                          onClick={() => handleCopy(p.prompt)}
                          type="button"
                        >
                          {copiedId === p.prompt ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                        </button>
                      </div>
                    </div>
                    <p className="mt-2 line-clamp-4 flex-1 text-xs leading-5 text-stoneText">
                      {p.prompt}
                    </p>
                    <button
                      className="mt-3 w-full rounded-full bg-champagne py-2 text-xs font-semibold text-white shadow-button transition hover:-translate-y-0.5"
                      onClick={() => handleUse(p.prompt)}
                      type="button"
                    >
                      使用此提示词
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="border-t border-borderSoft/60 px-5 py-2 text-center text-[10px] text-stoneText">
          数据来源: GitHub open-source prompt collections
        </div>
      </div>
    </div>
  )
}
