import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { setCurrentUserName, setCurrentUserEmail, setCurrentUserPhotoUrl, setToken } from '@/lib/auth'
import { getGoogleLoginUrl, getMe, signIn } from '@/lib/api'

function GoogleIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  )
}

function EnvelopeIcon() {
  return (
    <svg className="w-5 h-5 text-app-tertiary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  )
}

export function SignInPage() {
  const [step, setStep] = useState<'email' | 'password'>('email')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  useEffect(() => {
    document.title = 'Sign in — Intelligent Research'
  }, [])

  useEffect(() => {
    const err = searchParams.get('error')
    if (err) setError(err === 'google_denied' ? 'Google sign-in was cancelled or failed.' : 'Something went wrong.')
  }, [searchParams])

  function handleGoogleSignIn() {
    window.location.href = getGoogleLoginUrl()
  }

  function handleContinue(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (email.trim()) setStep('password')
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await signIn({ email: email.trim(), password })
      // Bind workspace owner before token so scoped storage keys never read another user's cache.
      setCurrentUserEmail(email.trim())
      setCurrentUserName(res.display_name)
      setToken(res.access_token)
      // Fetch profile photo right after login so navbar can show it
      getMe(res.access_token)
        .then((me) => setCurrentUserPhotoUrl(me.profile_photo_url ?? null))
        .catch(() => {
          // ignore
        })
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="flex min-h-screen items-center justify-center bg-app-bg px-4 py-12">
      <div className="mx-auto w-full max-w-md rounded-[16px] border border-app-separator bg-app-surface p-8 shadow-[0_8px_30px_rgba(0,0,0,0.06)]">
        <h1 className="mb-1 text-[28px] font-semibold tracking-[-0.03em] text-app-label">
          Welcome back
        </h1>
        <p className="mb-6 text-[13px] text-app-secondary">
          {step === 'email'
            ? 'Sign in to continue researching parts and vendors.'
            : 'Enter your password to sign in.'}
        </p>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg mb-4" role="alert">
            {error}
          </p>
        )}
        {step === 'email' ? (
          <>
            <button
              type="button"
              onClick={handleGoogleSignIn}
              className="flex w-full items-center justify-center gap-3 rounded-[10px] border border-app-separator bg-app-surface px-4 py-2.5 font-medium text-app-label transition-colors hover:bg-app-fill focus:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/40"
            >
              <GoogleIcon />
              Sign in with Google
            </button>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-app-separator" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-app-surface px-3 text-sm font-medium text-app-secondary">OR</span>
              </div>
            </div>

            <form className="space-y-4" onSubmit={handleContinue}>
              <div className="space-y-1.5">
                <label htmlFor="signin-email" className="block text-[13px] font-medium text-app-label">
                  Email
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <EnvelopeIcon />
                  </div>
                  <input
                    id="signin-email"
                    type="email"
                    autoComplete="email"
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-[10px] border border-app-separator bg-app-surface py-2.5 pl-10 pr-4 text-[13px] text-app-label placeholder:text-app-tertiary focus:border-app-accent focus:outline-none focus:ring-2 focus:ring-app-accent/30"
                  />
                </div>
              </div>
              <button
                type="submit"
                className="w-full rounded-[10px] bg-app-accent px-5 py-2.5 font-semibold text-white transition-colors hover:bg-app-accent-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/40 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Continue
              </button>
            </form>
          </>
        ) : (
          <form className="space-y-5" onSubmit={handleSignIn}>
            <div className="space-y-2">
              <label htmlFor="signin-email-show" className="block text-sm font-medium text-app-secondary">
                Email
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="signin-email-show"
                  type="email"
                  readOnly
                  value={email}
                  className="w-full px-4 py-2.5 rounded-lg border border-app-separator bg-app-fill text-app-secondary"
                />
                <button
                  type="button"
                  onClick={() => setStep('email')}
                  className="text-sm font-medium text-app-secondary hover:text-app-label whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-app-bg rounded"
                >
                  Change
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <label htmlFor="signin-password" className="block text-sm font-medium text-app-secondary">
                Password
              </label>
              <input
                id="signin-password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-2.5 rounded-lg border border-app-separator bg-app-surface text-app-label placeholder:text-app-tertiary focus:outline-none focus:ring-2 focus:ring-offset-app-bg focus:ring-blue-500 focus:border-transparent transition-colors"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-[10px] bg-app-accent px-5 py-2.5 font-semibold text-white transition-colors hover:bg-app-accent-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/40 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-app-secondary">
          Don&apos;t have an account?{' '}
          <Link to="/signup" className="font-semibold text-app-accent hover:text-app-accent hover:underline focus:outline-none focus:ring-2 focus:ring-app-accent focus:ring-offset-app-bg rounded">
            Sign up
          </Link>
        </p>
      </div>
    </section>
  )
}
