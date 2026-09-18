import { useState } from 'react'
import { confirmPasswordChange, requestPasswordChangeCode } from '@/lib/api'
import { getToken, setToken } from '@/lib/auth'
import { passwordPolicyError, PASSWORD_POLICY_HINT } from '@/lib/passwordPolicy'
import { SETTINGS_INPUT_CLASS, SETTINGS_LABEL_CLASS } from '@/lib/settingsFormStyles'

type ChangePasswordPanelProps = {
  email: string
}

export function ChangePasswordPanel({ email }: ChangePasswordPanelProps) {
  const [step, setStep] = useState<'idle' | 'confirm'>('idle')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const mismatch = confirm.length > 0 && password !== confirm

  async function sendCode() {
    const token = getToken()
    if (!token) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const resp = await requestPasswordChangeCode(token, 'email')
      setStep('confirm')
      if (resp.delivery === 'console') {
        setMessage('Verification code generated. Check the backend console (email is not configured yet).')
      } else {
        setMessage('Verification code sent to your email.')
      }
      if (resp.dev_code) {
        setMessage((prev) => (prev ? `${prev} (Dev code: ${resp.dev_code})` : `Dev code: ${resp.dev_code}`))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send code')
    } finally {
      setBusy(false)
    }
  }

  async function confirmChange() {
    const token = getToken()
    if (!token) return
    setError(null)
    setMessage(null)
    if (!code.trim()) {
      setError('Enter the verification code.')
      return
    }
    const policy = passwordPolicyError(password)
    if (policy) {
      setError(policy)
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setBusy(true)
    try {
      const resp = await confirmPasswordChange(token, { code: code.trim(), new_password: password })
      if (resp.access_token) setToken(resp.access_token)
      setMessage(resp.detail || 'Password updated.')
      setStep('idle')
      setCode('')
      setPassword('')
      setConfirm('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change password')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      {message && <p className="text-sm text-emerald-700">{message}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {step === 'idle' ? (
        <>
          <p className="text-[13px] text-app-secondary">
            We’ll email a verification code to <span className="font-medium text-app-label">{email || 'your email'}</span>.
          </p>
          <button
            type="button"
            onClick={() => void sendCode()}
            disabled={busy}
            className="h-9 rounded-[10px] bg-app-accent px-4 text-[13px] font-medium text-white hover:bg-app-accent-hover disabled:opacity-50"
          >
            {busy ? 'Sending…' : 'Send verification code'}
          </button>
        </>
      ) : (
        <div className="space-y-3">
          <div>
            <label className={SETTINGS_LABEL_CLASS} htmlFor="security-pw-code">
              Verification code
            </label>
            <input
              id="security-pw-code"
              className={SETTINGS_INPUT_CLASS}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="6-digit code"
              autoComplete="one-time-code"
            />
          </div>
          <div>
            <label className={SETTINGS_LABEL_CLASS} htmlFor="security-pw-new">
              New password
            </label>
            <input
              id="security-pw-new"
              type="password"
              className={SETTINGS_INPUT_CLASS}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={PASSWORD_POLICY_HINT}
              autoComplete="new-password"
            />
          </div>
          <div>
            <label className={SETTINGS_LABEL_CLASS} htmlFor="security-pw-confirm">
              Confirm new password
            </label>
            <input
              id="security-pw-confirm"
              type="password"
              className={SETTINGS_INPUT_CLASS}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
            {mismatch && <p className="mt-1 text-xs text-red-600">Passwords do not match.</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => void confirmChange()}
              disabled={busy}
              className="h-9 rounded-[10px] bg-app-accent px-4 text-[13px] font-medium text-white hover:bg-app-accent-hover disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Update password'}
            </button>
            <button
              type="button"
              onClick={() => void sendCode()}
              disabled={busy}
              className="h-9 rounded-[10px] border border-app-separator bg-app-surface px-4 text-[13px] font-medium text-app-secondary hover:bg-app-fill disabled:opacity-50"
            >
              Resend code
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
