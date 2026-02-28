import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

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
    <svg className="w-5 h-5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  )
}

export function SignInPage() {
  const [step, setStep] = useState<'email' | 'password'>('email')
  const [email, setEmail] = useState('')
  const navigate = useNavigate()

  function handleContinue(e: React.FormEvent) {
    e.preventDefault()
    if (email.trim()) setStep('password')
  }

  function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    navigate('/')
  }

  return (
    <section className="min-h-screen flex items-center justify-center py-12 px-4">
      <div className="w-full max-w-md mx-auto bg-white rounded-2xl shadow-lg border border-gray-200/80 p-8">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 mb-1">
          Welcome back!
        </h1>
        <p className="text-sm text-gray-600 mb-6">
          {step === 'email'
            ? 'Use Intelligent Research to turn any growth idea into reality — in minutes.'
            : 'Enter your password to sign in.'}
        </p>

        {step === 'email' ? (
          <>
            <button
              type="button"
              className="w-full flex items-center justify-center gap-3 px-4 py-2.5 rounded-lg border border-gray-300 bg-white text-gray-700 font-medium hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400 transition-colors"
            >
              <GoogleIcon />
              Sign in with Google
            </button>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-white px-3 text-sm font-medium text-gray-500">OR</span>
              </div>
            </div>

            <form className="space-y-4" onSubmit={handleContinue}>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <EnvelopeIcon />
                </div>
                <input
                  id="signin-email"
                  type="email"
                  autoComplete="email"
                  placeholder="Email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-300 bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                />
              </div>
              <button
                type="submit"
                className="w-full px-5 py-2.5 rounded-lg font-semibold text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Continue
              </button>
            </form>
          </>
        ) : (
          <form className="space-y-5" onSubmit={handleSignIn}>
            <div className="space-y-2">
              <label htmlFor="signin-email-show" className="block text-sm font-medium text-gray-700">
                Email
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="signin-email-show"
                  type="email"
                  readOnly
                  value={email}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-gray-700"
                />
                <button
                  type="button"
                  onClick={() => setStep('email')}
                  className="text-sm font-medium text-gray-600 hover:text-gray-900 whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 rounded"
                >
                  Change
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <label htmlFor="signin-password" className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <input
                id="signin-password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 focus:border-transparent transition-colors"
              />
            </div>
            <button
              type="submit"
              className="w-full px-5 py-2.5 rounded-lg font-semibold text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Sign in
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-gray-600">
          Don&apos;t have an account?{' '}
          <Link to="/signup" className="font-semibold text-blue-600 hover:text-blue-700 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded">
            Sign up
          </Link>
        </p>
      </div>
    </section>
  )
}
