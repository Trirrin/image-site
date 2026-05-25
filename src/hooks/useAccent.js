import { useState, useEffect, useCallback } from 'react'

const STORAGE_KEY = 'image-site:accent'

const PRESETS = [
  { name: 'Terra', accent: '#c4513a', soft: '#d97757', deep: '#8e3525', glow: 'rgba(196,81,58,0.22)', wash: 'rgba(196,81,58,0.1)' },
  { name: 'Ocean', accent: '#2e7d9b', soft: '#4a9eb8', deep: '#1d5a73', glow: 'rgba(46,125,155,0.22)', wash: 'rgba(46,125,155,0.1)' },
  { name: 'Violet', accent: '#7c4dbd', soft: '#9b72d4', deep: '#5a3591', glow: 'rgba(124,77,189,0.22)', wash: 'rgba(124,77,189,0.1)' },
  { name: 'Jade', accent: '#3d8b5e', soft: '#5aab7a', deep: '#2a6642', glow: 'rgba(61,139,94,0.22)', wash: 'rgba(61,139,94,0.1)' },
  { name: 'Amber', accent: '#b8862e', soft: '#d4a44e', deep: '#8e6620', glow: 'rgba(184,134,46,0.22)', wash: 'rgba(184,134,46,0.1)' },
  { name: 'Rose', accent: '#b5436a', soft: '#cf6a8a', deep: '#8e3054', glow: 'rgba(181,67,106,0.22)', wash: 'rgba(181,67,106,0.1)' },
]

function getInitial() {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored) {
    try { return JSON.parse(stored) } catch { /* ignore */ }
  }
  return PRESETS[0]
}

function applyAccent(preset) {
  const root = document.documentElement
  root.style.setProperty('--color-accent', preset.accent)
  root.style.setProperty('--color-accent-soft', preset.soft)
  root.style.setProperty('--color-accent-deep', preset.deep)
  root.style.setProperty('--color-accent-glow', preset.glow)
  root.style.setProperty('--color-accent-wash', preset.wash)
}

export function useAccent() {
  const [accent, setAccentState] = useState(getInitial)

  useEffect(() => {
    applyAccent(accent)
  }, [accent])

  const setAccent = useCallback((preset) => {
    setAccentState(preset)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preset))
  }, [])

  return { accent, setAccent, presets: PRESETS }
}
