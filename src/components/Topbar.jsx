import { Menu, Settings, LogOut, Image } from 'lucide-react'
import StatusChip from './StatusChip'

export default function Topbar({
  view,
  onViewChange,
  isConfigured,
  groupName,
  onOpenSettings,
  onLogout,
  onToggleSidebar,
}) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border-subtle bg-surface-01 px-s-5">
      <div className="flex items-center gap-s-3">
        <button
          aria-label="菜单"
          className="grid h-9 w-9 place-items-center rounded-input text-ink-muted hover:bg-surface-02 hover:text-ink-primary md:hidden"
          onClick={onToggleSidebar}
          type="button"
        >
          <Menu size={16} />
        </button>
        <div className="flex items-center gap-s-2">
          <div className="grid h-6 w-6 place-items-center rounded-input bg-accent/10 text-accent">
            <Image size={12} />
          </div>
          <span className="font-display text-lg text-ink-primary">Image Site</span>
        </div>
        <div className="hidden md:flex items-center gap-s-2 ml-s-3">
          <ViewTab active={view === 'chat'} onClick={() => onViewChange('chat')}>生成</ViewTab>
          <ViewTab active={view === 'library'} onClick={() => onViewChange('library')}>图库</ViewTab>
        </div>
      </div>

      <div className="flex items-center gap-s-3">
        {isConfigured ? (
          <StatusChip status="ok" label={groupName || '已连接'} />
        ) : (
          <StatusChip status="warn" label="未配置" />
        )}

        <div className="hidden md:flex items-center gap-s-1">
          {onOpenSettings && (
            <button
              aria-label="设置"
              className="grid h-8 w-8 place-items-center rounded-input text-ink-muted transition-colors hover:bg-surface-02 hover:text-ink-primary"
              onClick={onOpenSettings}
              type="button"
            >
              <Settings size={15} />
            </button>
          )}
          {onLogout && (
            <button
              aria-label="退出"
              className="grid h-8 w-8 place-items-center rounded-input text-ink-muted transition-colors hover:bg-surface-02 hover:text-ink-primary"
              onClick={onLogout}
              type="button"
            >
              <LogOut size={15} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-s-1 md:hidden">
          <ViewTab active={view === 'chat'} onClick={() => onViewChange('chat')}>生成</ViewTab>
          <ViewTab active={view === 'library'} onClick={() => onViewChange('library')}>图库</ViewTab>
        </div>
      </div>
    </header>
  )
}

function ViewTab({ active, onClick, children }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={`rounded-input px-s-3 py-s-1 text-xs font-medium transition-colors ${
        active
          ? 'bg-surface-03 text-ink-primary'
          : 'text-ink-muted hover:bg-surface-02 hover:text-ink-primary'
      }`}
    >
      {children}
    </button>
  )
}
