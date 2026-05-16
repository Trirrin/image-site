const STORAGE_KEY = 'image-site:sub2api-user'

function loadStoredUser() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function storeUser(user) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(user))
}

export function clearStoredUser() {
  window.localStorage.removeItem(STORAGE_KEY)
}

export function getStoredUser() {
  return loadStoredUser()
}
