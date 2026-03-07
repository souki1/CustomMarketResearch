import { Card } from '@/components'
import { SETTINGS_ACTIONS_CLASS, SETTINGS_BTN_PRIMARY_CLASS, SETTINGS_BTN_SECONDARY_CLASS, SETTINGS_CARD_CLASS } from '@/lib/settingsFormStyles'

export function SettingsSecurityPage() {
  return (
    <>
      <header className="mb-8">
        <h1 className="text-lg font-semibold text-gray-900">Security</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage login sessions, API keys, and account protection.
        </p>
      </header>
      <Card className={SETTINGS_CARD_CLASS}>
        <div className="space-y-4">
          <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-900">Active sessions</span>
              <span className="text-xs text-gray-500">3 active</span>
            </div>
            <p className="mt-1 text-xs text-gray-500">Chrome on Windows — This device; Safari on iPhone — 2h ago.</p>
            <button type="button" className="mt-2 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">Logout from all devices</button>
          </div>
          <div className="rounded-lg border border-gray-100 bg-white px-3 py-2.5">
            <span className="text-sm font-medium text-gray-900">Login history</span>
            <p className="mt-1 text-xs text-gray-500">Feb 28, 2026 — Chrome — New York, US</p>
          </div>
          <div className="rounded-lg border border-gray-100 bg-white px-3 py-2.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-900">API keys</span>
              <button type="button" className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">Generate new key</button>
            </div>
          </div>
          <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-2.5">
            <span className="text-sm font-medium text-gray-900">IP restriction (coming soon)</span>
          </div>
          <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-2.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-900">SSO (coming soon)</span>
              <input type="checkbox" disabled className="rounded border-gray-300" />
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
