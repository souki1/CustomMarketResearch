import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { KeyRound, Monitor, ShieldCheck, Smartphone, Trash2 } from 'lucide-react'
import { Card } from '@/components'
import {
  confirmMfa,
  deleteAccount,
  disableMfa,
  getMe,
  listAuthSessions,
  revokeAllOtherSessions,
  revokeAuthSession,
  setupMfa,
  type AuthSessionInfo,
  type MfaSetupResponse,
} from '@/lib/api'
import { clearAuth, getToken } from '@/lib/auth'
import {
  SETTINGS_BTN_PRIMARY_CLASS,
  SETTINGS_BTN_SECONDARY_CLASS,
  SETTINGS_CARD_CLASS,
  SETTINGS_INPUT_CLASS,
  SETTINGS_LABEL_CLASS,
} from '@/lib/settingsFormStyles'

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

function deviceLabel(userAgent: string | null) {
  if (!userAgent) return 'Unknown device'
  if (/Edg\//.test(userAgent)) return 'Microsoft Edge'
  if (/Chrome\//.test(userAgent)) return 'Chrome'
  if (/Firefox\//.test(userAgent)) return 'Firefox'
  if (/Safari\//.test(userAgent)) return 'Safari'
  return userAgent.slice(0, 48)
}

export function SettingsSecurityPage() {
  const navigate = useNavigate()
  const [totpEnabled, setTotpEnabled] = useState(false)
  const [email, setEmail] = useState('')
  const [sessions, setSessions] = useState<AuthSessionInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [mfaSetup, setMfaSetup] = useState<MfaSetupResponse | null>(null)
  const [mfaCode, setMfaCode] = useState('')
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null)
  const [mfaBusy, setMfaBusy] = useState(false)

  const [disableCode, setDisableCode] = useState('')
  const [deleteEmail, setDeleteEmail] = useState('')
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteTotp, setDeleteTotp] = useState('')
  const [deleteBusy, setDeleteBusy] = useState(false)

  async function reload() {
    const token = getToken()
    if (!token) return
    const [me, sessionList] = await Promise.all([getMe(token), listAuthSessions()])
    setTotpEnabled(Boolean(me.totp_enabled))
    setEmail(me.email)
    setSessions(sessionList)
  }

  useEffect(() => {
    reload()
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load security settings'))
      .finally(() => setLoading(false))
  }, [])

  const currentSession = useMemo(() => sessions.find((s) => s.current), [sessions])

  async function startMfa() {
    setError(null)
    setNotice(null)
    setMfaBusy(true)
    try {
      const setup = await setupMfa()
      setMfaSetup(setup)
      setBackupCodes(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start two-factor setup')
    } finally {
      setMfaBusy(false)
    }
  }

  async function finishMfa() {
    setError(null)
    setMfaBusy(true)
    try {
      const result = await confirmMfa(mfaCode.trim())
      setBackupCodes(result.backup_codes)
      setMfaSetup(null)
      setMfaCode('')
      setTotpEnabled(true)
      setNotice(result.detail)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid authenticator code')
    } finally {
      setMfaBusy(false)
    }
  }

  async function turnOffMfa() {
    setError(null)
    setMfaBusy(true)
    try {
      await disableMfa(disableCode.trim())
      setTotpEnabled(false)
      setDisableCode('')
      setNotice('Two-factor authentication is off.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not disable two-factor authentication')
    } finally {
      setMfaBusy(false)
    }
  }

  async function revoke(id: number) {
    setError(null)
    try {
      await revokeAuthSession(id)
      await reload()
      setNotice('Session revoked.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not revoke session')
    }
  }

  async function revokeOthers() {
    setError(null)
    try {
      await revokeAllOtherSessions()
      await reload()
      setNotice('Signed out of other devices.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not revoke other sessions')
    }
  }

  async function handleDelete() {
    setError(null)
    setDeleteBusy(true)
    try {
      await deleteAccount({
        email: deleteEmail.trim(),
        password: deletePassword || undefined,
        totp_code: deleteTotp || undefined,
      })
      clearAuth()
      navigate('/signin', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete account')
    } finally {
      setDeleteBusy(false)
    }
  }

  if (loading) {
    return <p className="text-[13px] text-app-secondary">Loading security settings…</p>
  }

  return (
    <>
      <header className="mb-8">
        <h1 className="text-[22px] font-semibold tracking-[-0.03em] text-app-label">Security</h1>
        <p className="mt-1 text-[13px] text-app-secondary">
          Manage sign-in, two-factor authentication, active sessions, and account deletion.
        </p>
      </header>

      {error && (
        <p className="mb-4 rounded-[10px] bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="mb-4 rounded-[10px] bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>
      )}

      <Card className={SETTINGS_CARD_CLASS}>
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 text-app-accent" aria-hidden />
          <div className="min-w-0 flex-1">
            <h2 className="text-[13px] font-semibold text-app-label">Two-factor authentication</h2>
            <p className="mt-1 text-[13px] text-app-secondary">
              {totpEnabled
                ? 'Authenticator app is enabled for this account.'
                : 'Add an authenticator app so a stolen password is not enough to sign in.'}
            </p>

            {!totpEnabled && !mfaSetup && !backupCodes && (
              <button type="button" className={`${SETTINGS_BTN_PRIMARY_CLASS} mt-4`} onClick={startMfa} disabled={mfaBusy}>
                {mfaBusy ? 'Starting…' : 'Enable authenticator app'}
              </button>
            )}

            {mfaSetup && (
              <div className="mt-4 space-y-3">
                <p className="text-[13px] text-app-secondary">Scan this QR code, then enter the 6-digit code to confirm.</p>
                <img src={mfaSetup.qr_data_uri} alt="Two-factor authentication QR code" className="h-40 w-40 rounded-md border border-app-separator bg-white p-2" />
                <p className="break-all font-mono text-[12px] text-app-secondary">Secret: {mfaSetup.secret}</p>
                <label className={SETTINGS_LABEL_CLASS} htmlFor="mfa-confirm-code">
                  Authenticator code
                </label>
                <input
                  id="mfa-confirm-code"
                  className={SETTINGS_INPUT_CLASS}
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                  placeholder="123456"
                  autoComplete="one-time-code"
                />
                <div className="flex gap-2">
                  <button type="button" className={SETTINGS_BTN_PRIMARY_CLASS} onClick={finishMfa} disabled={mfaBusy}>
                    {mfaBusy ? 'Confirming…' : 'Confirm and enable'}
                  </button>
                  <button type="button" className={SETTINGS_BTN_SECONDARY_CLASS} onClick={() => setMfaSetup(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {backupCodes && (
              <div className="mt-4 rounded-[10px] border border-app-separator bg-app-fill p-3">
                <p className="text-[13px] font-medium text-app-label">Save these backup codes now. They will not be shown again.</p>
                <ul className="mt-2 grid grid-cols-2 gap-1 font-mono text-[12px] text-app-label">
                  {backupCodes.map((code) => (
                    <li key={code}>{code}</li>
                  ))}
                </ul>
              </div>
            )}

            {totpEnabled && (
              <div className="mt-4 space-y-2">
                <label className={SETTINGS_LABEL_CLASS} htmlFor="mfa-disable-code">
                  Enter a current code to disable 2FA
                </label>
                <input
                  id="mfa-disable-code"
                  className={SETTINGS_INPUT_CLASS}
                  value={disableCode}
                  onChange={(e) => setDisableCode(e.target.value)}
                  placeholder="123456 or backup code"
                />
                <button type="button" className={SETTINGS_BTN_SECONDARY_CLASS} onClick={turnOffMfa} disabled={mfaBusy}>
                  Disable two-factor authentication
                </button>
              </div>
            )}
          </div>
        </div>
      </Card>

      <Card className={`${SETTINGS_CARD_CLASS} mt-6`}>
        <div className="flex items-start gap-3">
          <Monitor className="mt-0.5 h-5 w-5 text-app-accent" aria-hidden />
          <div className="min-w-0 flex-1">
            <h2 className="text-[13px] font-semibold text-app-label">Active sessions</h2>
            <p className="mt-1 text-[13px] text-app-secondary">
              Each sign-in is tracked. Revoke any session you do not recognize.
            </p>
            <ul className="mt-4 space-y-3">
              {sessions.length === 0 && (
                <li className="text-[13px] text-app-secondary">No active sessions were found for this account.</li>
              )}
              {sessions.map((session) => (
                <li key={session.id} className="flex items-start justify-between gap-3 rounded-[10px] border border-app-separator px-3 py-2.5">
                  <div>
                    <p className="text-[13px] font-medium text-app-label">
                      {deviceLabel(session.user_agent)}
                      {session.current ? ' · this device' : ''}
                    </p>
                    <p className="text-[12px] text-app-secondary">
                      {session.ip_address || 'IP hidden'} · last seen {formatWhen(session.last_seen_at)}
                    </p>
                  </div>
                  {!session.current && (
                    <button type="button" className={SETTINGS_BTN_SECONDARY_CLASS} onClick={() => revoke(session.id)}>
                      Revoke
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {sessions.some((s) => !s.current) && (
              <button type="button" className={`${SETTINGS_BTN_SECONDARY_CLASS} mt-4`} onClick={revokeOthers}>
                Sign out other devices
              </button>
            )}
            {currentSession && (
              <p className="mt-3 text-[12px] text-app-tertiary">This session expires {formatWhen(currentSession.expires_at)}.</p>
            )}
          </div>
        </div>
      </Card>

      <Card className={`${SETTINGS_CARD_CLASS} mt-6`}>
        <div className="flex items-start gap-3">
          <KeyRound className="mt-0.5 h-5 w-5 text-app-accent" aria-hidden />
          <div>
            <h2 className="text-[13px] font-semibold text-app-label">Password policy</h2>
            <p className="mt-1 text-[13px] text-app-secondary">
              Passwords must be at least 10 characters, include a letter and a number, and cannot contain your email.
              Changing your password signs out every device.
            </p>
            <p className="mt-2 text-[13px] text-app-secondary">
              Use Change password on the Profile page. Failed sign-ins lock the account after 5 attempts.
            </p>
          </div>
        </div>
      </Card>

      <Card className={`${SETTINGS_CARD_CLASS} mt-6`}>
        <div className="flex items-start gap-3">
          <Smartphone className="mt-0.5 h-5 w-5 text-app-accent" aria-hidden />
          <div>
            <h2 className="text-[13px] font-semibold text-app-label">Signed in as</h2>
            <p className="mt-1 text-[13px] text-app-secondary">{email || 'Unknown account'}</p>
          </div>
        </div>
      </Card>

      <Card className={`${SETTINGS_CARD_CLASS} mt-6 border-red-200`}>
        <div className="flex items-start gap-3">
          <Trash2 className="mt-0.5 h-5 w-5 text-red-600" aria-hidden />
          <div className="min-w-0 flex-1">
            <h2 className="text-[13px] font-semibold text-app-label">Delete account</h2>
            <p className="mt-1 text-[13px] text-app-secondary">
              This disables the account, revokes every session, and removes your sign-in methods. Type your email to confirm.
            </p>
            <div className="mt-4 space-y-3">
              <div>
                <label className={SETTINGS_LABEL_CLASS} htmlFor="delete-email">Email confirmation</label>
                <input id="delete-email" className={SETTINGS_INPUT_CLASS} value={deleteEmail} onChange={(e) => setDeleteEmail(e.target.value)} />
              </div>
              <div>
                <label className={SETTINGS_LABEL_CLASS} htmlFor="delete-password">Password</label>
                <input id="delete-password" type="password" className={SETTINGS_INPUT_CLASS} value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} />
              </div>
              {totpEnabled && (
                <div>
                  <label className={SETTINGS_LABEL_CLASS} htmlFor="delete-totp">Authenticator code</label>
                  <input id="delete-totp" className={SETTINGS_INPUT_CLASS} value={deleteTotp} onChange={(e) => setDeleteTotp(e.target.value)} />
                </div>
              )}
              <button
                type="button"
                className="h-9 rounded-[10px] bg-red-600 px-4 text-[13px] font-medium text-white hover:bg-red-700 disabled:opacity-40"
                onClick={handleDelete}
                disabled={deleteBusy || deleteEmail.trim().toLowerCase() !== email.toLowerCase()}
              >
                {deleteBusy ? 'Deleting…' : 'Permanently delete account'}
              </button>
            </div>
          </div>
        </div>
      </Card>
    </>
  )
}
