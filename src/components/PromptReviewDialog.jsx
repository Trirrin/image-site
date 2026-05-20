import { useState } from 'react'
import { AlertTriangle, Check, LoaderCircle, X } from 'lucide-react'

export default function PromptReviewDialog({ draft, isBusy, onCancel, onConfirm }) {
  const [editedPrompt, setEditedPrompt] = useState(() => draft?.optimizedPrompt?.prompt || draft?.submittedPrompt || '')

  if (!draft) return null

  const notes = Array.isArray(draft.optimizedPrompt?.notes) ? draft.optimizedPrompt.notes : []
  const promptItems = Array.isArray(draft.optimizedPrompt?.prompts) ? draft.optimizedPrompt.prompts : []
  const warning = draft.optimizedPrompt?.warning || ''
  const canConfirm = editedPrompt.trim().length > 0 && !isBusy

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/85 px-4 backdrop-blur">
      <div className="relative flex max-h-[92vh] w-[min(94vw,46rem)] flex-col overflow-hidden rounded-[1.5rem] bg-white/95 shadow-float backdrop-blur">
        <div className="flex items-center justify-between gap-3 border-b border-borderSoft/70 px-5 py-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-tight text-charcoal">确认优化提示词</h2>
            <p className="mt-0.5 text-xs text-stoneText">意图模型 {draft.optimizedPrompt?.model || '未配置'}</p>
          </div>
          <button
            aria-label="关闭"
            className="grid h-9 w-9 place-items-center rounded-full border border-borderSoft bg-white text-stoneText transition hover:bg-muted disabled:opacity-60"
            disabled={isBusy}
            onClick={onCancel}
            type="button"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {warning && (
            <div className="mb-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
              <AlertTriangle className="mt-0.5 shrink-0" size={14} />
              <span>{warning}</span>
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            <section className="rounded-xl border border-borderSoft/70 bg-pearl/80 p-3">
              <h3 className="text-xs font-semibold text-charcoal">原始提示词</h3>
              <p className="mt-2 max-h-56 overflow-y-auto whitespace-pre-wrap text-xs leading-5 text-stoneText">
                {draft.submittedPrompt || '（空提示词）'}
              </p>
            </section>

            <section className="rounded-xl border border-borderSoft/70 bg-white p-3">
              <h3 className="text-xs font-semibold text-charcoal">优化后提示词</h3>
              <textarea
                className="mt-2 min-h-56 w-full resize-y rounded-lg border border-borderSoft bg-pearl/70 px-3 py-2 text-xs leading-5 text-charcoal outline-none transition focus:border-champagne focus:ring-4 focus:ring-amberSoft disabled:opacity-70"
                disabled={isBusy}
                onChange={(event) => setEditedPrompt(event.target.value)}
                value={editedPrompt}
              />
            </section>
          </div>

          {promptItems.length > 0 && (
            <div className="mt-3 rounded-xl border border-borderSoft/70 bg-white p-3">
              <h3 className="text-xs font-semibold text-charcoal">分图提示词</h3>
              <div className="mt-2 max-h-72 space-y-2 overflow-y-auto">
                {promptItems.map((item, index) => (
                  <section key={`${index}-${item.title || 'image'}`} className="rounded-lg border border-borderSoft/70 bg-pearl/80 p-2">
                    <h4 className="text-[11px] font-semibold text-charcoal">{item.title || `图片 ${index + 1}`}</h4>
                    <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-stoneText">{item.prompt}</p>
                  </section>
                ))}
              </div>
            </div>
          )}

          {notes.length > 0 && (
            <div className="mt-3 rounded-xl border border-borderSoft/70 bg-surface/70 p-3">
              <h3 className="text-xs font-semibold text-charcoal">优化说明</h3>
              <ul className="mt-2 space-y-1 text-xs leading-5 text-stoneText">
                {notes.map((note, index) => (
                  <li key={`${index}-${note}`}>{note}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-borderSoft/70 px-5 py-4 sm:flex-row sm:justify-end">
          <button
            className="inline-flex h-10 items-center justify-center rounded-full border border-borderSoft bg-white px-4 text-sm font-medium text-charcoal transition hover:bg-muted disabled:opacity-60"
            disabled={isBusy}
            onClick={onCancel}
            type="button"
          >
            取消
          </button>
          <button
            className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-champagne px-5 text-sm font-semibold text-white shadow-button transition hover:-translate-y-0.5 disabled:opacity-60"
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
