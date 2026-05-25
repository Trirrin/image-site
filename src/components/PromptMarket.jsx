import { useState, useEffect, useMemo } from 'react'
import { X, Search, Star, Copy, Check } from 'lucide-react'

const FALLBACK_PROMPTS = [
  { id: 'p1', title: '赛博朋克城市夜景', prompt: '未来感赛博朋克城市夜景，霓虹招牌、飞行汽车、雨后湿润街道、电影感光影、超高细节', category: '场景' },
  { id: 'p2', title: '可爱猫咪肖像', prompt: '可爱的毛茸茸小猫看向镜头，自然柔光，虚化背景，专业宠物摄影，高质量', category: '动物' },
  { id: 'p3', title: '极简室内设计', prompt: '极简室内设计，斯堪的纳维亚风格，温暖阳光穿过窗户，干净线条，舒适氛围，建筑摄影', category: '设计' },
  { id: 'p4', title: '奇幻森林精灵', prompt: '神秘森林精灵，发光翅膀，魔法氛围，迷雾森林，空灵光线，幻想艺术，精致细节', category: '人物' },
  { id: 'p5', title: '星空下的雪山', prompt: '星空下的雪山，清晰可见的银河，宁静风景，长曝光摄影，超高清', category: '风景' },
  { id: 'p6', title: '复古蒸汽波', prompt: '蒸汽波美学，复古 80 年代风格，粉彩色调，大理石雕像，棕榈树，合成波，故障效果，怀旧氛围', category: '风格' },
  { id: 'p7', title: '精致美食摄影', prompt: '精致美食摄影，漂亮摆盘，柔和窗光，浅景深，餐厅级质感，诱人食欲，8K', category: '美食' },
  { id: 'p8', title: '水墨山水画', prompt: '传统中国水墨画，雾气山峦，松树，瀑布，古寺，极简笔触，宁静氛围', category: '艺术' },
  { id: 'p9', title: '未来机甲战士', prompt: '未来机甲战士，精细机械结构，发光能源核心，电影感姿态，科幻概念艺术，宏大尺度', category: '人物' },
  { id: 'p10', title: '樱花树下', prompt: '盛开的樱花树，花瓣随风飘落，柔粉色氛围，日式庭园，春季，梦幻感', category: '风景' },
  { id: 'p11', title: '抽象几何艺术', prompt: '抽象几何艺术，鲜明色彩，包豪斯风格，干净线条，现代构图，均衡形状，画廊级品质', category: '艺术' },
  { id: 'p12', title: '蒸汽朋克机械', prompt: '蒸汽朋克机械装置，黄铜齿轮，铜管，维多利亚时代设计，复杂工艺，暖色调', category: '风格' },
]

const CATEGORIES = ['全部', '场景', '动物', '设计', '人物', '风景', '风格', '美食', '艺术']

function hasChineseText(value) {
  return /[\u4e00-\u9fff]/.test(String(value || ''))
}

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
          })).filter((p) => hasChineseText(p.prompt))
          if (mapped.length > 0) setPrompts(mapped)
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