import { Card } from '@/components'

export function SettingsProfilePage() {
  return (
    <Card className="max-w-3xl">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-gray-900">Profile</h2>
        <p className="mt-1 text-xs text-gray-500">
          Full name, work email (readonly if verified), phone, job title, profile photo, change password, enable/disable 2FA.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-700" htmlFor="profile-full-name">Full name</label>
          <input id="profile-full-name" type="text" className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="Jane Doe" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700" htmlFor="profile-email">Work email</label>
          <input id="profile-email" type="email" readOnly className="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500" value="jane@company.com" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700" htmlFor="profile-phone">Phone</label>
          <input id="profile-phone" type="tel" className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="+1 (555) 000-0000" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700" htmlFor="profile-title">Job title</label>
          <input id="profile-title" type="text" className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="Head of Procurement" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700">Profile photo</label>
          <div className="mt-2 flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-gray-100" />
            <button type="button" className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">Upload</button>
          </div>
        </div>
        <div className="flex flex-col gap-2">
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
  )
}
