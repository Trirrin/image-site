import { useState, useEffect, useCallback, useRef } from 'react'
import {
  deleteConversation as deleteStoredConversation,
  getActiveConversationId,
  getConversation as getStoredConversation,
  listConversations,
  saveConversation as saveStoredConversation,
  setActiveConversationId,
} from '../storage/conversationStore'

const CHANGE_EVENT = 'image-site:conversations-changed'

function notify() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHANGE_EVENT))
}

export function useConversations() {
  const [conversations, setConversations] = useState([])
  const [activeId, setActiveIdState] = useState(null)
  const [loading, setLoading] = useState(true)
  const loadSeq = useRef(0)

  const loadAll = useCallback(async () => {
    const seq = loadSeq.current + 1
    loadSeq.current = seq
    setLoading(true)
    try {
      const [items, storedActiveId] = await Promise.all([
        listConversations(),
        getActiveConversationId(),
      ])
      const activeConversation = storedActiveId ? await getStoredConversation(storedActiveId) : null
      if (seq !== loadSeq.current) return
      setConversations(items.map((item) => (activeConversation?.id === item.id ? activeConversation : item)))
      setActiveIdState(storedActiveId)
    } catch {
      if (seq !== loadSeq.current) return
      setConversations([])
      setActiveIdState(null)
    } finally {
      if (seq === loadSeq.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    queueMicrotask(loadAll)
  }, [loadAll])

  useEffect(() => {
    const handler = () => { loadAll() }
    window.addEventListener(CHANGE_EVENT, handler)
    window.addEventListener('storage', handler)
    return () => {
      window.removeEventListener(CHANGE_EVENT, handler)
      window.removeEventListener('storage', handler)
    }
  }, [loadAll])

  const setActiveId = useCallback(async (id) => {
    setActiveIdState(id || null)
    await setActiveConversationId(id)
    notify()
  }, [])

  const saveConversation = useCallback(async (conversation) => {
    const saved = await saveStoredConversation(conversation)
    notify()
    return saved
  }, [])

  const deleteConversation = useCallback(async (id) => {
    await deleteStoredConversation(id)
    if (activeId === id) {
      setActiveIdState(null)
      await setActiveConversationId(null)
    }
    notify()
  }, [activeId])

  const addTurn = useCallback(async (conversationId, turn) => {
    const conv = await getStoredConversation(conversationId)
    if (!conv) return conv
    const next = {
      ...conv,
      turns: [...(conv.turns || []), turn],
      updatedAt: new Date().toISOString(),
    }
    await saveConversation(next)
    return next
  }, [saveConversation])

  const getConversation = useCallback(async (id) => getStoredConversation(id), [])

  return {
    conversations, activeId, setActiveId, loading, loadAll,
    saveConversation, deleteConversation, addTurn, getConversation,
  }
}
