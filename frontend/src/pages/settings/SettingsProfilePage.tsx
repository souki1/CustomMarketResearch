import { Card } from '@/components'
import { SETTINGS_ACTIONS_CLASS, SETTINGS_BTN_PRIMARY_CLASS, SETTINGS_BTN_SECONDARY_CLASS, SETTINGS_CARD_CLASS, SETTINGS_INPUT_CLASS, SETTINGS_INPUT_READONLY_CLASS, SETTINGS_LABEL_CLASS } from '@/lib/settingsFormStyles'

export function SettingsProfilePage() {
  return (
    <>
      <header className="mb-8">
        <h1 className="text-lg font-semibold text-gray-900">Profile</h1>
        <p className="mt-1 text-sm text-gray-500">
          Update your personal information and security settings.
        </p>
      </header>
      <Card className={SETTINGS_CARD_CLASS}>
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={SETTINGS_LABEL_CLASS} htmlFor="profile-full-name">Full name</label>
            <input id="profile-full-name" type="text" className={SETTINGS_INPUT_CLASS} placeholder="Jane Doe" />
          </div>
          <div>
            <label className={SETTINGS_LABEL_CLASS} htmlFor="profile-email">Work email</label>
            <input id="profile-email" type="email" readOnly className={SETTINGS_INPUT_READONLY_CLASS} value="jane@company.com" />
          </div>
          <div>
            <label className={SETTINGS_LABEL_CLASS} htmlFor="profile-phone">Phone</label>
            <input id="profile-phone" type="tel" className={SETTINGS_INPUT_CLASS} placeholder="+1 (555) 000-0000" />
          </div>
          <div>
            <label className={SETTINGS_LABEL_CLASS} htmlFor="profile-title">Job title</label>
            <input id="profile-title" type="text" className={SETTINGS_INPUT_CLASS} placeholder="Head of Procurement" />
          </div>
          <div>
            <label className={SETTINGS_LABEL_CLASS}>Profile photo</label>
            <div className="mt-1.5 flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-gray-100" />
              <button type="button" className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">Upload</button>
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
      <div className={SETTINGS_ACTIONS_CLASS}>
        <button type="button" className={SETTINGS_BTN_SECONDARY_CLASS}>Cancel</button>
        <button type="button" className={SETTINGS_BTN_PRIMARY_CLASS}>Save Changes</button>
      </div>
    </>
  )
}
