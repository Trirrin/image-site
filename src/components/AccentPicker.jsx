import { Check } from 'lucide-react'

export default function AccentPicker({ current, presets, onChange }) {
  return (
    <div className="flex flex-wrap gap-s-2">
      {presets.map((preset) => {
        const active = current.name === preset.name
        return (
          <button
            key={preset.name}
            type="button"
            className={`group relative flex h-9 items-center gap-s-2 rounded-pill border px-s-3 text-xs font-medium transition ${
              active
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-border-subtle bg-surface-02 text-ink-secondary hover:border-border-strong hover:text-ink-primary'
            }`}
            onClick={() => onChange(preset)}
          >
            <span
              className="h-3.5 w-3.5 shrink-0 rounded-full border border-white/20"
              style={{ backgroundColor: preset.accent }}
            />
            <span>{preset.name}</span>
            {active && <Check size={12} className="shrink-0" />}
          </button>
        )
      })}
    </div>
  )
}
