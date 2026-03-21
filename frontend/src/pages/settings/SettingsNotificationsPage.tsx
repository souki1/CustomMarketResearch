import { Card } from '@/components'
import { SETTINGS_ACTIONS_CLASS, SETTINGS_BTN_PRIMARY_CLASS, SETTINGS_BTN_SECONDARY_CLASS, SETTINGS_CARD_CLASS } from '@/lib/settingsFormStyles'

function ToggleRow({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
      <span className="text-sm font-medium text-gray-900">{label}</span>
      <label className="relative inline-flex cursor-pointer items-center">
        <input type="checkbox" className="peer sr-only" defaultChecked />
        <span className="h-5 w-9 rounded-full bg-gray-200 peer-checked:bg-emerald-500 transition-colors" />
        <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
      </label>
    </div>
  )
}

export function SettingsNotificationsPage() {
  return (
    <>
      <header className="mb-8">
        <h1 className="text-lg font-semibold text-gray-900">Notifications</h1>
        <p className="mt-1 text-sm text-gray-500">
          Control how you receive alerts and updates.
        </p>
      </header>

      <Card className={SETTINGS_CARD_CLASS}>
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Alerts</h2>
          <div className="mt-4 space-y-3">
            <ToggleRow label="Price drop alerts" />
            <ToggleRow label="Stock alerts" />
            <ToggleRow label="RFQ response alerts" />
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Reports</h2>
          <div className="mt-4 space-y-3">
            <ToggleRow label="Weekly spend report" />
          </div>
        </section>

        <section className="mt-8 border-t border-gray-100 pt-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Delivery</h2>
          <div className="mt-4 flex flex-wrap gap-6">
            <label className="flex cursor-pointer items-center gap-2">
              <input type="checkbox" defaultChecked className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500/20" />
              <span className="text-sm font-medium text-gray-900">Email</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500/20" />
              <span className="text-sm font-medium text-gray-900">SMS</span>
            </label>
          </div>
        </section>
      </Card>

      <div className={SETTINGS_ACTIONS_CLASS}>
        <button type="button" className={SETTINGS_BTN_SECONDARY_CLASS}>Cancel</button>
        <button type="button" className={SETTINGS_BTN_PRIMARY_CLASS}>Save Changes</button>
      </div>
    </>
  )
}
