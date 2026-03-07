import { Card } from '@/components'
import { SETTINGS_ACTIONS_CLASS, SETTINGS_BTN_PRIMARY_CLASS, SETTINGS_BTN_SECONDARY_CLASS, SETTINGS_CARD_CLASS } from '@/lib/settingsFormStyles'

export function SettingsBillingPage() {
  return (
    <>
      <header className="mb-8">
        <h1 className="text-lg font-semibold text-gray-900">Billing</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage your subscription plan and invoices.
        </p>
      </header>

      <Card className={SETTINGS_CARD_CLASS}>
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-sm font-semibold text-gray-900">Plan information</h2>
          <button type="button" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:ring-offset-2">
            Upgrade plan
          </button>
        </div>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <div className="rounded-lg bg-blue-50 px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">Current plan</div>
            <div className="mt-1 text-base font-semibold text-blue-900">Growth — B2B</div>
            <p className="mt-1 text-xs text-blue-800">Up to 1,000 searches per month.</p>
          </div>
          <div className="rounded-lg bg-gray-50 px-4 py-3">
            <div className="text-xs text-gray-600">Usage this month</div>
            <div className="mt-1 font-medium text-gray-900">320 / 1,000 searches</div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-200">
              <div className="h-full w-1/3 rounded-full bg-blue-500" />
            </div>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-4 border-t border-gray-100 pt-5">
          <button type="button" className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:ring-offset-2">
            Add payment method
          </button>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-700">Auto-renew</span>
            <label className="relative inline-flex cursor-pointer items-center">
              <input type="checkbox" className="peer sr-only" defaultChecked />
              <span className="h-5 w-9 rounded-full bg-gray-200 peer-checked:bg-emerald-500 transition-colors" />
              <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
            </label>
          </div>
        </div>
      </Card>

      <Card className={`${SETTINGS_CARD_CLASS} mt-6`}>
        <h2 className="text-sm font-semibold text-gray-900">Invoice history</h2>
        <div className="mt-4 overflow-hidden rounded-lg border border-gray-200">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Invoice</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white text-gray-700">
              <tr>
                <td className="px-4 py-3">Feb 1, 2026</td>
                <td className="px-4 py-3">INV-2026-001</td>
                <td className="px-4 py-3">$1,200.00</td>
                <td className="px-4 py-3">
                  <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">Paid</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <div className={SETTINGS_ACTIONS_CLASS}>
        <button type="button" className={SETTINGS_BTN_SECONDARY_CLASS}>Cancel</button>
        <button type="button" className={SETTINGS_BTN_PRIMARY_CLASS}>Save Changes</button>
      </div>
    </>
  )
}
