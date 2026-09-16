import type { ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthToken } from '@/lib/auth'

/** Redirects unauthenticated visitors to sign-in. */
export function RequireAuth() {
  const token = useAuthToken()
  const location = useLocation()
  if (!token) {
    const next = `${location.pathname}${location.search}`
    const to = next && next !== '/' ? `/signin?next=${encodeURIComponent(next)}` : '/signin'
    return <Navigate to={to} replace />
  }
  return <Outlet />
}

/** Sends signed-in users away from auth screens. */
export function RedirectIfAuthenticated({ children }: { children: ReactNode }) {
  const token = useAuthToken()
  if (token) return <Navigate to="/" replace />
  return children
}
