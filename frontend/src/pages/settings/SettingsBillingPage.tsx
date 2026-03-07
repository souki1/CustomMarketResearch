import { Card } from '@/components'

export function SettingsBillingPage() {
  return (
    <Card className="max-w-3xl">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Billing & subscription</h2>
          <p className="mt-1 text-xs text-gray-500">Current plan, upgrade plan, usage limit (searches/month), add payment method, invoices history, auto-renew toggle.</p>
        </div>
        <button type="button" className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">Upgrade plan</button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg bg-blue-50 px-3 py-3">
          <div className="text-xs font-semibold uppercase text-blue-700">Current plan</div>
          <div className="mt-1 text-base font-semibold text-blue-900">Growth — B2B</div>
          <p className="mt-1 text-xs text-blue-800">Up to 1,000 searches per month.</p>
        </div>
        <div className="rounded-lg bg-gray-50 px-3 py-3">
          <div className="text-xs text-gray-600">Usage this month</div>
          <div className="mt-1 font-medium text-gray-900">320 / 1,000 searches</div>
          <div className="mt-2 h-1.5 w-full rounded-full bg-gray-200">
            <div className="h-1.5 w-1/3 rounded-full bg-blue-500" />
          </div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-4">
        <button type="button" className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">Add payment method</button>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-700">Auto-renew</span>
          <label className="relative inline-flex cursor-pointer items-center">
            <input type="checkbox" className="peer sr-only" defaultChecked />
            <span className="h-4 w-8 rounded-full bg-gray-200 peer-checked:bg-emerald-500" />
            <span className="absolute left-0.5 h-3 w-3 rounded-full bg-white shadow peer-checked:translate-x-4" />
          </label>
        </div>
      </div>
      <div className="mt-4">
        <span className="block text-xs font-semibold uppercase text-gray-500">Invoice history</span>
        <div className="mt-2 overflow-hidden rounded-lg border border-gray-100">
          <table className="min-w-full text-xs">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Invoice</th>
                <th className="px-3 py-2 text-left">Amount</th>
                <th className="px-3 py-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white text-gray-700">
              <tr>
                <td className="px-3 py-2">Feb 1, 2026</td>
                <td className="px-3 py-2">INV-2026-001</td>
                <td className="px-3 py-2">$1,200.00</td>
                <td className="px-3 py-2">
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Paid</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  )
}
