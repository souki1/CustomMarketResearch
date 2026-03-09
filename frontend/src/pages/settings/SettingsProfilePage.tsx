import { useEffect, useRef, useState } from 'react'
import { Card } from '@/components'
import { getMe, profilePhotoUrl, updateProfile, uploadProfilePhoto } from '@/lib/api'
import { getCurrentUserEmail, getCurrentUserName, getToken } from '@/lib/auth'
import { SETTINGS_ACTIONS_CLASS, SETTINGS_BTN_PRIMARY_CLASS, SETTINGS_BTN_SECONDARY_CLASS, SETTINGS_CARD_CLASS, SETTINGS_INPUT_CLASS, SETTINGS_INPUT_READONLY_CLASS, SETTINGS_LABEL_CLASS } from '@/lib/settingsFormStyles'

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
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [initialState, setInitialState] = useState<{ fullName: string; email: string; phone: string; jobTitle: string } | null>(null)
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
        })
        setFetchFailed(false)
      })
      .catch(() => {
        setFetchFailed(true)
      })
      .finally(() => setLoading(false))
  }, [])

  const handleSave = () => {
    const token = getToken()
    if (!token) return
    setSaving(true)
    setError(null)
    updateProfile(
      { display_name: fullName.trim(), phone: phone.trim() || undefined, job_title: jobTitle.trim() || undefined },
      token
    )
      .then((data) => {
        setFullName(data.display_name ?? '')
        setPhone(data.phone ?? '')
        setJobTitle(data.job_title ?? '')
        setInitialState({
          fullName: data.display_name ?? '',
          email: data.email ?? '',
          phone: data.phone ?? '',
          jobTitle: data.job_title ?? '',
        })
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to save'))
      .finally(() => setSaving(false))
  }

  const handleCancel = () => {
    if (initialState) {
      setFullName(initialState.fullName)
      setPhone(initialState.phone)
      setJobTitle(initialState.jobTitle)
    }
  }

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const token = getToken()
    if (!token) return
    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl)
    const preview = URL.createObjectURL(file)
    setPhotoPreviewUrl(preview)
    setUploadingPhoto(true)
    setError(null)
    uploadProfilePhoto(file, token)
      .then((data) => {
        setProfilePhotoUrlState(data.profile_photo_url ?? null)
        URL.revokeObjectURL(preview)
        setPhotoPreviewUrl(null)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Photo upload failed')
        URL.revokeObjectURL(preview)
        setPhotoPreviewUrl(null)
      })
      .finally(() => setUploadingPhoto(false))
    e.target.value = ''
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
                  disabled={uploadingPhoto}
                  className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  {uploadingPhoto ? 'Uploading…' : 'Choose image'}
                </button>
                <p className="mt-1 text-xs text-gray-500">Select an image from your device. JPG, PNG, GIF or WebP. Max 5MB.</p>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-4">
            <button type="button" className="w-fit rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">Change password</button>
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
