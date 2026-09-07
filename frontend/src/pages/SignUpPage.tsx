import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { setCurrentUserName, setCurrentUserEmail, setCurrentUserPhotoUrl, setToken } from '@/lib/auth'
import { getGoogleLoginUrl, signUp } from '@/lib/api'

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

function deriveNameFromEmail(email: string) {
  const [localPart] = email.split('@')
  if (!localPart) return ''
  const cleaned = localPart.replace(/[._-]+/g, ' ')
  return cleaned
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function SignUpPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    document.title = 'Sign up — Intelligent Research'
  }, [])

  function handleGoogleSignUp() {
    window.location.href = getGoogleLoginUrl()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    setLoading(true)
    try {
      const res = await signUp({ email: email.trim(), password })
      setCurrentUserEmail(email.trim())
      setCurrentUserName(res.display_name ?? deriveNameFromEmail(email.trim()))
      setCurrentUserPhotoUrl(null)
      setToken(res.access_token)
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign up failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="flex min-h-screen items-center justify-center bg-app-bg px-4 py-12">
      <div className="mx-auto w-full max-w-md rounded-[16px] border border-app-separator bg-app-surface p-8 shadow-[0_8px_30px_rgba(0,0,0,0.06)]">
        <h1 className="mb-1 text-[28px] font-semibold tracking-[-0.03em] text-app-label">
          Create an account
        </h1>
        <p className="text-sm text-app-secondary mb-6">
          Get started with Intelligent Research — in minutes.
        </p>

        <button
          type="button"
          onClick={handleGoogleSignUp}
          className="w-full flex items-center justify-center gap-3 px-4 py-2.5 rounded-lg border border-app-separator bg-app-surface text-app-secondary font-medium hover:bg-app-fill focus:outline-none focus:ring-2 focus:ring-offset-app-bg focus:ring-gray-400 transition-colors"
        >
          <GoogleIcon />
          Sign up with Google
        </button>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-app-separator" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-app-surface px-3 text-sm font-medium text-app-secondary">OR</span>
          </div>
        </div>

        <form className="space-y-5" onSubmit={handleSubmit}>
          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg" role="alert">
              {error}
            </p>
          )}
          <div className="space-y-2">
            <label htmlFor="signup-email" className="block text-sm font-medium text-app-secondary">
              Email
            </label>
            <input
              id="signup-email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-2.5 rounded-lg border border-app-separator bg-app-surface text-app-label placeholder:text-app-tertiary focus:outline-none focus:ring-2 focus:ring-offset-app-bg focus:ring-blue-500 focus:border-app-accent transition-colors"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="signup-password" className="block text-sm font-medium text-app-secondary">
              Password
            </label>
            <input
              id="signup-password"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-4 py-2.5 rounded-lg border border-app-separator bg-app-surface text-app-label placeholder:text-app-tertiary focus:outline-none focus:ring-2 focus:ring-offset-app-bg focus:ring-blue-500 focus:border-app-accent transition-colors"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="signup-confirm" className="block text-sm font-medium text-app-secondary">
              Confirm password
            </label>
            <input
              id="signup-confirm"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="w-full px-4 py-2.5 rounded-lg border border-app-separator bg-app-surface text-app-label placeholder:text-app-tertiary focus:outline-none focus:ring-2 focus:ring-offset-app-bg focus:ring-blue-500 focus:border-app-accent transition-colors"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full px-5 py-2.5 rounded-lg font-semibold text-white bg-app-accent hover:bg-app-accent-hover focus:outline-none focus:ring-2 focus:ring-offset-app-bg focus:ring-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating account...' : 'Create account'}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-app-secondary">
          Already have an account?{' '}
          <Link to="/signin" className="font-semibold text-app-accent hover:text-app-accent hover:underline focus:outline-none focus:ring-2 focus:ring-app-accent focus:ring-offset-app-bg rounded">
            Sign in
          </Link>
        </p>
      </div>
    </section>
  )
}
