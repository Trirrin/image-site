const STATUS_STYLES = {
  ok: 'bg-success/15 text-success border-success/40',
  warn: 'bg-warning/15 text-warning border-warning/40',
  error: 'bg-danger/15 text-danger border-danger/40',
  pending: 'bg-neutral/15 text-ink-muted border-neutral/40',
}

const DOT_STYLES = {
  ok: 'bg-success',
  warn: 'bg-warning',
  error: 'bg-danger',
  pending: 'bg-neutral',
}

const STATUS_LABELS = {
  ok: '正常',
  warn: '警告',
  error: '错误',
  pending: '进行中',
}

export default function StatusChip({ status, label, ariaLabel, className = '' }) {
  const kind = ['ok', 'warn', 'error', 'pending'].includes(status) ? status : 'pending'
  return (
    <output
      aria-label={ariaLabel || `${STATUS_LABELS[kind]}：${label}`}
      className={`inline-flex items-center gap-s-2 rounded-pill border px-s-3 py-s-1 text-xs font-medium ${STATUS_STYLES[kind]} ${className}`}
    >
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${DOT_STYLES[kind]}`} />
      <span>{label}</span>
    </output>
  )
}
