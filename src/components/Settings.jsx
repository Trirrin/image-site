import { useEffect, useState } from 'react'
import { Check, ChevronDown, Fingerprint, Globe, KeyRound, RefreshCw, WandSparkles, X } from 'lucide-react'
import { authGenerateKey, authGroups } from '../api/backend'
import GroupPicker from './GroupPicker'
import Popover, { PopoverItem } from './Popover'

export default function Settings({ config, user, onUpdateConfig, onClose, onRefreshModels, models = [], optimizerAvailable = false, promptOptimizerModel = '', onPromptOptimizerModelChange }) {
  const [groups, setGroups] = useState([])
  const [selectedGroupId, setSelectedGroupId] = useState(config.groupId)
  const [loading, setLoading] = useState(Boolean(user?.id))
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const [optimizerOpen, setOptimizerOpen] = useState(false)
  const optimizerLabel = optimizerAvailable
    ? models.find((m) => m.model_key === promptOptimizerModel)?.display_name || promptOptimizerModel || '自动选择'
    : '不可用'

  useEffect(() => {
    if (!user?.id) return
    let alive = true

    authGroups()
      .then(({ groups: availableGroups }) => {
        if (!alive) return
        setGroups(availableGroups)
        if (config.groupId != null && availableGroups.some((group) => group.id === config.groupId)) {
          setSelectedGroupId(config.groupId)
        } else {
          setSelectedGroupId(availableGroups.length === 1 ? availableGroups[0].id : null)
        }
      })
      .catch((err) => {
        if (alive) setError(err.message || 'Failed to load groups')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => { alive = false }
  }, [config.groupId, user?.id])

  async function handleUseGroup() {
    if (!user?.id) {
      setError('Please login first')
      return
    }
    if (selectedGroupId == null) {
      setError('Please select a group')
      return
    }
    setLoading(true)
    setError('')
    try {
      const { key, endpoint, group } = await authGenerateKey({
        name: 'image-site',
        groupId: selectedGroupId,
      })
      onUpdateConfig({ endpoint, apiKey: key, groupId: group.id, groupName: group.name })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError(err.message || 'Failed to switch group')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/85 backdrop-blur">
      <div className="relative w-[min(92vw,28rem)] max-h-[92vh] overflow-y-auto rounded-[1.5rem] bg-white/95 p-6 shadow-float backdrop-blur">
        <button
          aria-label="关闭"
          className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full border border-borderSoft bg-white text-stoneText transition hover:bg-muted"
          onClick={onClose}
          type="button"
        >
          <X size={16} />
        </button>

        <GroupPicker
          actionLabel={saved ? 'Saved' : 'Use Group'}
          error={error}
          groups={groups}
          loading={loading}
          loadingLabel="Loading..."
          onConfirm={handleUseGroup}
          onSelectGroup={setSelectedGroupId}
          selectedGroupId={selectedGroupId}
          title="Settings"
        />

        <div className="mt-6 space-y-4 border-t border-borderSoft pt-5">
          <label className="grid gap-2">
            <span className="flex items-center gap-2 text-sm font-medium text-charcoal">
              <Globe size={14} />
              NewAPI 地址
            </span>
            <input
              className="h-10 w-full rounded-xl border border-borderSoft bg-muted px-3.5 text-sm text-stoneText shadow-innerSoft outline-none"
              readOnly
              value={config.endpoint || ''}
            />
          </label>

          <label className="grid gap-2">
            <span className="flex items-center gap-2 text-sm font-medium text-charcoal">
              <KeyRound size={14} />
              API Key
            </span>
            <div className="relative">
              <input
                className="h-10 w-full rounded-xl border border-borderSoft bg-muted px-3.5 pr-12 text-sm text-stoneText shadow-innerSoft outline-none"
                readOnly
                type={showKey ? 'text' : 'password'}
                value={config.apiKey || ''}
              />
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-stoneText hover:text-charcoal"
                onClick={() => setShowKey(!showKey)}
                type="button"
              >
                {showKey ? '隐藏' : '显示'}
              </button>
            </div>
          </label>

          <label className="grid gap-2">
            <span className="flex items-center gap-2 text-sm font-medium text-charcoal">
              <Fingerprint size={14} />
              浏览器标识
            </span>
            <input
              className="h-10 w-full rounded-xl border border-borderSoft bg-muted px-3.5 text-xs text-stoneText shadow-innerSoft outline-none"
              readOnly
              value={config.clientId || ''}
            />
          </label>

          <div className="grid gap-2">
            <span className="flex items-center gap-2 text-sm font-medium text-charcoal">
              <WandSparkles size={14} />
              电商 Skill 意图模型
            </span>
            <Popover align="start" disabled={!optimizerAvailable} open={optimizerOpen} onClose={setOptimizerOpen} side="bottom" trigger={
              <span className="inline-flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-borderSoft bg-muted px-3.5 text-sm text-stoneText shadow-innerSoft">
                <span className="truncate">{optimizerLabel}</span>
                <ChevronDown size={14} />
              </span>
            }>
              <PopoverItem active={!promptOptimizerModel} onSelect={() => { onPromptOptimizerModelChange?.(''); setOptimizerOpen(false) }}>
                <span>自动选择</span>
              </PopoverItem>
              {models.map((m) => (
                <PopoverItem key={m.model_key} active={m.model_key === promptOptimizerModel} onSelect={() => { onPromptOptimizerModelChange?.(m.model_key); setOptimizerOpen(false) }}>
                  <span className="truncate">{m.display_name || m.model_key}</span>
                </PopoverItem>
              ))}
            </Popover>
            {!optimizerAvailable && (
              <p className="text-xs leading-5 text-stoneText">上游模型列表没有匹配 gpt-x.x 的模型，电商 Skill 优化已关闭。</p>
            )}
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-3">
          {saved && (
            <div className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 border border-emerald-100">
              <Check size={15} /> 已保存
            </div>
          )}
          {onRefreshModels && (
            <button
              className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-borderSoft bg-white py-2.5 text-sm font-medium text-charcoal transition hover:bg-muted disabled:opacity-60"
              disabled={!config.endpoint || !config.apiKey}
              onClick={onRefreshModels}
              type="button"
            >
              <RefreshCw size={14} />
              刷新模型列表
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
