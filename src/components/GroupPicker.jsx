import { KeyRound, Loader2 } from 'lucide-react'

export default function GroupPicker({
  groups,
  selectedGroupId,
  loading = false,
  error = '',
  title = 'Select Group',
  actionLabel = 'Use Group',
  loadingLabel = 'Loading...',
  onSelectGroup,
  onConfirm,
}) {
  return (
    <>
      <h2 className="mb-6 text-xl font-semibold tracking-tight text-charcoal">{title}</h2>

      {error && (
        <div className="mb-4 rounded-full bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700 border border-red-200">
          {error}
        </div>
      )}

      <div className="space-y-2">
        {groups.map((group) => (
          <button
            key={group.id}
            className={`w-full rounded-xl border px-4 py-3 text-left text-sm transition ${
              selectedGroupId === group.id
                ? 'border-champagne bg-amberSoft text-charcoal font-medium'
                : 'border-borderSoft bg-white text-charcoal hover:bg-muted'
            }`}
            disabled={loading}
            onClick={() => onSelectGroup(group.id)}
            type="button"
          >
            <span className="font-medium">{group.name}</span>
            {group.description && (
              <p className="mt-0.5 text-xs text-stoneText">{group.description}</p>
            )}
          </button>
        ))}
      </div>

      <button
        className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-champagne py-3 text-sm font-semibold text-white shadow-button transition hover:-translate-y-0.5 disabled:opacity-60"
        disabled={loading}
        onClick={onConfirm}
        type="button"
      >
        {loading ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
        {loading ? loadingLabel : actionLabel}
      </button>
    </>
  )
}
