import { useEffect, useState } from 'react'

const STORAGE_KEY = 'cmr_display_name'
const EMAIL_KEY = 'cmr_email'
const TOKEN_KEY = 'cmr_token'
const PHOTO_URL_KEY = 'cmr_profile_photo_url'
const WORKSPACE_OWNER_KEY = 'cmr_workspace_owner'

/** Same key used in `storage` events for cross-tab token sync */
export { TOKEN_KEY as AUTH_TOKEN_STORAGE_KEY }

export const AUTH_CHANGED_EVENT = 'cmr-auth-changed'
/** Fired when workspace caches must reset (logout or account switch). */
export const WORKSPACE_RESET_EVENT = 'cmr-workspace-reset'

/** Shared (legacy) keys that stored research/compare data without a user scope — cross-user leak source. */
const LEGACY_WORKSPACE_LOCAL_KEYS = [
  'research-tabs',
  'research-page-state',
  'ir-research-locations-v1',
  'ir-compare-page-state-v1',
  'ir-compare-vendor-coverage-view',
  'ir-wishlist-board-lists',
  'ir-wishlist-board-statuses',
  'ir-wishlist-groups-v1',
  'cmr_profile_draft',
  'ir_last_file_id',
  'ir_last_file_name',
  'ir_last_file_folder',
] as const

const LEGACY_WORKSPACE_SESSION_KEYS = [
  'cmr_bucket_items',
  'ir-compare-nav-source',
  'ir-portfolio-report-context-v1',
  'ir-wishlist-catalog-cache-v1',
] as const

function emitAuthChanged() {
  try {
    if (typeof window === 'undefined') return
    window.dispatchEvent(new Event(AUTH_CHANGED_EVENT))
  } catch {
    // ignore
  }
}

function emitWorkspaceReset() {
  try {
    if (typeof window === 'undefined') return
    window.dispatchEvent(new Event(WORKSPACE_RESET_EVENT))
  } catch {
    // ignore
  }
}

function normalizeEmail(email: string | null | undefined): string | null {
  const trimmed = email?.trim().toLowerCase()
  return trimmed || null
}

/**
 * Scope local/session storage keys to the signed-in user so User B never
 * hydrates User A's research sheets / compare tabs from the same browser.
 */
export function workspaceStorageKey(baseKey: string): string {
  const email = normalizeEmail(getCurrentUserEmail())
  return email ? `${baseKey}::${email}` : `${baseKey}::__anon__`
}

/** Remove legacy unscoped workspace caches (and current user's scoped copies on logout). */
export function clearUserWorkspaceCache(options?: { includeScopedForEmail?: string | null }) {
  try {
    for (const key of LEGACY_WORKSPACE_LOCAL_KEYS) {
      localStorage.removeItem(key)
    }
    for (const key of LEGACY_WORKSPACE_SESSION_KEYS) {
      sessionStorage.removeItem(key)
    }
    const email = normalizeEmail(options?.includeScopedForEmail ?? getCurrentUserEmail())
    if (email) {
      for (const key of LEGACY_WORKSPACE_LOCAL_KEYS) {
        localStorage.removeItem(`${key}::${email}`)
      }
      for (const key of LEGACY_WORKSPACE_SESSION_KEYS) {
        sessionStorage.removeItem(`${key}::${email}`)
      }
    }
    // Drop any leftover anon-scoped keys
    for (const key of LEGACY_WORKSPACE_LOCAL_KEYS) {
      localStorage.removeItem(`${key}::__anon__`)
    }
    for (const key of LEGACY_WORKSPACE_SESSION_KEYS) {
      sessionStorage.removeItem(`${key}::__anon__`)
    }
  } catch {
    // ignore
  }
}

/**
 * Bind workspace cache to the active user. If the account changes, wipe legacy
 * unscoped caches so the previous user's sheet data cannot surface.
 */
export function syncWorkspaceOwner(email: string | null | undefined) {
  try {
    const next = normalizeEmail(email)
    const prev = normalizeEmail(localStorage.getItem(WORKSPACE_OWNER_KEY))
    let didReset = false
    if (prev && next && prev !== next) {
      // Switch accounts in the same browser: drop unscoped leftovers.
      // Scoped keys for `prev` stay so they can restore on next login as that user.
      for (const key of LEGACY_WORKSPACE_LOCAL_KEYS) {
        localStorage.removeItem(key)
      }
      for (const key of LEGACY_WORKSPACE_SESSION_KEYS) {
        sessionStorage.removeItem(key)
      }
      // Clear previous user's session-only caches (bucket, etc.)
      for (const key of LEGACY_WORKSPACE_SESSION_KEYS) {
        sessionStorage.removeItem(`${key}::${prev}`)
      }
      didReset = true
    } else if (!prev && next) {
      // First bind after deploy / after logout: never adopt legacy unscoped data.
      for (const key of LEGACY_WORKSPACE_LOCAL_KEYS) {
        localStorage.removeItem(key)
      }
      for (const key of LEGACY_WORKSPACE_SESSION_KEYS) {
        sessionStorage.removeItem(key)
      }
      didReset = true
    }
    if (next) localStorage.setItem(WORKSPACE_OWNER_KEY, next)
    else localStorage.removeItem(WORKSPACE_OWNER_KEY)
    if (didReset) emitWorkspaceReset()
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
      syncWorkspaceOwner(trimmed)
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
    const email = getCurrentUserEmail()
    // Drop legacy unscoped caches (cross-user leak) + session caches (bucket).
    // Keep per-email localStorage research/compare keys so the same user can
    // restore their UI on next login; other users never read those keys.
    for (const key of LEGACY_WORKSPACE_LOCAL_KEYS) {
      localStorage.removeItem(key)
    }
    for (const key of LEGACY_WORKSPACE_SESSION_KEYS) {
      sessionStorage.removeItem(key)
      if (email) sessionStorage.removeItem(`${key}::${email.trim().toLowerCase()}`)
      sessionStorage.removeItem(`${key}::__anon__`)
    }
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(EMAIL_KEY)
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(PHOTO_URL_KEY)
    localStorage.removeItem(WORKSPACE_OWNER_KEY)
    emitWorkspaceReset()
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

const POST_AUTH_REDIRECT_KEY = 'cmr_post_auth_redirect'
const TWO_FACTOR_PENDING_KEY = 'cmr_2fa_pending'
const AUTH_PUBLIC_PATHS = new Set(['/signin', '/signup', '/auth/callback'])
const DEFAULT_AFTER_AUTH_PATH = '/'

function decodeJwtPayload(token: string): { exp?: unknown } | null {
  const parts = token.split('.')
  if (parts.length !== 3 || !parts[1]) return null
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
    return JSON.parse(atob(padded)) as { exp?: unknown }
  } catch {
    return null
  }
}

/** Client-side expiry check for UX only. The API still verifies the signature. */
export function isJwtExpired(token: string, skewSeconds = 10): boolean {
  const payload = decodeJwtPayload(token)
  if (typeof payload?.exp !== 'number') return true
  return payload.exp * 1000 <= Date.now() + skewSeconds * 1000
}

export function hasValidSession(token: string | null = getToken()): boolean {
  if (!token?.trim()) return false
  return !isJwtExpired(token)
}

export function isAuthenticated(): boolean {
  return hasValidSession()
}

/** Allow only in-app relative paths. Blocks protocol-relative and external URLs. */
export function sanitizeAppPath(raw: string | null | undefined): string | null {
  if (!raw) return null
  let path = raw.trim()
  if (!path) return null
  try {
    path = decodeURIComponent(path)
  } catch {
    return null
  }
  if (path.length > 2048) return null
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('://') || path.includes('\\')) {
    return null
  }
  if (/[\u0000-\u001F]/.test(path)) return null
  const pathname = path.split('?')[0]?.split('#')[0] ?? ''
  if (!pathname || AUTH_PUBLIC_PATHS.has(pathname)) return null
  if (pathname.startsWith('/signin') || pathname.startsWith('/signup') || pathname.startsWith('/auth/')) {
    return null
  }
  return path
}

export function signInHref(next?: string | null): string {
  const safe = sanitizeAppPath(next)
  if (!safe || safe === DEFAULT_AFTER_AUTH_PATH) return '/signin'
  return `/signin?next=${encodeURIComponent(safe)}`
}

export function authEntryHref(path: '/signin' | '/signup', next?: string | null): string {
  const safe = sanitizeAppPath(next)
  if (!safe) return path
  return `${path}?next=${encodeURIComponent(safe)}`
}

export function buildSignInHref(from: { pathname: string; search: string; hash: string }): string {
  return signInHref(`${from.pathname}${from.search}${from.hash}`)
}

export function rememberPostAuthRedirect(next?: string | null) {
  const safe = sanitizeAppPath(next)
  try {
    if (safe) sessionStorage.setItem(POST_AUTH_REDIRECT_KEY, safe)
    else sessionStorage.removeItem(POST_AUTH_REDIRECT_KEY)
  } catch {
    // ignore
  }
}

export function consumePostAuthRedirect(explicitNext?: string | null): string {
  const fromQuery = sanitizeAppPath(explicitNext)
  let stored: string | null = null
  try {
    stored = sanitizeAppPath(sessionStorage.getItem(POST_AUTH_REDIRECT_KEY))
    sessionStorage.removeItem(POST_AUTH_REDIRECT_KEY)
  } catch {
    stored = null
  }
  return fromQuery ?? stored ?? DEFAULT_AFTER_AUTH_PATH
}

export function stashTwoFactorChallenge(token: string) {
  try {
    sessionStorage.setItem(TWO_FACTOR_PENDING_KEY, token)
  } catch {
    // ignore
  }
}

export function peekTwoFactorChallenge(): string | null {
  try {
    return sessionStorage.getItem(TWO_FACTOR_PENDING_KEY)
  } catch {
    return null
  }
}

export function clearTwoFactorChallenge() {
  try {
    sessionStorage.removeItem(TWO_FACTOR_PENDING_KEY)
  } catch {
    // ignore
  }
}

/** Drop an expired JWT so guests never keep a dead session in storage. */
export function dropExpiredSession() {
  const token = getToken()
  if (token && isJwtExpired(token)) clearAuth()
}

/** Clear a rejected/expired session and send the user to sign-in so in-memory state cannot leak. */
export function handleUnauthorizedSession() {
  if (!getToken()) return
  if (typeof window === 'undefined') {
    clearAuth()
    return
  }
  const pathname = window.location.pathname
  const onAuthPage =
    pathname === '/signin' || pathname === '/signup' || pathname.startsWith('/auth/')
  const next = sanitizeAppPath(`${pathname}${window.location.search}${window.location.hash}`)
  rememberPostAuthRedirect(next)
  clearAuth()
  if (onAuthPage) return
  window.location.replace(signInHref(next))
}
