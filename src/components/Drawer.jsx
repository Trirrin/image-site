import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

export default function Drawer({ open, onClose, title, description, children }) {
  const panelRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
      panelRef.current?.focus()
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-ink-base/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="absolute right-0 top-0 flex h-full w-full max-w-[480px] flex-col border-l border-border-subtle bg-surface-01 shadow-lift animate-slide-in-right outline-none"
      >
        <div className="flex items-start justify-between gap-s-3 border-b border-border-subtle px-s-5 py-s-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-ink-primary">{title}</h2>
            {description && (
              <p className="mt-s-1 text-sm text-ink-secondary">{description}</p>
            )}
          </div>
          <button
            type="button"
            aria-label="关闭"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-input text-ink-muted transition-colors hover:bg-surface-02 hover:text-ink-primary"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-s-5 py-s-5">
          {children}
        </div>
      </div>

      <style>{`
        @keyframes slide-in-right {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .animate-slide-in-right {
          animation: slide-in-right 240ms cubic-bezier(0.4, 0, 0.2, 1) forwards;
        }
      `}</style>
    </div>
  )
}
