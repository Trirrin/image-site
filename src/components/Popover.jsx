import { useEffect, useRef } from 'react'

export default function Popover({ open, onClose, trigger, children, align = 'start', side = 'top', disabled = false }) {
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open, onClose])

  const posClass = side === 'top'
    ? 'bottom-[calc(100%+6px)]'
    : 'top-[calc(100%+6px)]'

  const alignClass = align === 'end'
    ? 'right-0'
    : align === 'center'
    ? 'left-1/2 -translate-x-1/2'
    : 'left-0'

  return (
    <div className="relative" ref={ref}>
      <span
        aria-expanded={open}
        className={disabled ? 'contents cursor-not-allowed opacity-60' : 'contents'}
        onClick={() => { if (!disabled) onClose(!open) }}
      >
        {trigger}
      </span>
      {open && (
        <div
          className={`absolute z-40 ${posClass} ${alignClass} min-w-[140px] rounded-card border border-border-subtle bg-surface-02 p-1.5 shadow-lift`}
          role="dialog"
        >
          {children}
        </div>
      )}
    </div>
  )
}

export function PopoverItem({ active, disabled, onSelect, children }) {
  return (
    <button
      className={`flex w-full items-center justify-between gap-s-2 rounded-std px-s-3 py-s-2 text-left text-sm transition ${
        active ? 'bg-accent/15 text-accent' : 'text-ink-primary hover:bg-surface-03'
      } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
      disabled={disabled}
      onClick={onSelect}
      type="button"
    >
      {children}
    </button>
  )
}
