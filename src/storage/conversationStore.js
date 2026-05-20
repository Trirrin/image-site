const DB_NAME = 'image-site'
const DB_VERSION = 2
const CONVERSATION_STORE = 'conversations'
const IMAGE_STORE = 'images'
const META_STORE = 'meta'
const ACTIVE_ID_KEY = 'activeConversationId'

const LEGACY_CONVERSATIONS_KEY = 'image-site:conversations'
const LEGACY_ACTIVE_KEY = 'image-site:active-conversation-id'
const MIGRATED_KEY = 'image-site:indexeddb-migrated'

let dbPromise = null
let migrationPromise = null
let memoryConversations = []
let memoryActiveId = null

const objectUrls = new Map()

function isBrowser() {
  return typeof window !== 'undefined'
}

function normalizeConversation(item) {
  if (!item || !item.id) return null
  return {
    ...item,
    turns: Array.isArray(item.turns) ? item.turns : [],
  }
}

function sortConversations(items) {
  return items.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
}

function readLegacyConversations() {
  if (!isBrowser()) return []
  try {
    const raw = window.localStorage.getItem(LEGACY_CONVERSATIONS_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.map(normalizeConversation).filter(Boolean) : []
  } catch {
    return []
  }
}

function readLegacyActiveId() {
  if (!isBrowser()) return null
  try {
    return window.localStorage.getItem(LEGACY_ACTIVE_KEY) || null
  } catch {
    return null
  }
}

function clearLegacyStorage() {
  if (!isBrowser()) return
  try {
    window.localStorage.removeItem(LEGACY_CONVERSATIONS_KEY)
    window.localStorage.removeItem(LEGACY_ACTIVE_KEY)
    window.localStorage.setItem(MIGRATED_KEY, '1')
  } catch {
    // IndexedDB is already authoritative; cleanup is best effort.
  }
}

function openDb() {
  if (!isBrowser() || !window.indexedDB) return Promise.resolve(null)
  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(CONVERSATION_STORE)) {
        db.createObjectStore(CONVERSATION_STORE, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(IMAGE_STORE)) {
        db.createObjectStore(IMAGE_STORE, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'key' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB'))
    request.onblocked = () => reject(new Error('IndexedDB upgrade was blocked'))
  }).catch((error) => {
    dbPromise = null
    throw error
  })

  return dbPromise
}

function txDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed'))
    transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted'))
  })
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed'))
  })
}

function imageKey(conversationId, turnId, imageId) {
  return `${conversationId}:${turnId}:${imageId}`
}

function parseDataUrl(url) {
  const match = typeof url === 'string' ? url.match(/^data:([^;,]+)?(;base64)?,(.*)$/) : null
  if (!match) return null
  const contentType = match[1] || 'image/png'
  const body = match[3] || ''
  if (!match[2]) return new Blob([decodeURIComponent(body)], { type: contentType })

  const binary = atob(body)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: contentType })
}

function objectUrlFor(id, blob) {
  if (!isBrowser() || !blob) return ''
  const cached = objectUrls.get(id)
  if (cached) return cached
  const url = URL.createObjectURL(blob)
  objectUrls.set(id, url)
  return url
}

function putMemoryConversation(conversation) {
  const normalized = normalizeConversation(conversation)
  if (!normalized) return null
  const index = memoryConversations.findIndex((item) => item.id === normalized.id)
  if (index >= 0) {
    memoryConversations = memoryConversations.map((item) => item.id === normalized.id ? normalized : item)
  } else {
    memoryConversations = [normalized, ...memoryConversations]
  }
  return normalized
}

async function fetchImageBlob(url) {
  if (!url) return null
  if (url.startsWith('data:')) return parseDataUrl(url)

  try {
    const response = await fetch(url)
    if (!response.ok) return null
    const contentType = response.headers.get('content-type') || ''
    const blob = await response.blob()
    if (!blob.type && contentType) return blob.slice(0, blob.size, contentType)
    return blob
  } catch {
    return null
  }
}

async function loadImageRecord(db, id) {
  const transaction = db.transaction(IMAGE_STORE, 'readonly')
  const done = txDone(transaction)
  const record = await requestResult(transaction.objectStore(IMAGE_STORE).get(id))
  await done
  return record || null
}

async function loadConversationRecord(db, id) {
  if (!id) return null
  const transaction = db.transaction(CONVERSATION_STORE, 'readonly')
  const done = txDone(transaction)
  const item = await requestResult(transaction.objectStore(CONVERSATION_STORE).get(id))
  await done
  return normalizeConversation(item)
}

async function putImageRecord(db, record) {
  const transaction = db.transaction(IMAGE_STORE, 'readwrite')
  transaction.objectStore(IMAGE_STORE).put(record)
  await txDone(transaction)
}

async function deleteImageRecord(db, id) {
  const transaction = db.transaction(IMAGE_STORE, 'readwrite')
  transaction.objectStore(IMAGE_STORE).delete(id)
  await txDone(transaction)
  const url = objectUrls.get(id)
  if (url) URL.revokeObjectURL(url)
  objectUrls.delete(id)
}

async function localizeImage(db, conversationId, turn, image) {
  if (!image?.id || !image.url) return image
  const id = imageKey(conversationId, turn.id, image.id)
  const existing = await loadImageRecord(db, id)
  if (existing?.blob) {
    return { ...image, url: objectUrlFor(id, existing.blob), sourceUrl: existing.sourceUrl || image.sourceUrl || image.url }
  }

  const blob = await fetchImageBlob(image.url)
  if (!blob) return image

  await putImageRecord(db, {
    id,
    conversationId,
    turnId: turn.id,
    imageId: image.id,
    blob,
    sourceUrl: image.sourceUrl || image.url,
    createdAt: image.createdAt || turn.createdAt || new Date().toISOString(),
  })

  return { ...image, url: objectUrlFor(id, blob), sourceUrl: image.sourceUrl || image.url }
}

async function localizeConversationImages(db, conversation) {
  if (!db) return conversation
  const normalized = normalizeConversation(conversation)
  if (!normalized) return null

  const turns = []
  for (const turn of normalized.turns) {
    if (!Array.isArray(turn.images) || turn.images.length === 0) {
      turns.push(turn)
      continue
    }

    const images = []
    for (const image of turn.images) {
      images.push(await localizeImage(db, normalized.id, turn, image))
    }
    turns.push({ ...turn, images })
  }

  return { ...normalized, turns }
}

async function hydrateConversationImages(db, conversation) {
  if (!db) return conversation
  const normalized = normalizeConversation(conversation)
  if (!normalized) return null

  const turns = []
  for (const turn of normalized.turns) {
    if (!Array.isArray(turn.images) || turn.images.length === 0) {
      turns.push(turn)
      continue
    }

    const images = []
    for (const image of turn.images) {
      const id = image.localImageId || (image.id ? imageKey(normalized.id, turn.id, image.id) : '')
      if (!id) {
        images.push(image)
        continue
      }
      const record = await loadImageRecord(db, id)
      images.push(record?.blob ? {
        ...image,
        url: objectUrlFor(id, record.blob),
        sourceUrl: record.sourceUrl || image.sourceUrl || image.url,
      } : image)
    }
    turns.push({ ...turn, images })
  }

  return { ...normalized, turns }
}

async function deleteConversationImages(db, conversation) {
  if (!db || !conversation) return
  for (const turn of conversation.turns || []) {
    for (const image of turn.images || []) {
      const id = image.localImageId || (image.id ? imageKey(conversation.id, turn.id, image.id) : '')
      if (id) await deleteImageRecord(db, id)
    }
  }
}

async function deleteRemovedImages(db, previous, next) {
  if (!db || !previous) return
  const nextIds = new Set()
  for (const turn of next?.turns || []) {
    for (const image of turn.images || []) {
      const id = image.localImageId || (image.id ? imageKey(next.id, turn.id, image.id) : '')
      if (id) nextIds.add(id)
    }
  }

  for (const turn of previous.turns || []) {
    for (const image of turn.images || []) {
      const id = image.localImageId || (image.id ? imageKey(previous.id, turn.id, image.id) : '')
      if (id && !nextIds.has(id)) await deleteImageRecord(db, id)
    }
  }
}

function stripTransientImageUrls(conversation) {
  const normalized = normalizeConversation(conversation)
  if (!normalized) return null
  return {
    ...normalized,
    turns: normalized.turns.map((turn) => ({
      ...turn,
      images: (turn.images || []).map((image) => {
        if (!image?.id) return image
        const localImageId = image.localImageId || imageKey(normalized.id, turn.id, image.id)
        return {
          ...image,
          localImageId,
          url: image.sourceUrl || image.url,
        }
      }),
    })),
  }
}

async function ensureMigrated() {
  if (!isBrowser()) return
  if (migrationPromise) return migrationPromise

  migrationPromise = (async () => {
    const db = await openDb()
    if (!db) {
      memoryConversations = readLegacyConversations()
      memoryActiveId = readLegacyActiveId()
      return
    }

    const legacyItems = readLegacyConversations()
    const legacyActiveId = readLegacyActiveId()
    if (legacyItems.length === 0 && !legacyActiveId) return

    const localizedItems = []
    for (const item of legacyItems) {
      localizedItems.push(stripTransientImageUrls(await localizeConversationImages(db, item)))
    }

    const transaction = db.transaction([CONVERSATION_STORE, META_STORE], 'readwrite')
    const conversations = transaction.objectStore(CONVERSATION_STORE)
    const meta = transaction.objectStore(META_STORE)

    for (const item of localizedItems.filter(Boolean)) conversations.put(item)
    meta.put({ key: ACTIVE_ID_KEY, value: legacyActiveId || '' })

    await txDone(transaction)
    clearLegacyStorage()
  })()

  return migrationPromise
}

export async function listConversations() {
  await ensureMigrated()
  const db = await openDb()
  if (!db) return sortConversations([...memoryConversations])

  const transaction = db.transaction(CONVERSATION_STORE, 'readonly')
  const done = txDone(transaction)
  const items = await requestResult(transaction.objectStore(CONVERSATION_STORE).getAll())
  await done

  return sortConversations((items || []).map(normalizeConversation).filter(Boolean))
}

export async function getConversation(id) {
  await ensureMigrated()
  if (!id) return null
  const db = await openDb()
  if (!db) return memoryConversations.find((item) => item.id === id) || null

  return hydrateConversationImages(db, await loadConversationRecord(db, id))
}

export async function saveConversation(conversation) {
  await ensureMigrated()
  const normalized = normalizeConversation(conversation)
  if (!normalized) return null

  const db = await openDb()
  if (!db) return putMemoryConversation(normalized)

  const previous = await loadConversationRecord(db, normalized.id)
  const localized = await localizeConversationImages(db, normalized)
  const stored = stripTransientImageUrls(localized)
  await deleteRemovedImages(db, previous, stored)

  const transaction = db.transaction(CONVERSATION_STORE, 'readwrite')
  transaction.objectStore(CONVERSATION_STORE).put(stored)
  await txDone(transaction)
  return localized
}

export async function deleteConversation(id) {
  await ensureMigrated()
  const db = await openDb()
  if (!db) {
    memoryConversations = memoryConversations.filter((item) => item.id !== id)
    if (memoryActiveId === id) memoryActiveId = null
    return
  }

  const existing = await loadConversationRecord(db, id)
  await deleteConversationImages(db, existing)

  const transaction = db.transaction(CONVERSATION_STORE, 'readwrite')
  transaction.objectStore(CONVERSATION_STORE).delete(id)
  await txDone(transaction)
}

export async function getActiveConversationId() {
  await ensureMigrated()
  const db = await openDb()
  if (!db) return memoryActiveId

  const transaction = db.transaction(META_STORE, 'readonly')
  const done = txDone(transaction)
  const item = await requestResult(transaction.objectStore(META_STORE).get(ACTIVE_ID_KEY))
  await done
  return item?.value || null
}

export async function setActiveConversationId(id) {
  await ensureMigrated()
  const value = id || ''
  const db = await openDb()
  if (!db) {
    memoryActiveId = value || null
    return
  }

  const transaction = db.transaction(META_STORE, 'readwrite')
  transaction.objectStore(META_STORE).put({ key: ACTIVE_ID_KEY, value })
  await txDone(transaction)
}
