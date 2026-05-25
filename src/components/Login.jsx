import { useState, useCallback } from 'react'
import { LogIn, ChevronRight, Loader2 } from 'lucide-react'
import { authLogin, authGroups, authGenerateKey } from '../api/backend'
import { storeUser } from '../utils/authStorage'
import GroupPicker from './GroupPicker'

export default function Login({ onLoginSuccess }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [step, setStep] = useState('login')
  const [groups, setGroups] = useState([])
  const [selectedGroupId, setSelectedGroupId] = useState(null)

  const handleLogin = useCallback(async () => {
    if (!email.trim() || !password.trim()) {
      setError('Please enter email and password')
      return
    }
    setLoading(true)
    setError('')
    try {
      const { user } = await authLogin({ email: email.trim(), password })
      storeUser(user)

      const { groups: availableGroups } = await authGroups()
      if (availableGroups.length === 0) {
        setError('No available groups. Please contact the administrator.')
        setLoading(false)
        return
      }
      setGroups(availableGroups)
      setSelectedGroupId(availableGroups.length === 1 ? availableGroups[0].id : null)
      setStep('group')
      setLoading(false)
    } catch (err) {
      setError(err.message || 'Login failed')
      setLoading(false)
    }
  }, [email, password])

  const doGenerateKey = useCallback(async (gid) => {
    setLoading(true)
    setError('')
    try {
      const { key, endpoint, group } = await authGenerateKey({ name: 'image-site', groupId: gid })
      onLoginSuccess({ endpoint, apiKey: key, groupId: group.id, groupName: group.name })
    } catch (err) {
      setError(err.message || 'Failed to generate key')
      setLoading(false)
    }
  }, [onLoginSuccess])

  const handleGroupSelect = useCallback(() => {
    if (selectedGroupId == null) {
      setError('Please select a group')
      return
    }
    doGenerateKey(selectedGroupId)
  }, [selectedGroupId, doGenerateKey])

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !loading) {
      if (step === 'login') handleLogin()
      else handleGroupSelect()
    }
  }, [loading, step, handleLogin, handleGroupSelect])

  if (step === 'group') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-base/80 backdrop-blur">
        <div className="relative w-[min(92vw,28rem)] max-h-[92vh] overflow-y-auto rounded-card border border-border-subtle bg-surface-01 p-s-6 shadow-lift">
          <GroupPicker
            actionLabel="Use Group"
            error={error}
            groups={groups}
            loading={loading}
            loadingLabel="Loading Key..."
            onConfirm={handleGroupSelect}
            onSelectGroup={setSelectedGroupId}
            selectedGroupId={selectedGroupId}
            title="Select Group"
          />
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-base/80 backdrop-blur">
      <div className="relative w-full max-w-md rounded-card border border-border-subtle bg-surface-01 p-s-6 shadow-lift">
        <div className="flex flex-col items-center gap-s-4 mb-s-6">
          <div className="grid h-14 w-14 place-items-center rounded-card bg-accent-soft/20 text-accent shadow-sm">
            <LogIn size={22} />
          </div>
          <div className="text-center">
            <h2 className="font-display text-2xl text-ink-primary">Login</h2>
            <p className="mt-s-1 text-sm text-ink-muted">Login with your sub2api account</p>
          </div>
        </div>

        {error && (
          <div className="mb-s-4 rounded-pill bg-danger/10 px-s-3 py-s-1 text-xs font-medium text-danger">
            {error}
          </div>
        )}

        <div className="space-y-s-4">
          <label className="grid gap-s-2">
            <span className="text-sm font-medium text-ink-secondary">Email</span>
            <input
              className="h-10 w-full rounded-input border border-border-subtle bg-surface-02 px-3.5 text-sm text-ink-primary outline-none transition placeholder:text-ink-muted focus:ring-4 focus:ring-accent-soft"
              disabled={loading}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="user@example.com"
              type="email"
              value={email}
            />
          </label>

          <label className="grid gap-s-2">
            <span className="text-sm font-medium text-ink-secondary">Password</span>
            <input
              className="h-10 w-full rounded-input border border-border-subtle bg-surface-02 px-3.5 text-sm text-ink-primary outline-none transition placeholder:text-ink-muted focus:ring-4 focus:ring-accent-soft"
              disabled={loading}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter password"
              type="password"
              value={password}
            />
          </label>
        </div>

        <button
          className="mt-s-6 inline-flex w-full items-center justify-center gap-s-2 rounded-input bg-accent py-s-3 text-sm font-semibold text-ink-base-l transition hover:bg-accent-soft disabled:opacity-60"
          disabled={loading}
          onClick={handleLogin}
          type="button"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <ChevronRight size={16} />}
          {loading ? 'Logging in...' : 'Login'}
        </button>
      </div>
    </div>
  )
}