import { KeyRound, Loader2 } from 'lucide-react'

export default function GroupPicker({
  groups,
  selectedGroupId,
  loading = false,
  error = '',
  title = '选择分组',
  actionLabel = '使用分组',
  loadingLabel = '加载中...',
  onSelectGroup,
  onConfirm,
}) {
  return (
    <>
      {title && (
        <h2 className="mb-s-6 text-xl font-semibold tracking-tight text-ink-primary">{title}</h2>
      )}

      {error && (
        <div className="mb-s-4 rounded-pill bg-danger/10 px-s-3 py-s-1 text-xs font-medium text-danger">
          {error}
        </div>
      )}

      <div className="space-y-s-2">
        {groups.map((group) => (
          <button
            key={group.id}
            className={`w-full rounded-input border p-s-3 text-left transition ${
              selectedGroupId === group.id
                ? 'border-accent bg-accent/10'
                : 'border-border-subtle bg-surface-01 hover:border-border-strong'
            }`}
            disabled={loading}
            onClick={() => onSelectGroup(group.id)}
            type="button"
          >
            <span className="text-sm font-medium text-ink-primary">{group.name}</span>
            {group.description && (
              <p className="mt-0.5 text-xs text-ink-muted">{group.description}</p>
            )}
          </button>
        ))}
      </div>

      <button
        className="mt-s-6 inline-flex w-full items-center justify-center gap-s-2 rounded-input bg-accent py-s-3 text-sm font-semibold text-ink-base-l transition hover:bg-accent-soft disabled:opacity-60"
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