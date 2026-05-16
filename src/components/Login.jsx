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
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/85 backdrop-blur">
        <div className="relative w-[min(92vw,28rem)] max-h-[92vh] overflow-y-auto rounded-[1.5rem] bg-white/95 p-6 shadow-float backdrop-blur">
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/85 backdrop-blur">
      <div className="relative w-[min(92vw,28rem)] max-h-[92vh] overflow-y-auto rounded-[1.5rem] bg-white/95 p-6 shadow-float backdrop-blur">
        <div className="flex flex-col items-center gap-4 mb-6">
          <div className="grid h-14 w-14 place-items-center rounded-[1.5rem] bg-amberSoft text-champagne shadow-warm">
            <LogIn size={22} />
          </div>
          <div className="text-center">
            <h2 className="text-xl font-semibold tracking-tight text-charcoal">Login</h2>
            <p className="mt-1 text-sm text-stoneText">Login with your sub2api account</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-full bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700 border border-red-200">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <label className="grid gap-2">
            <span className="text-sm font-medium text-charcoal">Email</span>
            <input
              className="h-10 w-full rounded-xl border border-borderSoft bg-white px-3.5 text-sm text-charcoal shadow-innerSoft outline-none transition placeholder:text-stoneText/80 focus:border-champagne focus:ring-4 focus:ring-amberSoft"
              disabled={loading}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="user@example.com"
              type="email"
              value={email}
            />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-medium text-charcoal">Password</span>
            <input
              className="h-10 w-full rounded-xl border border-borderSoft bg-white px-3.5 text-sm text-charcoal shadow-innerSoft outline-none transition placeholder:text-stoneText/80 focus:border-champagne focus:ring-4 focus:ring-amberSoft"
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
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-champagne py-3 text-sm font-semibold text-white shadow-button transition hover:-translate-y-0.5 disabled:opacity-60"
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
