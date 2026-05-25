import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  Search, MessageCircle, Image, Settings, Plus, LayoutGrid,
  ArrowRight, Keyboard,
} from 'lucide-react'

const ACTION_GROUPS = [
  {
    key: 'navigation',
    label: '导航',
    items: [
      { id: 'nav-chat', label: '生成视图', icon: Image, action: 'view', payload: 'chat' },
      { id: 'nav-library', label: '图库视图', icon: LayoutGrid, action: 'view', payload: 'library' },
      { id: 'nav-dashboard', label: '概览视图', icon: LayoutGrid, action: 'view', payload: 'dashboard' },
      { id: 'nav-settings', label: '设置', icon: Settings, action: 'settings' },
      { id: 'nav-new', label: '新建会话', icon: Plus, action: 'new-conversation' },
    ],
  },
]

export default function CommandPalette({
  open,
  onClose,
  conversations = [],
  onNavigateConversation,
  onSwitchView,
  onOpenSettings,
  onCreateConversation,
}) {
  if (!open) return null

  return (
    <CommandPaletteInner
      onClose={onClose}
      conversations={conversations}
      onNavigateConversation={onNavigateConversation}
      onSwitchView={onSwitchView}
      onOpenSettings={onOpenSettings}
      onCreateConversation={onCreateConversation}
    />
  )
}

function CommandPaletteInner({
  onClose,
  conversations = [],
  onNavigateConversation,
  onSwitchView,
  onOpenSettings,
  onCreateConversation,
}) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  const conversationItems = useMemo(() =>
    conversations.map((conv) => ({
      id: `conv-${conv.id}`,
      label: conv.title || '新的会话',
      icon: MessageCircle,
      action: 'conversation',
      payload: conv.id,
      meta: `${(conv.turns || []).length} 轮`,
    })),
    [conversations])

  const actionItems = useMemo(() =>
    ACTION_GROUPS.flatMap((g) => g.items),
    [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return [...conversationItems.slice(0, 8), ...actionItems]
    return [
      ...conversationItems.filter((item) => item.label.toLowerCase().includes(q)),
      ...actionItems.filter((item) => item.label.toLowerCase().includes(q)),
    ]
  }, [query, conversationItems, actionItems])

  useEffect(() => {
    const el = listRef.current
    if (!el) return
    const active = el.children[activeIndex]
    if (active) active.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  const execute = useCallback((item) => {
    switch (item.action) {
      case 'view':
        onSwitchView?.(item.payload)
        break
      case 'settings':
        onOpenSettings?.()
        break
      case 'new-conversation':
        onCreateConversation?.()
        break
      case 'conversation':
        onNavigateConversation?.(item.payload)
        break
    }
    onClose()
  }, [onClose, onCreateConversation, onNavigateConversation, onOpenSettings, onSwitchView])

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = filtered[activeIndex]
      if (item) execute(item)
    } else if (e.key === 'Escape') {
      onClose()
    }
  }, [activeIndex, execute, filtered, onClose])

  return (
    <div className="fixed inset-0 z-[60] animate-fade-in">
      <div className="absolute inset-0 bg-ink-base/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative mx-auto mt-[12vh] w-full max-w-[560px] rounded-card border border-border-subtle bg-surface-01 shadow-lift">
        <div className="flex items-center gap-s-3 border-b border-border-subtle px-s-5 py-s-3">
          <Search size={16} className="shrink-0 text-ink-muted" />
            <input
            ref={inputRef}
            autoFocus
            className="flex-1 bg-transparent text-sm text-ink-primary outline-none placeholder:text-ink-faint"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="搜索会话、切换视图、执行操作…"
            value={query}
          />
          <kbd className="hidden rounded-input border border-border-subtle bg-surface-02 px-s-2 py-s-0.5 text-[10px] text-ink-faint sm:inline-block">退出</kbd>
        </div>

        <ul ref={listRef} className="max-h-[360px] overflow-y-auto py-s-2">
          {filtered.length === 0 ? (
            <li className="px-s-5 py-s-4 text-center text-sm text-ink-muted">没有匹配结果</li>
          ) : (
            filtered.map((item, idx) => {
              const Icon = item.icon
              const active = idx === activeIndex
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`flex w-full items-center gap-s-3 px-s-5 py-s-2 text-left text-sm transition-colors ${
                      active ? 'bg-surface-02 text-ink-primary' : 'text-ink-secondary hover:bg-surface-02'
                    }`}
                    onClick={() => execute(item)}
                    onMouseEnter={() => setActiveIndex(idx)}
                  >
                    <Icon size={15} className="shrink-0 text-ink-muted" />
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.meta && (
                      <span className="shrink-0 text-[11px] text-ink-faint">{item.meta}</span>
                    )}
                    {active && <ArrowRight size={13} className="shrink-0 text-accent" />}
                  </button>
                </li>
              )
            })
          )}
        </ul>

        <div className="flex items-center gap-s-4 border-t border-border-subtle px-s-5 py-s-2">
          <span className="flex items-center gap-s-1 text-[10px] text-ink-faint">
            <Keyboard size={10} /> ↑↓ 导航
          </span>
          <span className="flex items-center gap-s-1 text-[10px] text-ink-faint">
            ↵ 选择
          </span>
          <span className="flex items-center gap-s-1 text-[10px] text-ink-faint">
            退出：关闭
          </span>
        </div>
      </div>
    </div>
  )
}
