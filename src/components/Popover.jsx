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
      <button
        aria-expanded={open}
        className={disabled ? 'contents cursor-not-allowed opacity-60' : 'contents'}
        disabled={disabled}
        onClick={() => { if (!disabled) onClose(!open) }}
        type="button"
      >
        {trigger}
      </button>
      {open && (
        <div
          className={`absolute z-40 ${posClass} ${alignClass} min-w-[140px] rounded-2xl border border-borderSoft/70 bg-white/95 p-1.5 shadow-float backdrop-blur`}
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
      className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm transition ${
        active ? 'bg-amberSoft text-charcoal' : 'text-charcoal hover:bg-muted'
      } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
      disabled={disabled}
      onClick={onSelect}
      type="button"
    >
      {children}
    </button>
  )
}
