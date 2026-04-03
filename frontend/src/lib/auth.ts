import { useEffect, useState } from 'react'

const STORAGE_KEY = 'cmr_display_name'
const EMAIL_KEY = 'cmr_email'
const TOKEN_KEY = 'cmr_token'
const PHOTO_URL_KEY = 'cmr_profile_photo_url'

/** Same key used in `storage` events for cross-tab token sync */
export { TOKEN_KEY as AUTH_TOKEN_STORAGE_KEY }

export const AUTH_CHANGED_EVENT = 'cmr-auth-changed'

function emitAuthChanged() {
  try {
    if (typeof window === 'undefined') return
    window.dispatchEvent(new Event(AUTH_CHANGED_EVENT))
  } catch {
    // ignore
  }
}

export function setCurrentUserName(name: string) {
  try {
    const trimmed = name.trim()
    if (trimmed) {
      localStorage.setItem(STORAGE_KEY, trimmed)
      emitAuthChanged()
    }
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

export function setCurrentUserEmail(email: string) {
  try {
    const trimmed = email.trim()
    if (trimmed) {
      localStorage.setItem(EMAIL_KEY, trimmed)
      emitAuthChanged()
    }
  } catch {
    // ignore
  }
}

export function getCurrentUserEmail(): string | null {
  try {
    const value = localStorage.getItem(EMAIL_KEY)
    return value?.trim() || null
  } catch {
    return null
  }
}

export function setCurrentUserPhotoUrl(url: string | null) {
  try {
    if (url) localStorage.setItem(PHOTO_URL_KEY, url)
    else localStorage.removeItem(PHOTO_URL_KEY)
    emitAuthChanged()
  } catch {
    // ignore
  }
}

export function getCurrentUserPhotoUrl(): string | null {
  try {
    const value = localStorage.getItem(PHOTO_URL_KEY)
    return value?.trim() || null
  } catch {
    return null
  }
}

export function setToken(token: string) {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token)
      emitAuthChanged()
    }
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
    localStorage.removeItem(EMAIL_KEY)
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(PHOTO_URL_KEY)
    emitAuthChanged()
  } catch {
    // ignore
  }
}

/**
 * Current JWT from localStorage, re-read after login/logout and on cross-tab updates.
 * Prefer this over `useMemo(() => getToken(), [])`, which stays stale if auth changes without a remount.
 */
export function useAuthToken(): string | null {
  const [token, setTokenState] = useState<string | null>(() => getToken())

  useEffect(() => {
    const sync = () => setTokenState(getToken())
    sync()
    if (typeof window === 'undefined') return
    window.addEventListener(AUTH_CHANGED_EVENT, sync)
    const onStorage = (e: StorageEvent) => {
      if (e.key === TOKEN_KEY) sync()
    }
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, sync)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  return token
}

