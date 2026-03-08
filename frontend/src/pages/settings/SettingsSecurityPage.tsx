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

      {/* Card 1: Active Sessions */}
      <Card className={SETTINGS_CARD_CLASS}>
        <h2 className="text-sm font-semibold text-gray-900">Active Sessions</h2>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-gray-600">3 active sessions</p>
            <p className="mt-1 text-xs text-gray-500">Chrome on Windows — This device; Safari on iPhone — 2h ago.</p>
          </div>
          <button
            type="button"
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:ring-offset-2"
          >
            Logout from all devices
          </button>
        </div>
      </Card>

      {/* Card 2: Login History */}
      <Card className={`${SETTINGS_CARD_CLASS} mt-6`}>
        <h2 className="text-sm font-semibold text-gray-900">Login History</h2>
        <p className="mt-4 text-sm text-gray-600">Feb 28, 2026 — Chrome — New York, US</p>
      </Card>

      {/* Card 3: API Keys */}
      <Card className={`${SETTINGS_CARD_CLASS} mt-6`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-gray-900">API Keys</h2>
          <button
            type="button"
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:ring-offset-2"
          >
            Generate new key
          </button>
        </div>
      </Card>

      {/* Card 4: Account Protection */}
      <Card className={`${SETTINGS_CARD_CLASS} mt-6`}>
        <h2 className="text-sm font-semibold text-gray-900">Account Protection</h2>
        <div className="mt-4 space-y-4">
          <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-3">
            <span className="text-sm font-medium text-gray-900">IP restriction</span>
            <span className="ml-2 text-xs text-gray-500">(coming soon)</span>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-3">
            <span className="text-sm font-medium text-gray-900">SSO</span>
            <span className="text-xs text-gray-500">(coming soon)</span>
            <input type="checkbox" disabled className="rounded border-gray-300" />
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
