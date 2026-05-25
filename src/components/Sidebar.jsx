import { useState } from 'react'
import {
  Plus, Trash2, MessageCircle, Image,
  ChevronLeft, ChevronRight, LogOut, Settings,
} from 'lucide-react'

function getLastThumbnails(conv, max = 4) {
  const images = []
  for (let i = (conv.turns || []).length - 1; i >= 0 && images.length < max; i -= 1) {
    const turn = conv.turns[i]
    if (turn.status === 'success') {
      for (const img of (turn.images || []).slice().reverse()) {
        if (images.length >= max) break
        if (img.url || img.sourceUrl) images.push(img.sourceUrl || img.url)
      }
    }
  }
  return images
}

export default function Sidebar({
  conversations, activeId, onSelect, onCreate, onDelete,
  isOpen, onToggle,
  onLogout,
  onOpenSettings,
}) {
  const [expanded, setExpanded] = useState(true)

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 z-40 bg-ink-base/60 backdrop-blur-sm md:hidden" onClick={onToggle} />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex h-screen w-[240px] shrink-0 flex-col gap-s-2 border-r border-border-subtle bg-surface-01 px-s-3 py-s-5 transition-all md:static md:z-0 md:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } ${expanded ? 'w-[240px]' : 'w-14'}`}
      >
        <div className={`flex items-center gap-s-2 px-s-3 pb-s-4 ${expanded ? '' : 'justify-center'}`}>
          <div className="grid h-7 w-7 shrink-0 place-items-center rounded-input bg-accent/10 text-accent">
            <Image size={14} />
          </div>
          {expanded && (
            <span className="font-display text-lg text-ink-primary">Image Site</span>
          )}
          {expanded && (
            <button
              aria-label="关闭侧栏"
              className="ml-auto grid h-7 w-7 place-items-center rounded-input text-ink-muted hover:bg-surface-02 hover:text-ink-primary md:hidden"
              onClick={onToggle}
              type="button"
            >
              <ChevronLeft size={14} />
            </button>
          )}
        </div>

        {expanded ? (
          <>
            <button
              className="flex w-full items-center gap-s-2 rounded-input bg-accent px-s-3 py-s-2 text-sm font-medium text-ink-base-l transition-colors hover:bg-accent-soft"
              onClick={onCreate}
              type="button"
            >
              <Plus size={15} />
              新建会话
            </button>

            <div className="mt-s-2 flex-1 overflow-y-auto px-s-1 pb-s-4">
              <p className="px-s-2 pb-s-2 font-mono text-[10px] uppercase tracking-wide text-ink-faint">
                会话历史
              </p>
              {conversations.length === 0 ? (
                <p className="px-s-2 py-s-4 text-center text-xs text-ink-faint">暂无会话</p>
              ) : (
                <ul className="flex flex-col gap-s-1">
                  {conversations.map((conv) => {
                    const thumbs = getLastThumbnails(conv)
                    return (
                      <li key={conv.id} className="group relative">
                        <button
                          className={`flex w-full items-start gap-s-2 overflow-hidden rounded-input px-s-3 py-s-2 text-left text-sm transition-colors ${
                            activeId === conv.id
                              ? 'bg-surface-02 text-accent'
                              : 'text-ink-secondary hover:bg-surface-02 hover:text-ink-primary'
                          }`}
                          onClick={() => onSelect(conv.id)}
                          type="button"
                        >
                          <MessageCircle size={14} className="mt-0.5 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <span className="truncate">{conv.title || '新的会话'}</span>
                            {thumbs.length > 0 && (
                              <div className="mt-s-1.5 flex gap-1">
                                {thumbs.map((src, idx) => (
                                  <img
                                    key={`${conv.id}-thumb-${idx}`}
                                    alt=""
                                    className="h-7 w-7 shrink-0 rounded-sm border border-border-subtle object-cover"
                                    loading="lazy"
                                    src={src}
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                        </button>
                        <button
                          aria-label="删除会话"
                          className="absolute right-1 top-1 grid h-7 w-7 shrink-0 place-items-center rounded-input text-ink-faint opacity-0 transition-colors hover:bg-danger/10 hover:text-danger group-hover:opacity-100"
                          onClick={() => onDelete(conv.id)}
                          type="button"
                        >
                          <Trash2 size={12} />
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center gap-s-2 pt-s-2">
            <button
              aria-label="新建会话"
              className="grid h-9 w-9 place-items-center rounded-input bg-accent text-ink-base-l transition-colors hover:bg-accent-soft"
              onClick={onCreate}
              type="button"
            >
              <Plus size={15} />
            </button>
            {conversations.map((conv) => (
              <button
                key={conv.id}
                aria-label={conv.title || '新的会话'}
                className={`grid h-9 w-9 place-items-center rounded-input transition-colors ${
                  activeId === conv.id
                    ? 'bg-surface-02 text-accent'
                    : 'text-ink-muted hover:bg-surface-02 hover:text-ink-primary'
                }`}
                onClick={() => onSelect(conv.id)}
                type="button"
              >
                <MessageCircle size={15} />
              </button>
            ))}
          </div>
        )}

        <div className="border-t border-border-subtle pt-s-2">
          {expanded ? (
            <div className="flex items-center gap-s-1 px-s-1">
              {onOpenSettings && (
                <button
                  aria-label="设置"
                  className="flex flex-1 items-center gap-s-2 rounded-input px-s-3 py-s-2 text-sm text-ink-muted transition-colors hover:bg-surface-02 hover:text-ink-primary"
                  onClick={onOpenSettings}
                  type="button"
                >
                  <Settings size={14} />
                  设置
                </button>
              )}
              {onLogout && (
                <button
                  aria-label="Logout"
                  className="flex flex-1 items-center gap-s-2 rounded-input px-s-3 py-s-2 text-sm text-ink-muted transition-colors hover:bg-surface-02 hover:text-ink-primary"
                  onClick={onLogout}
                  type="button"
                >
                  <LogOut size={14} />
                  退出
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-s-2">
              {onOpenSettings && (
                <button
                  aria-label="设置"
                  className="grid h-9 w-9 place-items-center rounded-input text-ink-muted transition-colors hover:bg-surface-02 hover:text-ink-primary"
                  onClick={onOpenSettings}
                  type="button"
                >
                  <Settings size={15} />
                </button>
              )}
              {onLogout && (
                <button
                  aria-label="Logout"
                  className="grid h-9 w-9 place-items-center rounded-input text-ink-muted transition-colors hover:bg-surface-02 hover:text-ink-primary"
                  onClick={onLogout}
                  type="button"
                >
                  <LogOut size={15} />
                </button>
              )}
            </div>
          )}
          <button
            className="flex w-full items-center justify-center gap-s-1 py-s-2 text-[11px] text-ink-faint transition-colors hover:text-ink-muted"
            onClick={() => setExpanded(!expanded)}
            type="button"
          >
            {expanded ? <><ChevronLeft size={12} /> 收起</> : <ChevronRight size={12} />}
          </button>
        </div>
      </aside>
    </>
  )
}
