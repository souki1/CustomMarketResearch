import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '@/components'
import { getMe, profilePhotoUrl, updateProfile, uploadProfilePhoto } from '@/lib/api'
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

  if (loading) {
    return (
      <header className="mb-8">
        <h1 className="text-lg font-semibold text-app-label">Profile</h1>
        <p className="mt-1 text-sm text-app-secondary">Loading your profile…</p>
      </header>
    )
  }

  if (error) {
    return (
      <header className="mb-8">
        <h1 className="text-lg font-semibold text-app-label">Profile</h1>
        <p className="mt-1 text-sm text-red-600">{error}</p>
      </header>
    )
  }

  return (
    <>
      <header className="mb-8">
        <h1 className="text-lg font-semibold text-app-label">Profile</h1>
        <p className="mt-1 text-sm text-app-secondary">
          Update your personal information.
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
            <label className={SETTINGS_LABEL_CLASS}>Profile photo</label>
            <div className="mt-1.5 flex items-center gap-4">
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full border-2 border-app-separator bg-app-fill">
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
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-app-secondary">
                    Add photo
                  </div>
                )}
              </div>
              <div className="min-w-0">
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
                  className="rounded-md border border-app-separator bg-app-surface px-3 py-1.5 text-xs font-medium text-app-secondary hover:bg-app-fill disabled:opacity-50"
                >
                  {uploadingPhoto ? 'Uploading…' : profilePhotoUrlState ? 'Change photo' : 'Add photo'}
                </button>
                <p className="mt-1 text-xs text-app-secondary">
                  {pendingPhotoFile ? 'Photo selected. Click “Save Changes” to upload.' : 'JPG, PNG, GIF or WebP. Max 5MB.'}
                </p>
              </div>
            </div>
          </div>
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
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-app-secondary">Password and two-factor authentication</p>
            <Link
              to="/settings/security"
              className="w-fit rounded-md border border-app-separator bg-app-surface px-3 py-1.5 text-xs font-medium text-app-secondary hover:bg-app-fill"
            >
              Manage security
            </Link>
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
    </>
  )
}
