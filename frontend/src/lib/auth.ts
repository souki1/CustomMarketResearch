const STORAGE_KEY = 'cmr_display_name'

export function setCurrentUserName(name: string) {
  try {
    const trimmed = name.trim()
    if (trimmed) {
      localStorage.setItem(STORAGE_KEY, trimmed)
    }
  } catch {
    // ignore storage errors
  }
}

export function getCurrentUserName(): string | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    if (!value) return null
    const trimmed = value.trim()
    return trimmed || null
  } catch {
    return null
  }
}

