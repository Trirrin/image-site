import { useEffect, useState } from 'react'
import { Check, Fingerprint, Globe, KeyRound, RefreshCw, Palette } from 'lucide-react'
import { authGenerateKey, authGroups } from '../api/backend'
import Drawer from './Drawer'
import GroupPicker from './GroupPicker'
import AccentPicker from './AccentPicker'

export default function Settings({ config, user, onUpdateConfig, onClose, onRefreshModels, accent, accentPresets, onAccentChange }) {
  const [groups, setGroups] = useState([])
  const [selectedGroupId, setSelectedGroupId] = useState(config.groupId)
  const [loading, setLoading] = useState(Boolean(user?.id))
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [showKey, setShowKey] = useState(false)

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
    <Drawer open={true} onClose={onClose} title="设置" description="管理 API 配置和模型">
      <GroupPicker
        actionLabel={saved ? '已保存' : '保存'}
        error={error}
        groups={groups}
        loading={loading}
        loadingLabel="Loading..."
        onConfirm={handleUseGroup}
        onSelectGroup={setSelectedGroupId}
        selectedGroupId={selectedGroupId}
      />

      <div className="mt-s-6 space-y-s-4 border-t border-border-subtle pt-s-5">
        <label className="grid gap-s-2">
          <span className="flex items-center gap-s-2 text-sm font-medium text-ink-secondary">
            <Globe size={14} />
            NewAPI 地址
          </span>
          <input
            className="h-10 w-full rounded-input border border-border-subtle bg-surface-03 px-3.5 font-mono text-xs text-ink-muted outline-none"
            readOnly
            value={config.endpoint || ''}
          />
        </label>

        <label className="grid gap-s-2">
          <span className="flex items-center gap-s-2 text-sm font-medium text-ink-secondary">
            <KeyRound size={14} />
            API Key
          </span>
          <div className="relative">
            <input
              className="h-10 w-full rounded-input border border-border-subtle bg-surface-03 px-3.5 pr-12 font-mono text-xs text-ink-muted outline-none"
              readOnly
              type={showKey ? 'text' : 'password'}
              value={config.apiKey || ''}
            />
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-ink-muted hover:text-ink-primary"
              onClick={() => setShowKey(!showKey)}
              type="button"
            >
              {showKey ? '隐藏' : '显示'}
            </button>
          </div>
        </label>

        <label className="grid gap-s-2">
          <span className="flex items-center gap-s-2 text-sm font-medium text-ink-secondary">
            <Fingerprint size={14} />
            浏览器标识
          </span>
          <input
            className="h-10 w-full rounded-input border border-border-subtle bg-surface-03 px-3.5 font-mono text-xs text-ink-muted outline-none"
            readOnly
            value={config.clientId || ''}
          />
        </label>
      </div>

      <div className="mt-s-5 flex flex-col gap-s-3">
        {saved && (
          <div className="inline-flex items-center justify-center gap-s-2 rounded-pill bg-success/10 px-s-4 py-s-2 text-sm font-medium text-success border border-success/20">
            <Check size={15} /> 已保存
          </div>
        )}
        {onRefreshModels && (
          <button
            className="inline-flex w-full items-center justify-center gap-s-2 rounded-input border border-border-subtle bg-surface-02 py-2.5 text-sm font-medium text-ink-secondary transition hover:bg-surface-03 disabled:opacity-60"
            disabled={!config.endpoint || !config.apiKey}
            onClick={onRefreshModels}
            type="button"
          >
            <RefreshCw size={14} />
            刷新模型列表
          </button>
        )}
      </div>

      <div className="mt-s-6 space-y-s-4 border-t border-border-subtle pt-s-5">
        <div className="flex items-center gap-s-2 text-sm font-medium text-ink-secondary">
          <Palette size={14} />
          主题色
        </div>
        <AccentPicker
          current={accent}
          presets={accentPresets}
          onChange={onAccentChange}
        />
      </div>
    </Drawer>
  )
}