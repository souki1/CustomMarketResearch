import { useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import {
  buildSignInHref,
  dropExpiredSession,
  hasValidSession,
  isJwtExpired,
  sanitizeAppPath,
  useAuthToken,
} from '@/lib/auth'

/** App shell and feature routes. Guests are sent to sign-in with a return path. */
export function RequireAuth() {
  const token = useAuthToken()
  const location = useLocation()
  const allowed = hasValidSession(token)

  useEffect(() => {
    if (token && isJwtExpired(token)) dropExpiredSession()
  }, [token])

  if (!allowed) {
    return <Navigate to={buildSignInHref(location)} replace />
  }

  return <Outlet />
}

/**
 * Sign-in / sign-up. Only bounce users who arrived already signed in.
 * Do not redirect after a login on this page — the form owns that navigation
 * so a return URL in session storage is not overwritten.
 */
export function GuestOnly() {
  const token = useAuthToken()
  const location = useLocation()
  const [arrivedSignedIn] = useState(() => hasValidSession())

  if (arrivedSignedIn && hasValidSession(token)) {
    const next = new URLSearchParams(location.search).get('next')
    return <Navigate to={sanitizeAppPath(next) ?? '/'} replace />
  }

  return <Outlet />
}

/** Unknown URLs: guests sign in, signed-in users go to the dashboard. */
export function FallbackRoute() {
  const token = useAuthToken()
  const location = useLocation()
  if (!hasValidSession(token)) {
    return <Navigate to={buildSignInHref(location)} replace />
  }
  return <Navigate to="/" replace />
}
