import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { KeyRound, MonitorSmartphone, ShieldCheck, Trash2 } from 'lucide-react'
import { Card } from '@/components'
import {
  confirmDisableTwoFactor,
  confirmEnableTwoFactor,
  deleteAccount,
  getMe,
  listAuthSessions,
  logoutCurrentSession,
  requestDisableTwoFactor,
  requestEnableTwoFactor,
  revokeAuthSession,
  revokeOtherAuthSessions,
  type AuthSessionInfo,
  type MeResponse,
} from '@/lib/api'
import { clearAuth, getToken } from '@/lib/auth'
import {
  SETTINGS_BTN_PRIMARY_CLASS,
  SETTINGS_BTN_SECONDARY_CLASS,
  SETTINGS_CARD_CLASS,
  SETTINGS_INPUT_CLASS,
  SETTINGS_LABEL_CLASS,
} from '@/lib/settingsFormStyles'
import { ChangePasswordPanel } from '@/pages/settings/ChangePasswordPanel'

function formatAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (Number.isNaN(ms)) return 'Unknown'
  const mins = Math.max(0, Math.round(ms / 60000))
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} hr ago`
  const days = Math.round(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

function sessionLabel(session: AuthSessionInfo): string {
  const ua = (session.user_agent || 'Unknown device').slice(0, 88)
  const ip = session.ip_address ? ` · ${session.ip_address}` : ''
  return `${ua}${ip}`
}

export function SettingsSecurityPage() {
  const navigate = useNavigate()
  const [me, setMe] = useState<MeResponse | null>(null)
  const [sessions, setSessions] = useState<AuthSessionInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [twoFactorStep, setTwoFactorStep] = useState<'idle' | 'enable' | 'disable'>('idle')
  const [twoFactorCode, setTwoFactorCode] = useState('')
  const [twoFactorBusy, setTwoFactorBusy] = useState(false)
  const [twoFactorMsg, setTwoFactorMsg] = useState<string | null>(null)
  const [sessionBusy, setSessionBusy] = useState(false)
  const [deleteEmail, setDeleteEmail] = useState('')
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  async function refresh() {
    const token = getToken()
    if (!token) {
      setError('Sign in to manage security.')
      setLoading(false)
      return
    }
    const [profile, sessionList] = await Promise.all([getMe(token), listAuthSessions(token)])
    setMe(profile)
    setSessions(sessionList)
    setLoading(false)
  }

  useEffect(() => {
    void refresh().catch((err) => {
      setError(err instanceof Error ? err.message : 'Failed to load security settings')
      setLoading(false)
    })
  }, [])

  function noteFromDelivery(delivery?: string | null, devCode?: string | null, fallback?: string) {
    let msg =
      delivery === 'console'
        ? 'Verification code generated. Check the backend console (email is not configured yet).'
        : fallback ?? 'Verification code sent to your email.'
    if (devCode) msg = `${msg} (Dev code: ${devCode})`
    return msg
  }

  async function startEnableTwoFactor() {
    const token = getToken()
    if (!token) return
    setTwoFactorBusy(true)
    setError(null)
    setTwoFactorMsg(null)
    try {
      const resp = await requestEnableTwoFactor(token)
      setTwoFactorStep('enable')
      setTwoFactorMsg(noteFromDelivery(resp.delivery, resp.dev_code))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start two-factor setup')
    } finally {
      setTwoFactorBusy(false)
    }
  }

  async function startDisableTwoFactor() {
    const token = getToken()
    if (!token) return
    setTwoFactorBusy(true)
    setError(null)
    setTwoFactorMsg(null)
    try {
      const resp = await requestDisableTwoFactor(token)
      setTwoFactorStep('disable')
      setTwoFactorMsg(noteFromDelivery(resp.delivery, resp.dev_code, 'Enter the code to turn off two-factor authentication.'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start two-factor disable')
    } finally {
      setTwoFactorBusy(false)
    }
  }

  async function confirmTwoFactor() {
    const token = getToken()
    if (!token) return
    if (!twoFactorCode.trim()) {
      setError('Enter the verification code.')
      return
    }
    setTwoFactorBusy(true)
    setError(null)
    try {
      const next =
        twoFactorStep === 'enable'
          ? await confirmEnableTwoFactor(token, twoFactorCode.trim())
          : await confirmDisableTwoFactor(token, twoFactorCode.trim())
      setMe(next)
      setTwoFactorStep('idle')
      setTwoFactorCode('')
      setTwoFactorMsg(
        next.two_factor_enabled
          ? 'Two-factor authentication is on. You’ll need a code on the next sign-in.'
          : 'Two-factor authentication is off.',
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update two-factor authentication')
    } finally {
      setTwoFactorBusy(false)
    }
  }

  async function signOutSession(session: AuthSessionInfo) {
    const token = getToken()
    if (!token) return
    setSessionBusy(true)
    setError(null)
    try {
      const resp = await revokeAuthSession(token, session.id)
      if (session.current || resp.current) {
        clearAuth()
        navigate('/signin', { replace: true })
        return
      }
      setSessions((prev) => prev.filter((row) => row.id !== session.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign out that session')
    } finally {
      setSessionBusy(false)
    }
  }

  async function signOutOthers() {
    const token = getToken()
    if (!token) return
    setSessionBusy(true)
    setError(null)
    try {
      await revokeOtherAuthSessions(token)
      setSessions((prev) => prev.filter((row) => row.current))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign out other sessions')
    } finally {
      setSessionBusy(false)
    }
  }

  async function signOutThisDevice() {
    const token = getToken()
    if (token) {
      try {
        await logoutCurrentSession(token)
      } catch {
        // still clear locally
      }
    }
    clearAuth()
    navigate('/signin', { replace: true })
  }

  async function handleDeleteAccount() {
    const token = getToken()
    if (!token || !me) return
    setDeleteError(null)
    if (deleteConfirm.trim().toUpperCase() !== 'DELETE') {
      setDeleteError('Type DELETE to confirm.')
      return
    }
    if (deleteEmail.trim().toLowerCase() !== me.email.toLowerCase()) {
      setDeleteError('Email does not match this account.')
      return
    }
    if (me.has_password && !deletePassword) {
      setDeleteError('Enter your password to delete this account.')
      return
    }
    setDeleteBusy(true)
    try {
      await deleteAccount(token, {
        confirmation: 'DELETE',
        email: deleteEmail.trim(),
        password: me.has_password ? deletePassword : undefined,
      })
      clearAuth()
      navigate('/signin', { replace: true })
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Could not delete account')
    } finally {
      setDeleteBusy(false)
    }
  }

  if (loading) {
    return (
      <header className="mb-8">
        <h1 className="text-[22px] font-semibold tracking-[-0.03em] text-app-label">Security</h1>
        <p className="mt-1 text-[13px] text-app-secondary">Loading security settings…</p>
      </header>
    )
  }

  return (
    <>
      <header className="mb-8">
        <h1 className="text-[22px] font-semibold tracking-[-0.03em] text-app-label">Security</h1>
        <p className="mt-1 text-[13px] text-app-secondary">
          Password, two-factor authentication, signed-in devices, and account deletion.
        </p>
      </header>

      {error && (
        <p className="mb-4 rounded-[10px] bg-red-50 px-3 py-2 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      <Card className={SETTINGS_CARD_CLASS}>
        <div className="flex items-start gap-3">
          <KeyRound className="mt-0.5 h-4 w-4 text-app-secondary" />
          <div className="min-w-0 flex-1">
            <h2 className="text-[13px] font-semibold text-app-label">Password</h2>
            <p className="mt-1 text-[13px] text-app-secondary">
              {me?.has_password
                ? 'Change the password used with email sign-in. Other devices will be signed out.'
                : 'This account currently signs in with Google. Set a password if you also want email sign-in.'}
            </p>
            <div className="mt-4">
              <ChangePasswordPanel email={me?.email ?? ''} />
            </div>
          </div>
        </div>
      </Card>

      <Card className={`${SETTINGS_CARD_CLASS} mt-6`}>
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-4 w-4 text-app-secondary" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-[13px] font-semibold text-app-label">Two-factor authentication</h2>
                <p className="mt-1 text-[13px] text-app-secondary">
                  After password or Google sign-in, require a 6-digit code sent to {me?.email ?? 'your email'}.
                </p>
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                  me?.two_factor_enabled
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-app-fill text-app-secondary'
                }`}
              >
                {me?.two_factor_enabled ? 'On' : 'Off'}
              </span>
            </div>
            {twoFactorMsg && <p className="mt-3 text-sm text-emerald-700">{twoFactorMsg}</p>}
            {twoFactorStep === 'idle' ? (
              <button
                type="button"
                onClick={() => void (me?.two_factor_enabled ? startDisableTwoFactor() : startEnableTwoFactor())}
                disabled={twoFactorBusy}
                className={`${SETTINGS_BTN_PRIMARY_CLASS} mt-4`}
              >
                {twoFactorBusy
                  ? 'Working…'
                  : me?.two_factor_enabled
                    ? 'Turn off 2FA'
                    : 'Turn on 2FA'}
              </button>
            ) : (
              <div className="mt-4 space-y-3">
                <label className={SETTINGS_LABEL_CLASS} htmlFor="security-2fa-code">
                  Verification code
                </label>
                <input
                  id="security-2fa-code"
                  className={SETTINGS_INPUT_CLASS}
                  value={twoFactorCode}
                  onChange={(e) => setTwoFactorCode(e.target.value)}
                  placeholder="6-digit code"
                  autoComplete="one-time-code"
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void confirmTwoFactor()}
                    disabled={twoFactorBusy}
                    className={SETTINGS_BTN_PRIMARY_CLASS}
                  >
                    {twoFactorBusy ? 'Confirming…' : 'Confirm'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTwoFactorStep('idle')
                      setTwoFactorCode('')
                    }}
                    className={SETTINGS_BTN_SECONDARY_CLASS}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>

      <Card className={`${SETTINGS_CARD_CLASS} mt-6`}>
        <div className="flex items-start gap-3">
          <MonitorSmartphone className="mt-0.5 h-4 w-4 text-app-secondary" />
          <div className="min-w-0 flex-1">
            <h2 className="text-[13px] font-semibold text-app-label">Signed-in devices</h2>
            <p className="mt-1 text-[13px] text-app-secondary">
              Sessions created after this update appear here. Signing out a device revokes its token immediately.
            </p>
            <ul className="mt-4 divide-y divide-app-separator rounded-[10px] border border-app-separator">
              {sessions.length === 0 ? (
                <li className="px-4 py-3 text-[13px] text-app-secondary">
                  This browser is signed in. Sign out and back in to start tracking this device in the list.
                </li>
              ) : (
                sessions.map((session) => (
                  <li key={session.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-app-label">
                        {session.current ? 'This device' : 'Another device'}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-app-secondary">{sessionLabel(session)}</p>
                      <p className="mt-0.5 text-xs text-app-tertiary">Last active {formatAgo(session.last_seen_at)}</p>
                    </div>
                    <button
                      type="button"
                      disabled={sessionBusy}
                      onClick={() => void signOutSession(session)}
                      className="h-8 rounded-[10px] border border-app-separator px-3 text-xs font-medium text-app-secondary hover:bg-app-fill disabled:opacity-50"
                    >
                      {session.current ? 'Sign out' : 'Revoke'}
                    </button>
                  </li>
                ))
              )}
            </ul>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void signOutOthers()}
                disabled={sessionBusy || sessions.filter((row) => !row.current).length === 0}
                className={SETTINGS_BTN_SECONDARY_CLASS}
              >
                Sign out other devices
              </button>
              <button type="button" onClick={() => void signOutThisDevice()} className={SETTINGS_BTN_SECONDARY_CLASS}>
                Sign out this device
              </button>
            </div>
          </div>
        </div>
      </Card>

      <Card className={`${SETTINGS_CARD_CLASS} mt-6 border-red-200`}>
        <div className="flex items-start gap-3">
          <Trash2 className="mt-0.5 h-4 w-4 text-red-600" />
          <div className="min-w-0 flex-1">
            <h2 className="text-[13px] font-semibold text-app-label">Delete account</h2>
            <p className="mt-1 text-[13px] text-app-secondary">
              Permanently disable this account, revoke every session, and free the email for a new signup.
            </p>
            {deleteError && <p className="mt-3 text-sm text-red-600">{deleteError}</p>}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={SETTINGS_LABEL_CLASS} htmlFor="delete-email">
                  Confirm email
                </label>
                <input
                  id="delete-email"
                  type="email"
                  className={SETTINGS_INPUT_CLASS}
                  value={deleteEmail}
                  onChange={(e) => setDeleteEmail(e.target.value)}
                  placeholder={me?.email}
                />
              </div>
              {me?.has_password && (
                <div className="sm:col-span-2">
                  <label className={SETTINGS_LABEL_CLASS} htmlFor="delete-password">
                    Current password
                  </label>
                  <input
                    id="delete-password"
                    type="password"
                    className={SETTINGS_INPUT_CLASS}
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    autoComplete="current-password"
                  />
                </div>
              )}
              <div className="sm:col-span-2">
                <label className={SETTINGS_LABEL_CLASS} htmlFor="delete-confirm">
                  Type DELETE to confirm
                </label>
                <input
                  id="delete-confirm"
                  className={SETTINGS_INPUT_CLASS}
                  value={deleteConfirm}
                  onChange={(e) => setDeleteConfirm(e.target.value)}
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() => void handleDeleteAccount()}
              disabled={deleteBusy}
              className="mt-4 h-9 rounded-[10px] bg-red-600 px-4 text-[13px] font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {deleteBusy ? 'Deleting…' : 'Delete account'}
            </button>
          </div>
        </div>
      </Card>
    </>
  )
}
