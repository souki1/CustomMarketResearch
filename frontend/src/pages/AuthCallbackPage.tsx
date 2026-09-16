import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { setCurrentUserEmail, setCurrentUserName, setCurrentUserPhotoUrl } from '@/lib/auth'
import { exchangeGoogleCode, getMe } from '@/lib/api'

export function AuthCallbackPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const code = searchParams.get('code')
  const error = searchParams.get('error')
  const [status, setStatus] = useState('Signing you in...')

  useEffect(() => {
    let cancelled = false
    async function finish() {
      if (error) {
        navigate('/signin?error=' + encodeURIComponent(error), { replace: true })
        return
      }
      if (!code) {
        navigate('/signin?error=missing_code', { replace: true })
        return
      }
      try {
        const res = await exchangeGoogleCode(code)
        if (cancelled) return
        if (res.display_name) setCurrentUserName(res.display_name)
        const me = await getMe(res.access_token)
        if (cancelled) return
        if (me.email) setCurrentUserEmail(me.email)
        setCurrentUserPhotoUrl(me.profile_photo_url ?? null)
        navigate('/', { replace: true })
      } catch {
        if (!cancelled) {
          setStatus('Sign-in failed')
          navigate('/signin?error=google_denied', { replace: true })
        }
      }
    }
    void finish()
    return () => {
      cancelled = true
    }
  }, [code, error, navigate])

  return (
    <div className="flex min-h-screen items-center justify-center bg-app-bg text-[13px] text-app-secondary">
      {status}
    </div>
  )
}
