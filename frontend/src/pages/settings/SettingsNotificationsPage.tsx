import { Card } from '@/components'

export function SettingsNotificationsPage() {
  return (
    <Card className="max-w-3xl">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-gray-900">Notifications</h2>
        <p className="mt-1 text-xs text-gray-500">Price drop alerts, stock alerts, RFQ response alerts, weekly spend report. Email / SMS toggle.</p>
      </div>
      <div className="space-y-3">
        {['Price drop alerts', 'Stock alerts', 'RFQ response alerts', 'Weekly spend report'].map((label) => (
          <div key={label} className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
            <span className="text-sm font-medium text-gray-900">{label}</span>
            <label className="relative inline-flex cursor-pointer items-center">
              <input type="checkbox" className="peer sr-only" defaultChecked />
              <span className="h-4 w-8 rounded-full bg-gray-200 peer-checked:bg-emerald-500" />
              <span className="absolute left-0.5 h-3 w-3 rounded-full bg-white shadow peer-checked:translate-x-4" />
            </label>
          </div>
        ))}
      </div>
      <div className="mt-4 border-t border-gray-100 pt-3">
        <span className="block text-xs font-semibold uppercase text-gray-500">Delivery</span>
        <div className="mt-2 flex gap-4">
          <label className="flex items-center gap-2">
            <input type="checkbox" defaultChecked className="rounded border-gray-300 text-blue-600" />
            <span className="text-sm">Email</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" className="rounded border-gray-300 text-blue-600" />
            <span className="text-sm">SMS</span>
          </label>
        </div>
      </div>
    </Card>
  )
}
