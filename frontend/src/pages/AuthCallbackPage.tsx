import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { setCurrentUserEmail, setCurrentUserName, setCurrentUserPhotoUrl, setToken } from '@/lib/auth'
import { exchangeGoogleCode, getMe, verifyLoginTotp } from '@/lib/api'

export function AuthCallbackPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const code = searchParams.get('code')
  const error = searchParams.get('error')
  const [totpNeeded, setTotpNeeded] = useState(false)
  const [pendingToken, setPendingToken] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('Signing you in...')

  const exchanged = useRef(false)

  useEffect(() => {
    if (error) {
      navigate('/signin?error=' + encodeURIComponent(error), { replace: true })
      return
    }
    if (!code) {
      navigate('/signin?error=missing_code', { replace: true })
      return
    }
    if (exchanged.current) return
    exchanged.current = true
    let cancelled = false
    exchangeGoogleCode(code)
      .then(async (res) => {
        if (cancelled) return
        if (res.requires_2fa && res.pending_token) {
          setPendingToken(res.pending_token)
          setTotpNeeded(true)
          setMessage('Enter your authenticator code to finish signing in.')
          return
        }
        if (!res.access_token) {
          navigate('/signin?error=no_token', { replace: true })
          return
        }
        if (res.email) setCurrentUserEmail(res.email)
        if (res.display_name) setCurrentUserName(res.display_name)
        setToken(res.access_token)
        try {
          const me = await getMe(res.access_token)
          setCurrentUserEmail(me.email)
          if (me.display_name) setCurrentUserName(me.display_name)
          setCurrentUserPhotoUrl(me.profile_photo_url ?? null)
        } catch {
          // navbar will fall back to letter avatar
        }
        navigate('/', { replace: true })
      })
      .catch(() => {
        if (!cancelled) navigate('/signin?error=google_denied', { replace: true })
      })
    return () => {
      cancelled = true
    }
  }, [code, error, navigate])

  async function handleTotp(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      const res = await verifyLoginTotp({ pending_token: pendingToken, code: totpCode.trim() })
      if (!res.access_token) throw new Error('Sign in failed')
      if (res.email) setCurrentUserEmail(res.email)
      if (res.display_name) setCurrentUserName(res.display_name)
      setToken(res.access_token)
      const me = await getMe(res.access_token)
      setCurrentUserEmail(me.email)
      if (me.display_name) setCurrentUserName(me.display_name)
      setCurrentUserPhotoUrl(me.profile_photo_url ?? null)
      navigate('/', { replace: true })
    } catch {
      setMessage('Invalid authenticator code. Try again.')
    } finally {
      setBusy(false)
    }
  }

  if (totpNeeded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-app-bg px-4">
        <form onSubmit={handleTotp} className="w-full max-w-sm rounded-[16px] border border-app-separator bg-app-surface p-6">
          <h1 className="text-lg font-semibold text-app-label">Two-factor authentication</h1>
          <p className="mt-1 text-sm text-app-secondary">{message}</p>
          <input
            className="mt-4 w-full rounded-[10px] border border-app-separator px-3 py-2.5 text-[13px]"
            value={totpCode}
            onChange={(e) => setTotpCode(e.target.value)}
            placeholder="6-digit code"
            autoComplete="one-time-code"
          />
          <button
            type="submit"
            disabled={busy}
            className="mt-4 w-full rounded-[10px] bg-app-accent px-4 py-2.5 font-semibold text-white disabled:opacity-50"
          >
            {busy ? 'Verifying…' : 'Continue'}
          </button>
        </form>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-app-bg text-[13px] text-app-secondary">
      Signing you in...
    </div>
  )
}
