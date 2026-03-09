import { useEffect, useRef, useState } from 'react'
import { Card } from '@/components'
import { confirmPasswordChange, getMe, profilePhotoUrl, requestPasswordChangeCode, updateProfile, uploadProfilePhoto } from '@/lib/api'
import { getCurrentUserEmail, getCurrentUserName, getCurrentUserPhotoUrl, getToken, setCurrentUserName, setCurrentUserPhotoUrl } from '@/lib/auth'
import { SETTINGS_ACTIONS_CLASS, SETTINGS_BTN_PRIMARY_CLASS, SETTINGS_BTN_SECONDARY_CLASS, SETTINGS_CARD_CLASS, SETTINGS_INPUT_CLASS, SETTINGS_INPUT_READONLY_CLASS, SETTINGS_LABEL_CLASS } from '@/lib/settingsFormStyles'

const PROFILE_DRAFT_KEY = 'cmr_profile_draft'

function getProfileDraft(): { phone?: string; jobTitle?: string } | null {
  try {
    const raw = localStorage.getItem(PROFILE_DRAFT_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function setProfileDraft(phone: string, jobTitle: string) {
  try {
    localStorage.setItem(PROFILE_DRAFT_KEY, JSON.stringify({ phone, jobTitle }))
  } catch {
    // ignore
  }
}

function clearProfileDraft() {
  try {
    localStorage.removeItem(PROFILE_DRAFT_KEY)
  } catch {
    // ignore
  }
}

function getSaveErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : 'Failed to save'
  if (msg === 'Failed to fetch' || msg.toLowerCase().includes('fetch')) {
    return 'Could not reach the server. Make sure the backend is running (e.g. http://localhost:8000) and try again. Your entries are kept below.'
  }
  return msg
}

export function SettingsProfilePage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fetchFailed, setFetchFailed] = useState(false)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [profilePhotoUrlState, setProfilePhotoUrlState] = useState<string | null>(null)
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null)
  const [pendingPhotoFile, setPendingPhotoFile] = useState<File | null>(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [initialState, setInitialState] = useState<{
    fullName: string
    email: string
    phone: string
    jobTitle: string
    profilePhotoUrl: string | null
  } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [changePasswordOpen, setChangePasswordOpen] = useState(false)
  const [pwStep, setPwStep] = useState<'request' | 'confirm'>('request')
  const [pwCode, setPwCode] = useState('')
  const [pwNew, setPwNew] = useState('')
  const [pwConfirm, setPwConfirm] = useState('')
  const [pwBusy, setPwBusy] = useState(false)
  const [pwMsg, setPwMsg] = useState<string | null>(null)
  const [pwErr, setPwErr] = useState<string | null>(null)
  const passwordsMismatch = pwConfirm.length > 0 && pwNew !== pwConfirm

  useEffect(() => {
    const token = getToken()
    if (!token) {
      setError('Sign in to view your profile.')
      setLoading(false)
      return
    }
    setFullName(getCurrentUserName() ?? '')
    setEmail(getCurrentUserEmail() ?? '')
    const storedPhoto = getCurrentUserPhotoUrl()
    if (storedPhoto) setProfilePhotoUrlState(storedPhoto)
    getMe(token)
      .then((data) => {
        setFullName(data.display_name ?? '')
        setEmail(data.email ?? '')
        setPhone(data.phone ?? '')
        setJobTitle(data.job_title ?? '')
        setProfilePhotoUrlState(data.profile_photo_url ?? null)
        setInitialState({
          fullName: data.display_name ?? '',
          email: data.email ?? '',
          phone: data.phone ?? '',
          jobTitle: data.job_title ?? '',
          profilePhotoUrl: data.profile_photo_url ?? null,
        })
        if (data.display_name) setCurrentUserName(data.display_name)
        setCurrentUserPhotoUrl(data.profile_photo_url ?? null)
        setFetchFailed(false)
      })
      .catch(() => {
        setFetchFailed(true)
        const draft = getProfileDraft()
        if (draft) {
          if (draft.phone != null) setPhone(draft.phone)
          if (draft.jobTitle != null) setJobTitle(draft.jobTitle)
        }
        const storedPhoto = getCurrentUserPhotoUrl()
        if (storedPhoto) setProfilePhotoUrlState(storedPhoto)
      })
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    const token = getToken()
    if (!token) return
    setSaving(true)
    setError(null)
    setSaveSuccess(false)
    try {
      const data = await updateProfile(
        { display_name: fullName.trim(), phone: phone.trim() || undefined, job_title: jobTitle.trim() || undefined },
        token
      )

      setFullName(data.display_name ?? '')
      setPhone(data.phone ?? '')
      setJobTitle(data.job_title ?? '')
      if (data.display_name) setCurrentUserName(data.display_name)

      let finalPhotoUrl = profilePhotoUrlState

      // Upload the chosen photo only when the user clicks "Save Changes".
      if (pendingPhotoFile) {
        setUploadingPhoto(true)
        try {
          const photoData = await uploadProfilePhoto(pendingPhotoFile, token)
          finalPhotoUrl = photoData.profile_photo_url ?? null
          setProfilePhotoUrlState(finalPhotoUrl)
          setCurrentUserPhotoUrl(finalPhotoUrl)
          setPendingPhotoFile(null)
          if (photoPreviewUrl) {
            URL.revokeObjectURL(photoPreviewUrl)
            setPhotoPreviewUrl(null)
          }
        } catch (err) {
          setError(getSaveErrorMessage(err))
          return
        } finally {
          setUploadingPhoto(false)
        }
      } else {
        // No new upload, but still keep navbar in sync with the saved photo.
        setCurrentUserPhotoUrl(finalPhotoUrl)
      }

      setInitialState({
        fullName: data.display_name ?? '',
        email: data.email ?? '',
        phone: data.phone ?? '',
        jobTitle: data.job_title ?? '',
        profilePhotoUrl: finalPhotoUrl,
      })
      clearProfileDraft()
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (err) {
      setError(getSaveErrorMessage(err))
      setProfileDraft(phone, jobTitle)
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    if (photoPreviewUrl) {
      URL.revokeObjectURL(photoPreviewUrl)
      setPhotoPreviewUrl(null)
    }
    setPendingPhotoFile(null)
    if (initialState) {
      setFullName(initialState.fullName)
      setPhone(initialState.phone)
      setJobTitle(initialState.jobTitle)
      setProfilePhotoUrlState(initialState.profilePhotoUrl)
    } else {
      setFullName('')
      setPhone('')
      setJobTitle('')
      setProfilePhotoUrlState(null)
    }
    setError(null)
  }

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl)
    const preview = URL.createObjectURL(file)
    setPhotoPreviewUrl(preview)
    setError(null)
    setPendingPhotoFile(file)
    e.target.value = ''
  }

  const openChangePassword = () => {
    setChangePasswordOpen(true)
    setPwStep('request')
    setPwCode('')
    setPwNew('')
    setPwConfirm('')
    setPwMsg(null)
    setPwErr(null)
  }

  const closeChangePassword = () => {
    setChangePasswordOpen(false)
    setPwBusy(false)
    setPwMsg(null)
    setPwErr(null)
  }

  const sendVerificationCode = async () => {
    const token = getToken()
    if (!token) return
    setPwBusy(true)
    setPwErr(null)
    setPwMsg(null)
    try {
      const resp = await requestPasswordChangeCode(token, 'email')
      setPwStep('confirm')
      if (resp.delivery === 'console') {
        setPwMsg('Verification code generated. Check the backend console logs (email sending is not configured yet).')
      } else {
        setPwMsg('Verification code sent to your email.')
      }
      if (resp.dev_code) {
        setPwMsg((prev) => (prev ? `${prev} (Dev code: ${resp.dev_code})` : `Dev code: ${resp.dev_code}`))
      }
    } catch (err) {
      setPwErr(err instanceof Error ? err.message : 'Failed to send code')
    } finally {
      setPwBusy(false)
    }
  }

  const confirmNewPassword = async () => {
    const token = getToken()
    if (!token) return
    setPwErr(null)
    setPwMsg(null)
    const code = pwCode.trim()
    if (!code) {
      setPwErr('Enter the verification code.')
      return
    }
    if (!pwNew || pwNew.length < 8) {
      setPwErr('New password must be at least 8 characters.')
      return
    }
    if (pwNew !== pwConfirm) {
      setPwErr('Passwords do not match.')
      return
    }
    setPwBusy(true)
    try {
      const resp = await confirmPasswordChange(token, { code, new_password: pwNew })
      setPwMsg(resp.detail || 'Password updated.')
      setPwStep('request')
      setPwCode('')
      setPwNew('')
      setPwConfirm('')
    } catch (err) {
      setPwErr(err instanceof Error ? err.message : 'Failed to change password')
    } finally {
      setPwBusy(false)
    }
  }

  if (loading) {
    return (
      <header className="mb-8">
        <h1 className="text-lg font-semibold text-gray-900">Profile</h1>
        <p className="mt-1 text-sm text-gray-500">Loading your profile…</p>
      </header>
    )
  }

  if (error) {
    return (
      <header className="mb-8">
        <h1 className="text-lg font-semibold text-gray-900">Profile</h1>
        <p className="mt-1 text-sm text-red-600">{error}</p>
      </header>
    )
  }

  return (
    <>
      <header className="mb-8">
        <h1 className="text-lg font-semibold text-gray-900">Profile</h1>
        <p className="mt-1 text-sm text-gray-500">
          Update your personal information and security settings.
        </p>
        {fetchFailed && (
          <p className="mt-2 text-sm text-amber-600">
            Could not reach server. Showing your saved profile from when you signed in.
          </p>
        )}
      </header>
      <Card className={SETTINGS_CARD_CLASS}>
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={SETTINGS_LABEL_CLASS} htmlFor="profile-full-name">Full name</label>
            <input
              id="profile-full-name"
              type="text"
              className={SETTINGS_INPUT_CLASS}
              placeholder="Jane Doe"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
          <div>
            <label className={SETTINGS_LABEL_CLASS} htmlFor="profile-email">Work email</label>
            <input id="profile-email" type="email" readOnly className={SETTINGS_INPUT_READONLY_CLASS} value={email} />
          </div>
          <div>
            <label className={SETTINGS_LABEL_CLASS} htmlFor="profile-phone">Phone</label>
            <input
              id="profile-phone"
              type="tel"
              className={SETTINGS_INPUT_CLASS}
              placeholder="+1 (555) 000-0000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <div>
            <label className={SETTINGS_LABEL_CLASS} htmlFor="profile-title">Job title</label>
            <input
              id="profile-title"
              type="text"
              className={SETTINGS_INPUT_CLASS}
              placeholder="Head of Procurement"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
            />
          </div>
          <div>
            <label className={SETTINGS_LABEL_CLASS}>Profile photo</label>
            <div className="mt-1.5 flex items-center gap-3">
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full border-2 border-gray-200 bg-gray-100">
                {photoPreviewUrl ? (
                  <img
                    src={photoPreviewUrl}
                    alt="Profile preview"
                    className="h-full w-full object-cover"
                  />
                ) : profilePhotoUrlState ? (
                  <img
                    src={profilePhotoUrl(profilePhotoUrlState) ?? ''}
                    alt="Profile"
                    className="h-full w-full object-cover"
                  />
                ) : null}
              </div>
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePhotoChange}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={saving || uploadingPhoto}
                  className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  {uploadingPhoto ? 'Uploading…' : 'Choose image'}
                </button>
                <p className="mt-1 text-xs text-gray-500">Select an image from your device. JPG, PNG, GIF or WebP. Max 5MB.</p>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-4">
            <button
              type="button"
              onClick={openChangePassword}
              className="w-fit rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Change password
            </button>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-700">Two-factor authentication</span>
            <label className="relative inline-flex cursor-pointer items-center">
              <input type="checkbox" className="peer sr-only" />
              <span className="h-4 w-8 rounded-full bg-gray-200 peer-checked:bg-emerald-500" />
              <span className="absolute left-0.5 h-3 w-3 rounded-full bg-white shadow peer-checked:translate-x-4" />
            </label>
            </div>
          </div>
        </div>
      </Card>
      {error && (
        <p className="mb-4 text-sm text-red-600">{error}</p>
      )}
      {saveSuccess && (
        <p className="mb-4 text-sm font-medium text-emerald-600">Changes saved.</p>
      )}
      <div className={SETTINGS_ACTIONS_CLASS}>
        <button type="button" className={SETTINGS_BTN_SECONDARY_CLASS} onClick={handleCancel}>
          Cancel
        </button>
        <button
          type="button"
          className={SETTINGS_BTN_PRIMARY_CLASS}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>

      {changePasswordOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-[520px] rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-gray-900">Change password</p>
                <p className="text-xs text-gray-500">We’ll send a verification code to your email to confirm.</p>
              </div>
              <button
                type="button"
                onClick={closeChangePassword}
                className="rounded-md px-2 py-1 text-sm text-gray-600 hover:bg-gray-100"
              >
                ✕
              </button>
            </div>

            <div className="px-4 py-4 space-y-3">
              {pwMsg && <p className="text-sm text-emerald-700">{pwMsg}</p>}
              {pwErr && <p className="text-sm text-red-600">{pwErr}</p>}

              {pwStep === 'request' ? (
                <div className="space-y-3">
                  <p className="text-sm text-gray-700">
                    Send code to: <span className="font-medium">{email || 'your email'}</span>
                  </p>
                  <button
                    type="button"
                    onClick={sendVerificationCode}
                    disabled={pwBusy}
                    className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {pwBusy ? 'Sending…' : 'Send verification code'}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className={SETTINGS_LABEL_CLASS} htmlFor="pw-code">Verification code</label>
                    <input
                      id="pw-code"
                      className={SETTINGS_INPUT_CLASS}
                      value={pwCode}
                      onChange={(e) => setPwCode(e.target.value)}
                      placeholder="6-digit code"
                    />
                  </div>
                  <div>
                    <label className={SETTINGS_LABEL_CLASS} htmlFor="pw-new">New password</label>
                    <input
                      id="pw-new"
                      type="password"
                      className={SETTINGS_INPUT_CLASS}
                      value={pwNew}
                      onChange={(e) => setPwNew(e.target.value)}
                      placeholder="At least 8 characters"
                    />
                  </div>
                  <div>
                    <label className={SETTINGS_LABEL_CLASS} htmlFor="pw-confirm">Confirm new password</label>
                    <input
                      id="pw-confirm"
                      type="password"
                      className={SETTINGS_INPUT_CLASS}
                      value={pwConfirm}
                      onChange={(e) => setPwConfirm(e.target.value)}
                    />
                    {passwordsMismatch && (
                      <p className="mt-1 text-xs text-red-600">Passwords do not match.</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={confirmNewPassword}
                      disabled={pwBusy}
                      className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {pwBusy ? 'Saving…' : 'Confirm & update password'}
                    </button>
                    <button
                      type="button"
                      onClick={sendVerificationCode}
                      disabled={pwBusy}
                      className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      Resend code
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
