import { useState } from 'react'
import {
  Plus, Trash2, MessageCircle, GalleryHorizontalEnd,
  ChevronLeft, ChevronRight, LogOut, Settings,
} from 'lucide-react'

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
        <div className="fixed inset-0 z-40 bg-charcoal/25 md:hidden" onClick={onToggle} />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex flex-col border-r border-borderSoft/70 bg-surface/90 backdrop-blur transition-all md:static md:z-0 md:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } ${expanded ? 'w-[272px]' : 'w-14'}`}
      >
        <div className={`flex items-center gap-3 border-b border-borderSoft/70 px-4 py-3 ${expanded ? 'justify-between' : 'justify-center'}`}>
          <div className="flex items-center gap-2">
            <button
              aria-label="新建会话"
              className={`grid h-8 w-8 shrink-0 place-items-center rounded-2xl bg-amberSoft text-champagne ${expanded ? '' : 'hover:bg-amberSoft/70'}`}
              onClick={onCreate}
              type="button"
            >
              <GalleryHorizontalEnd size={14} />
            </button>
            {expanded && (
              <span className="text-sm font-semibold tracking-tight text-charcoal">Image Site</span>
            )}
          </div>
          {expanded && (
            <div className="flex items-center gap-1">
              {onOpenSettings && (
                <button
                  aria-label="设置"
                  className="grid h-8 w-8 place-items-center rounded-full border border-borderSoft bg-white text-stoneText transition hover:bg-muted"
                  onClick={onOpenSettings}
                  type="button"
                >
                  <Settings size={13} />
                </button>
              )}
              {onLogout && (
                <button
                  aria-label="Logout"
                  className="grid h-8 w-8 place-items-center rounded-full border border-borderSoft bg-white text-stoneText transition hover:bg-muted"
                  onClick={onLogout}
                  type="button"
                >
                  <LogOut size={13} />
                </button>
              )}
              <button
                aria-label="关闭侧栏"
                className="grid h-8 w-8 place-items-center rounded-full border border-borderSoft bg-white text-stoneText transition hover:bg-muted md:hidden"
                onClick={onToggle}
                type="button"
              >
                <ChevronLeft size={14} />
              </button>
            </div>
          )}
        </div>

        {expanded ? (
          <>
            <button
              className="mx-3 mt-3 flex items-center gap-2 rounded-full bg-champagne px-4 py-2.5 text-sm font-semibold text-white shadow-button transition hover:-translate-y-0.5"
              onClick={onCreate}
              type="button"
            >
              <Plus size={15} />
              新建会话
            </button>

            <div className="mt-3 flex-1 overflow-y-auto px-3 pb-4">
              <p className="px-1 pb-2 text-[10px] font-medium uppercase tracking-[0.3em] text-stoneText">
                会话历史
              </p>
              {conversations.length === 0 ? (
                <p className="px-1 py-4 text-center text-xs text-stoneText">暂无会话</p>
              ) : (
                <div className="space-y-0.5">
                  {conversations.map((conv) => (
                    <div key={conv.id} className="group flex items-center gap-1">
                      <button
                        className={`flex flex-1 items-center gap-2 overflow-hidden rounded-xl px-3 py-2.5 text-left text-sm transition ${
                          activeId === conv.id
                            ? 'bg-amberSoft text-charcoal'
                            : 'text-charcoal/80 hover:bg-muted'
                        }`}
                        onClick={() => onSelect(conv.id)}
                        type="button"
                      >
                        <MessageCircle size={14} className="shrink-0" />
                        <span className="truncate">{conv.title || '新的会话'}</span>
                      </button>
                      <button
                        aria-label="删除会话"
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-stoneText opacity-0 transition hover:bg-rose-50 hover:text-rose-500 group-hover:opacity-100"
                        onClick={() => onDelete(conv.id)}
                        type="button"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center gap-3 pt-3">
            <button
              aria-label="新建会话"
              className="grid h-9 w-9 place-items-center rounded-full bg-champagne text-white shadow-button transition hover:-translate-y-0.5"
              onClick={onCreate}
              type="button"
            >
              <Plus size={15} />
            </button>
            {conversations.map((conv) => (
              <button
                key={conv.id}
                aria-label={conv.title || '新的会话'}
                className={`grid h-9 w-9 place-items-center rounded-xl transition ${
                  activeId === conv.id
                    ? 'bg-amberSoft text-charcoal'
                    : 'text-stoneText hover:bg-muted'
                }`}
                onClick={() => onSelect(conv.id)}
                type="button"
              >
                <MessageCircle size={15} />
              </button>
            ))}
            {onOpenSettings && (
              <button
                aria-label="设置"
                className="mt-auto grid h-9 w-9 place-items-center rounded-full border border-borderSoft bg-white text-stoneText transition hover:bg-muted"
                onClick={onOpenSettings}
                type="button"
              >
                <Settings size={15} />
              </button>
            )}
            {onLogout && (
              <button
                aria-label="Logout"
                className={`${onOpenSettings ? '' : 'mt-auto'} grid h-9 w-9 place-items-center rounded-full border border-borderSoft bg-white text-stoneText transition hover:bg-muted`}
                onClick={onLogout}
                type="button"
              >
                <LogOut size={15} />
              </button>
            )}
          </div>
        )}

        <button
          className="flex items-center justify-center gap-1 border-t border-borderSoft/60 py-2.5 text-[11px] text-stoneText hover:text-charcoal"
          onClick={() => setExpanded(!expanded)}
          type="button"
        >
          {expanded ? <><ChevronLeft size={12} /> 收起侧栏</> : <ChevronRight size={12} />}
        </button>
      </aside>
    </>
  )
}
