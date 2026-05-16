import { useState, useEffect, useCallback } from 'react'

const FAV_KEY = 'image-site:prompt-favorites'

export function usePromptFavorites() {
  const [favorites, setFavorites] = useState(() => {
    if (typeof window === 'undefined') return []
    try {
      return JSON.parse(window.localStorage.getItem(FAV_KEY) || '[]')
    } catch {
      return []
    }
  })

  useEffect(() => {
    try { window.localStorage.setItem(FAV_KEY, JSON.stringify(favorites)) } catch { /* ignore */ }
  }, [favorites])

  const addFavorite = useCallback((prompt) => {
    setFavorites((prev) => {
      if (prev.some((f) => f.id === prompt.id)) return prev
      return [prompt, ...prev]
    })
  }, [])

  const removeFavorite = useCallback((id) => {
    setFavorites((prev) => prev.filter((f) => f.id !== id))
  }, [])

  const isFavorite = useCallback((id) => favorites.some((f) => f.id === id), [favorites])

  return { favorites, addFavorite, removeFavorite, isFavorite }
}
