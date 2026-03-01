const STORAGE_KEY = 'cmr_display_name'
const TOKEN_KEY = 'cmr_token'

export function setCurrentUserName(name: string) {
  try {
    const trimmed = name.trim()
    if (trimmed) localStorage.setItem(STORAGE_KEY, trimmed)
  } catch {
    // ignore
  }
}

export function getCurrentUserName(): string | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value?.trim() || null
  } catch {
    return null
  }
}

export function setToken(token: string) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
  } catch {
    // ignore
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function clearAuth() {
  try {
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    // ignore
  }
}

