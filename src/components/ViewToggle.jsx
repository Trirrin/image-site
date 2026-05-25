import { LayoutGrid, Table } from 'lucide-react'

export default function ViewToggle({ value, onChange, gridLabel = '网格', tableLabel = '列表' }) {
  const options = [
    { id: 'grid', label: gridLabel, Icon: LayoutGrid },
    { id: 'table', label: tableLabel, Icon: Table },
  ]
  return (
    <div
      role="radiogroup"
      aria-label={`${gridLabel} / ${tableLabel}`}
      className="inline-flex items-center gap-s-1 rounded-input border border-border-subtle bg-surface-01 p-s-1"
    >
      {options.map(({ id, label, Icon }) => {
        const active = value === id
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            onClick={() => onChange(id)}
            className={`inline-flex items-center gap-s-2 rounded-input px-s-3 py-s-1 text-xs font-medium transition-colors ${
              active
                ? 'bg-surface-03 text-ink-primary'
                : 'text-ink-muted hover:bg-surface-02 hover:text-ink-primary'
            }`}
          >
            <Icon aria-hidden="true" className="h-3.5 w-3.5" />
            <span>{label}</span>
          </button>
        )
      })}
    </div>
  )
}
