import { useEffect, useState } from 'react'
import {
  KeyRound,
  MonitorSmartphone,
  ShieldCheck,
  Trash2,
} from 'lucide-react'
import { Card } from '@/components'
import {
  createApiKey,
  deleteAccount,
  disableTotp,
  enableTotp,
  getMe,
  listApiKeys,
  listAuditEvents,
  listAuthSessions,
  logoutAllOtherSessions,
  revokeApiKey,
  revokeAuthSession,
  setupTotp,
  type ApiKeyInfo,
  type AuditEventInfo,
  type AuthSessionInfo,
  type CreatedApiKey,
} from '@/lib/api'
import { clearAuth, getToken } from '@/lib/auth'
import {
  SETTINGS_BTN_PRIMARY_CLASS,
  SETTINGS_BTN_SECONDARY_CLASS,
  SETTINGS_CARD_CLASS,
  SETTINGS_INPUT_CLASS,
  SETTINGS_LABEL_CLASS,
} from '@/lib/settingsFormStyles'

function formatWhen(value: string | null | undefined): string {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleString()
  } catch {
    return value
  }
}

function deviceLabel(userAgent: string | null): string {
  if (!userAgent) return 'Unknown device'
  if (/Edg\//.test(userAgent)) return 'Microsoft Edge'
  if (/Chrome\//.test(userAgent)) return 'Chrome'
  if (/Firefox\//.test(userAgent)) return 'Firefox'
  if (/Safari\//.test(userAgent)) return 'Safari'
  return userAgent.slice(0, 80)
}

function safeQrSvg(svg: string): string | null {
  if (!svg.includes('<svg') || /<script/i.test(svg) || /on\w+=/i.test(svg)) return null
  return svg
}

const AUDIT_LABELS: Record<string, string> = {
  login: 'Signed in',
  logout: 'Signed out',
  logout_all: 'Signed out other sessions',
  signup: 'Account created',
  login_failed: 'Failed sign-in',
  login_lockout: 'Account locked after failed sign-ins',
  login_2fa_challenge: 'Asked for authenticator code',
  login_2fa_failed: 'Invalid authenticator code',
  password_change: 'Password changed',
  session_revoke: 'Session revoked',
  '2fa_setup': 'Started 2FA setup',
  '2fa_enable': 'Enabled 2FA',
  '2fa_disable': 'Disabled 2FA',
  api_key_create: 'Created API key',
  api_key_revoke: 'Revoked API key',
  account_delete: 'Deleted account',
  profile_update: 'Updated profile',
  company_update: 'Updated company profile',
  notifications_update: 'Updated notifications',
  google_callback: 'Google sign-in',
}

export function SettingsSecurityPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [totpEnabled, setTotpEnabled] = useState(false)
  const [hasPassword, setHasPassword] = useState(true)
  const [sessions, setSessions] = useState<AuthSessionInfo[]>([])
  const [apiKeys, setApiKeys] = useState<ApiKeyInfo[]>([])
  const [audit, setAudit] = useState<AuditEventInfo[]>([])

  const [totpSetup, setTotpSetup] = useState<{ qr_svg: string; secret: string } | null>(null)
  const [totpCode, setTotpCode] = useState('')
  const [totpPassword, setTotpPassword] = useState('')
  const [totpBusy, setTotpBusy] = useState(false)

  const [newKeyName, setNewKeyName] = useState('')
  const [createdKey, setCreatedKey] = useState<CreatedApiKey | null>(null)
  const [keyBusy, setKeyBusy] = useState(false)

  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteBusy, setDeleteBusy] = useState(false)

  const reload = async () => {
    const token = getToken()
    if (!token) {
      setError('Sign in to manage security.')
      setLoading(false)
      return
    }
    const [me, nextSessions, keys, events] = await Promise.all([
      getMe(token),
      listAuthSessions(),
      listApiKeys(),
      listAuditEvents(),
    ])
    setTotpEnabled(Boolean(me.totp_enabled))
    setHasPassword(me.has_password !== false)
    setSessions(nextSessions)
    setApiKeys(keys)
    setAudit(events)
    setError(null)
  }

  useEffect(() => {
    reload()
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load security settings'))
      .finally(() => setLoading(false))
  }, [])

  const startTotp = async () => {
    setTotpBusy(true)
    setError(null)
    try {
      const setup = await setupTotp()
      setTotpSetup({ qr_svg: setup.qr_svg, secret: setup.secret })
      setTotpCode('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start 2FA setup')
    } finally {
      setTotpBusy(false)
    }
  }

  const confirmTotp = async () => {
    setTotpBusy(true)
    setError(null)
    try {
      await enableTotp(totpCode.trim())
      setTotpSetup(null)
      setTotpCode('')
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not enable 2FA')
    } finally {
      setTotpBusy(false)
    }
  }

  const turnOffTotp = async () => {
    setTotpBusy(true)
    setError(null)
    try {
      await disableTotp({
        code: totpCode.trim(),
        password: hasPassword ? totpPassword : undefined,
      })
      setTotpCode('')
      setTotpPassword('')
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not disable 2FA')
    } finally {
      setTotpBusy(false)
    }
  }

  const handleCreateKey = async () => {
    const name = newKeyName.trim()
    if (!name) {
      setError('Enter a name for the API key.')
      return
    }
    setKeyBusy(true)
    setError(null)
    try {
      const created = await createApiKey(name)
      setCreatedKey(created)
      setNewKeyName('')
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create API key')
    } finally {
      setKeyBusy(false)
    }
  }

  const handleDeleteAccount = async () => {
    if (deleteConfirm !== 'DELETE') {
      setError('Type DELETE to confirm account deletion.')
      return
    }
    setDeleteBusy(true)
    setError(null)
    try {
      await deleteAccount({
        confirmation: 'DELETE',
        password: hasPassword ? deletePassword : undefined,
      })
      clearAuth()
      window.location.assign('/signin')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete account')
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

  const qr = totpSetup ? safeQrSvg(totpSetup.qr_svg) : null

  return (
    <>
      <header className="mb-8">
        <h1 className="text-[22px] font-semibold tracking-[-0.03em] text-app-label">Security</h1>
        <p className="mt-1 text-[13px] text-app-secondary">
          Manage sessions, two-factor authentication, API keys, and account deletion.
        </p>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </header>

      <Card className={SETTINGS_CARD_CLASS}>
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 text-app-accent" />
          <div className="min-w-0 flex-1">
            <h2 className="text-[13px] font-semibold text-app-label">Two-factor authentication</h2>
            <p className="mt-1 text-[13px] text-app-secondary">
              {totpEnabled
                ? 'Authenticator app verification is on for this account.'
                : 'Require an authenticator code in addition to your password.'}
            </p>
            {!totpEnabled && !totpSetup && (
              <button
                type="button"
                className={`${SETTINGS_BTN_PRIMARY_CLASS} mt-4`}
                onClick={() => void startTotp()}
                disabled={totpBusy}
              >
                {totpBusy ? 'Starting…' : 'Enable 2FA'}
              </button>
            )}
            {totpSetup && (
              <div className="mt-4 space-y-3">
                {qr ? (
                  <div
                    className="w-40 rounded-lg border border-app-separator bg-white p-2"
                    dangerouslySetInnerHTML={{ __html: qr }}
                  />
                ) : null}
                <p className="break-all text-xs text-app-secondary">
                  Secret: <span className="font-mono text-app-label">{totpSetup.secret}</span>
                </p>
                <label className={SETTINGS_LABEL_CLASS} htmlFor="totp-enable-code">
                  Authenticator code
                </label>
                <input
                  id="totp-enable-code"
                  className={SETTINGS_INPUT_CLASS}
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  placeholder="6-digit code"
                  autoComplete="one-time-code"
                />
                <button
                  type="button"
                  className={SETTINGS_BTN_PRIMARY_CLASS}
                  onClick={() => void confirmTotp()}
                  disabled={totpBusy}
                >
                  {totpBusy ? 'Verifying…' : 'Confirm and enable'}
                </button>
              </div>
            )}
            {totpEnabled && (
              <div className="mt-4 space-y-3">
                <label className={SETTINGS_LABEL_CLASS} htmlFor="totp-disable-code">
                  Authenticator code
                </label>
                <input
                  id="totp-disable-code"
                  className={SETTINGS_INPUT_CLASS}
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  placeholder="6-digit code"
                />
                {hasPassword && (
                  <>
                    <label className={SETTINGS_LABEL_CLASS} htmlFor="totp-disable-password">
                      Current password
                    </label>
                    <input
                      id="totp-disable-password"
                      type="password"
                      className={SETTINGS_INPUT_CLASS}
                      value={totpPassword}
                      onChange={(e) => setTotpPassword(e.target.value)}
                    />
                  </>
                )}
                <button
                  type="button"
                  className={SETTINGS_BTN_SECONDARY_CLASS}
                  onClick={() => void turnOffTotp()}
                  disabled={totpBusy}
                >
                  Disable 2FA
                </button>
              </div>
            )}
          </div>
        </div>
      </Card>

      <Card className={`${SETTINGS_CARD_CLASS} mt-6`}>
        <div className="flex items-start gap-3">
          <MonitorSmartphone className="mt-0.5 h-5 w-5 text-app-accent" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[13px] font-semibold text-app-label">Active sessions</h2>
              <button
                type="button"
                className={SETTINGS_BTN_SECONDARY_CLASS}
                onClick={() =>
                  logoutAllOtherSessions()
                    .then(reload)
                    .catch((err) => setError(err instanceof Error ? err.message : 'Could not revoke sessions'))
                }
              >
                Sign out other devices
              </button>
            </div>
            <ul className="mt-4 space-y-3">
              {sessions.length === 0 && (
                <li className="text-[13px] text-app-secondary">No active sessions.</li>
              )}
              {sessions.map((session) => (
                <li
                  key={session.id}
                  className="flex items-start justify-between gap-3 rounded-lg border border-app-separator bg-app-fill px-3 py-3"
                >
                  <div>
                    <p className="text-[13px] font-medium text-app-label">
                      {deviceLabel(session.user_agent)}
                      {session.is_current ? (
                        <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                          This device
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-1 text-xs text-app-secondary">
                      {session.ip || 'Unknown IP'} · Last seen {formatWhen(session.last_seen_at || session.created_at)}
                    </p>
                  </div>
                  {!session.is_current && (
                    <button
                      type="button"
                      className="text-xs font-medium text-red-600 hover:underline"
                      onClick={() =>
                        revokeAuthSession(session.id)
                          .then(reload)
                          .catch((err) => setError(err instanceof Error ? err.message : 'Could not revoke session'))
                      }
                    >
                      Revoke
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Card>

      <Card className={`${SETTINGS_CARD_CLASS} mt-6`}>
        <div className="flex items-start gap-3">
          <KeyRound className="mt-0.5 h-5 w-5 text-app-accent" />
          <div className="min-w-0 flex-1">
            <h2 className="text-[13px] font-semibold text-app-label">API keys</h2>
            <p className="mt-1 text-[13px] text-app-secondary">
              Keys start with <span className="font-mono">cmr_</span> and are shown only once.
            </p>
            {createdKey && (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
                Copy this key now. It will not be shown again.
                <p className="mt-1 break-all font-mono text-xs">{createdKey.key}</p>
              </div>
            )}
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <input
                className={SETTINGS_INPUT_CLASS}
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="Key name, e.g. CI pipeline"
              />
              <button
                type="button"
                className={SETTINGS_BTN_PRIMARY_CLASS}
                onClick={() => void handleCreateKey()}
                disabled={keyBusy}
              >
                {keyBusy ? 'Creating…' : 'Create key'}
              </button>
            </div>
            <ul className="mt-4 space-y-2">
              {apiKeys.length === 0 && (
                <li className="text-[13px] text-app-secondary">No API keys yet.</li>
              )}
              {apiKeys.map((key) => (
                <li key={key.id} className="flex items-center justify-between rounded-lg border border-app-separator px-3 py-2">
                  <div>
                    <p className="text-[13px] font-medium text-app-label">{key.name}</p>
                    <p className="text-xs text-app-secondary">
                      {key.prefix}… · Created {formatWhen(key.created_at)}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="text-xs font-medium text-red-600 hover:underline"
                    onClick={() =>
                      revokeApiKey(key.id)
                        .then(reload)
                        .catch((err) => setError(err instanceof Error ? err.message : 'Could not revoke key'))
                    }
                  >
                    Revoke
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Card>

      <Card className={`${SETTINGS_CARD_CLASS} mt-6`}>
        <h2 className="text-[13px] font-semibold text-app-label">Recent security activity</h2>
        <ul className="mt-4 divide-y divide-app-separator">
          {audit.length === 0 && <li className="py-2 text-[13px] text-app-secondary">No events yet.</li>}
          {audit.slice(0, 12).map((event) => (
            <li key={event.id} className="flex items-start justify-between gap-3 py-2">
              <div>
                <p className="text-[13px] text-app-label">{AUDIT_LABELS[event.action] ?? event.action}</p>
                <p className="text-xs text-app-secondary">{event.ip || 'Unknown IP'}</p>
              </div>
              <p className="shrink-0 text-xs text-app-secondary">{formatWhen(event.created_at)}</p>
            </li>
          ))}
        </ul>
      </Card>

      <Card className={`${SETTINGS_CARD_CLASS} mt-6`}>
        <div className="flex items-start gap-3">
          <Trash2 className="mt-0.5 h-5 w-5 text-red-600" />
          <div className="min-w-0 flex-1">
            <h2 className="text-[13px] font-semibold text-app-label">Delete account</h2>
            <p className="mt-1 text-[13px] text-app-secondary">
              Permanently deletes your profile, sessions, API keys, and workspace data. Type DELETE to confirm.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <label className={SETTINGS_LABEL_CLASS} htmlFor="delete-confirm">
                  Confirmation
                </label>
                <input
                  id="delete-confirm"
                  className={SETTINGS_INPUT_CLASS}
                  value={deleteConfirm}
                  onChange={(e) => setDeleteConfirm(e.target.value)}
                  placeholder="DELETE"
                />
              </div>
              {hasPassword && (
                <div>
                  <label className={SETTINGS_LABEL_CLASS} htmlFor="delete-password">
                    Password
                  </label>
                  <input
                    id="delete-password"
                    type="password"
                    className={SETTINGS_INPUT_CLASS}
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                  />
                </div>
              )}
            </div>
            <button
              type="button"
              className="mt-4 h-9 rounded-[10px] bg-red-600 px-4 text-[13px] font-medium text-white hover:bg-red-700 disabled:opacity-40"
              onClick={() => void handleDeleteAccount()}
              disabled={deleteBusy}
            >
              {deleteBusy ? 'Deleting…' : 'Delete my account'}
            </button>
          </div>
        </div>
      </Card>
    </>
  )
}
