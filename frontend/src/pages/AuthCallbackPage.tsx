import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  consumePostAuthRedirect,
  setCurrentUserEmail,
  setCurrentUserName,
  setCurrentUserPhotoUrl,
  setToken,
  stashTwoFactorChallenge,
} from '@/lib/auth'
import { exchangeAuthCode, getMe } from '@/lib/api'

export function AuthCallbackPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const code = searchParams.get('code')
  const legacyToken = searchParams.get('token')
  const displayName = searchParams.get('display_name')
  const email = searchParams.get('email')
  const error = searchParams.get('error')
  const next = searchParams.get('next')

  useEffect(() => {
    let cancelled = false

    async function completeAuth() {
      if (error) {
        navigate('/signin?error=' + encodeURIComponent(error), { replace: true })
        return
      }

      try {
        if (code) {
          const res = await exchangeAuthCode(code)
          if (cancelled) return
          if (res.requires_2fa && res.two_factor_token) {
            stashTwoFactorChallenge(res.two_factor_token)
            navigate('/signin?verify=1', { replace: true })
            return
          }
          if (!res.access_token) {
            navigate('/signin?error=exchange_failed', { replace: true })
            return
          }
          if (res.email) setCurrentUserEmail(res.email)
          if (res.display_name) setCurrentUserName(res.display_name)
          setToken(res.access_token)
          getMe(res.access_token)
            .then((me) => setCurrentUserPhotoUrl(me.profile_photo_url ?? null))
            .catch(() => {
              // ignore
            })
          navigate(consumePostAuthRedirect(next), { replace: true })
          return
        }

        if (legacyToken) {
          if (email) setCurrentUserEmail(email)
          if (displayName) setCurrentUserName(displayName)
          setToken(legacyToken)
          getMe(legacyToken)
            .then((me) => setCurrentUserPhotoUrl(me.profile_photo_url ?? null))
            .catch(() => {
              // ignore
            })
          navigate(consumePostAuthRedirect(next), { replace: true })
          return
        }

        navigate('/signin', { replace: true })
      } catch {
        if (!cancelled) navigate('/signin?error=exchange_failed', { replace: true })
      }
    }

    void completeAuth()
    return () => {
      cancelled = true
    }
  }, [code, legacyToken, displayName, email, error, next, navigate])

  return (
    <div className="flex min-h-screen items-center justify-center bg-app-bg text-[13px] text-app-secondary">
      Signing you in...
    </div>
  )
}
