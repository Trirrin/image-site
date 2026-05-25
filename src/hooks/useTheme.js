import { useState, useEffect, useCallback } from 'react'

const STORAGE_KEY = 'image-site:theme'
const VALID = ['dark', 'light']

function getInitial() {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (VALID.includes(stored)) return stored
  if (window.matchMedia?.('(prefers-color-scheme: light)').matches) return 'light'
  return 'dark'
}

export function useTheme() {
  const [theme, setThemeState] = useState(getInitial)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  const toggleTheme = useCallback(() => {
    setThemeState((t) => (t === 'dark' ? 'light' : 'dark'))
  }, [])

  const setTheme = useCallback((t) => {
    if (VALID.includes(t)) setThemeState(t)
  }, [])

  const isDark = theme === 'dark'

  return { theme, isDark, toggleTheme, setTheme }
}
