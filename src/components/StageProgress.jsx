const STAGES = [
  { key: 'prepare', label: '准备' },
  { key: 'submit', label: '提交' },
  { key: 'generate', label: '生成' },
  { key: 'complete', label: '完成' },
]

function getStageIndex(turn) {
  if (turn.status === 'success') return 3
  if (turn.status === 'error') return 3
  if (turn.status === 'optimizing') return 0
  const progress = turn.progress ?? 0
  if (progress >= 90) return 3
  if (progress >= 30) return 2
  if (turn.jobId) return 2
  return 1
}

export default function StageProgress({ turn }) {
  const currentStage = getStageIndex(turn)
  const progress = turn.progress ?? 0
  const isError = turn.status === 'error'
  const isSuccess = turn.status === 'success'
  const isActive = !isSuccess && !isError

  return (
    <div className="mt-s-3 space-y-s-2">
      <div className="flex items-center gap-s-1">
        {STAGES.map((stage, idx) => {
          const isComplete = idx < currentStage || isSuccess
          const isCurrent = idx === currentStage && !isSuccess && !isError
          const isFailed = isError && idx === currentStage
          return (
            <div key={stage.key} className="flex flex-1 items-center gap-s-1">
              <div className="flex flex-1 flex-col gap-s-1">
                <div className="h-1.5 overflow-hidden rounded-full bg-surface-03">
                  <div
                    className={`h-full rounded-full transition-all ${
                      isFailed
                        ? 'bg-danger'
                        : isComplete
                          ? 'bg-success'
                          : isCurrent
                            ? 'bg-accent'
                            : 'bg-transparent'
                    }`}
                    style={{
                      width: isComplete ? '100%' : isCurrent ? `${Math.min(100, progress)}%` : '0%',
                      transitionDuration: '500ms',
                    }}
                  />
                </div>
                <span className={`font-mono text-[10px] ${
                  isFailed
                    ? 'text-danger'
                    : isComplete
                      ? 'text-success'
                      : isCurrent
                        ? 'text-accent'
                        : 'text-ink-faint'
                }`}>
                  {stage.label}
                </span>
              </div>
              {idx < STAGES.length - 1 && (
                <div className={`h-px w-s-2 shrink-0 ${
                  idx < currentStage || isSuccess ? 'bg-success/40' : 'bg-border-subtle'
                }`} />
              )}
            </div>
          )
        })}
      </div>
      {isActive && currentStage >= 2 && (
        <p className="text-[11px] text-ink-muted">
          {progress > 0 ? `${progress}%` : '排队中…'}
        </p>
      )}
    </div>
  )
}
