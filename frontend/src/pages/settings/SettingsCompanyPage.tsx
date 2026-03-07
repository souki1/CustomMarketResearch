import { Card } from '@/components'

export function SettingsCompanyPage() {
  return (
    <Card className="max-w-3xl">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-gray-900">Company</h2>
        <p className="mt-1 text-xs text-gray-500">
          Company name, industry, Tax ID/EIN, website, logo, annual purchase volume, default currency, timezone, billing & shipping address.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-700" htmlFor="company-name">Company name</label>
          <input id="company-name" type="text" className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="Acme Corporation" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700" htmlFor="company-industry">Industry</label>
          <input id="company-industry" type="text" className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="Manufacturing, SaaS..." />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700" htmlFor="company-taxid">Tax ID / EIN</label>
          <input id="company-taxid" type="text" className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="12-3456789" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700" htmlFor="company-website">Website</label>
          <input id="company-website" type="url" className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="https://example.com" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700">Company logo</label>
          <div className="mt-2 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg border border-dashed border-gray-300 bg-gray-50" />
            <button type="button" className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">Upload logo</button>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700" htmlFor="company-volume">Annual purchase volume</label>
          <input id="company-volume" type="text" className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="$2M–$5M" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700" htmlFor="company-currency">Default currency</label>
          <select id="company-currency" className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm" defaultValue="USD">
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="GBP">GBP</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700" htmlFor="company-timezone">Timezone</label>
          <select id="company-timezone" className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm" defaultValue="America/New_York">
            <option value="America/New_York">New York</option>
            <option value="Europe/London">London</option>
            <option value="Asia/Dubai">Dubai</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700" htmlFor="billing-address">Billing address</label>
          <textarea id="billing-address" rows={2} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="Street, city, state, ZIP" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700" htmlFor="shipping-address">Shipping address</label>
          <textarea id="shipping-address" rows={2} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="Street, city, state, ZIP" />
        </div>
      </div>
    </Card>
  )
}
