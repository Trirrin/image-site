import { useState } from 'react'
import { AlertTriangle, Check, LoaderCircle, X } from 'lucide-react'
import { buildJobPromptText } from '../utils/promptComposition'

export default function PromptReviewDialog({ draft, isBusy, onCancel, onConfirm }) {
  const [editedPrompt, setEditedPrompt] = useState(() => draft?.optimizedPrompt?.prompt || draft?.submittedPrompt || '')

  if (!draft) return null

  const notes = Array.isArray(draft.optimizedPrompt?.notes) ? draft.optimizedPrompt.notes : []
  const promptItems = Array.isArray(draft.optimizedPrompt?.prompts) ? draft.optimizedPrompt.prompts : []
  const warning = draft.optimizedPrompt?.warning || ''
  const canConfirm = editedPrompt.trim().length > 0 && !isBusy
  const finalPromptPreview = promptItems.length > 0
    ? buildJobPromptText({ ...draft.optimizedPrompt, prompt: editedPrompt }, draft.submittedPrompt).prompt
    : ''

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-base/80 px-s-4 backdrop-blur">
      <div className="relative flex max-h-[92vh] w-[min(94vw,46rem)] flex-col overflow-hidden rounded-card bg-surface-01 border border-border-subtle shadow-lift">
        <div className="flex items-center justify-between gap-s-3 border-b border-border-subtle px-5 py-s-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-tight text-ink-primary">确认提示词</h2>
          </div>
          <button
            aria-label="关闭"
            className="grid h-9 w-9 place-items-center rounded-input border border-border-subtle bg-surface-02 text-ink-secondary transition hover:bg-surface-03 disabled:opacity-60"
            disabled={isBusy}
            onClick={onCancel}
            type="button"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-s-4">
          {warning && (
            <div className="mb-s-3 flex items-start gap-s-2 rounded-card border border-warning/30 bg-warning/10 px-s-3 py-s-2 text-xs leading-5 text-warning">
              <AlertTriangle className="mt-0.5 shrink-0" size={14} />
              <span>{warning}</span>
            </div>
          )}

          <div className="grid gap-s-3 md:grid-cols-2">
            <section className="rounded-card border border-border-subtle bg-surface-02 p-s-3">
              <h3 className="text-xs font-semibold text-ink-primary">原始提示词</h3>
              <p className="mt-s-2 max-h-56 overflow-y-auto whitespace-pre-wrap text-xs leading-5 text-ink-secondary">
                {draft.submittedPrompt || '（空提示词）'}
              </p>
            </section>

            <section className="rounded-card border border-border-subtle bg-surface-02 p-s-3">
              <h3 className="text-xs font-semibold text-ink-primary">最终提示词</h3>
              <textarea
                className="mt-s-2 min-h-56 w-full resize-y rounded-std border border-border-subtle bg-surface-03 px-s-3 py-s-2 text-xs leading-5 text-ink-primary outline-none transition focus:border-accent focus:ring-4 focus:ring-accent-soft disabled:opacity-70"
                disabled={isBusy}
                onChange={(event) => setEditedPrompt(event.target.value)}
                value={editedPrompt}
              />
            </section>
          </div>

          {promptItems.length > 0 && (
            <div className="mt-s-3 rounded-card border border-border-subtle bg-surface-02 p-s-3">
              <h3 className="text-xs font-semibold text-ink-primary">最终发送给生图模型的分图指令</h3>
              <p className="mt-s-1 text-[11px] leading-5 text-ink-secondary">会明确要求生成 {promptItems.length} 张独立图片，并逐张指定生成方向。</p>
              <pre className="mt-s-2 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-std bg-surface-03 p-s-2 text-xs leading-5 text-ink-secondary">{finalPromptPreview}</pre>
            </div>
          )}

          {notes.length > 0 && (
            <div className="mt-s-3 rounded-card border border-border-subtle bg-surface-02 p-s-3">
              <h3 className="text-xs font-semibold text-ink-primary">说明</h3>
              <ul className="mt-s-2 space-y-1 text-xs leading-5 text-ink-secondary">
                {notes.map((note, index) => (
                  <li key={`${index}-${note}`}>{note}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse gap-s-2 border-t border-border-subtle px-5 py-s-4 sm:flex-row sm:justify-end">
          <button
            className="inline-flex h-10 items-center justify-center rounded-input border border-border-subtle bg-surface-02 px-s-4 text-sm font-medium text-ink-primary transition hover:bg-surface-03 disabled:opacity-60"
            disabled={isBusy}
            onClick={onCancel}
            type="button"
          >
            取消
          </button>
          <button
            className="inline-flex h-10 items-center justify-center gap-s-2 rounded-input bg-accent px-5 text-sm font-semibold text-ink-base-l shadow-lift transition hover:-translate-y-0.5 disabled:opacity-60"
            disabled={!canConfirm}
            onClick={() => onConfirm(editedPrompt)}
            type="button"
          >
            {isBusy ? <LoaderCircle className="animate-spin" size={15} /> : <Check size={15} />}
            确认生成
          </button>
        </div>
      </div>
    </div>
  )
}
