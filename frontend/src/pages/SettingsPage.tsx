import { Card } from '@/components'

const SETTINGS_SECTIONS = [
  { id: 'profile', label: 'Profile' },
  { id: 'company', label: 'Company' },
  { id: 'billing', label: 'Billing & subscription' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'security', label: 'Security' },
] as const

export function SettingsPage() {
  return (
    <div className="flex min-h-full bg-white">
      <div className="w-64 shrink-0 border-r border-gray-200 bg-white px-4 py-6">
        <h1 className="text-lg font-semibold text-gray-900">Settings</h1>
        <p className="mt-1 text-xs text-gray-500">
          Configure your profile, team, billing, and enterprise controls.
        </p>
        <nav className="mt-5 space-y-1">
          {SETTINGS_SECTIONS.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="block rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
            >
              {section.label}
            </a>
          ))}
        </nav>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8">
        {/* 1. Profile */}
        <section id="profile" className="scroll-mt-6">
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
                <button type="button" className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 w-fit">Change password</button>
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
        </section>

        {/* 2. Company */}
        <section id="company" className="scroll-mt-6">
          <Card className="max-w-3xl">
            <div className="mb-4">
              <h2 className="text-base font-semibold text-gray-900">Company</h2>
              <p className="mt-1 text-xs text-gray-500">Company name, industry, Tax ID/EIN, website, logo, annual purchase volume, default currency, timezone, billing & shipping address.</p>
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
        </section>

        {/* Billing & subscription */}
        <section id="billing" className="scroll-mt-6">
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
              <div className="mt-2 rounded-lg border border-gray-100 overflow-hidden">
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
                    <tr><td className="px-3 py-2">Feb 1, 2026</td><td className="px-3 py-2">INV-2026-001</td><td className="px-3 py-2">$1,200.00</td><td className="px-3 py-2"><span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Paid</span></td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </Card>
        </section>

        {/* 5. Notifications */}
        <section id="notifications" className="scroll-mt-6">
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
                <label className="flex items-center gap-2"><input type="checkbox" defaultChecked className="rounded border-gray-300 text-blue-600" /> <span className="text-sm">Email</span></label>
                <label className="flex items-center gap-2"><input type="checkbox" className="rounded border-gray-300 text-blue-600" /> <span className="text-sm">SMS</span></label>
              </div>
            </div>
          </Card>
        </section>

        {/* 6. Security */}
        <section id="security" className="scroll-mt-6">
          <Card className="max-w-3xl">
            <div className="mb-4">
              <h2 className="text-base font-semibold text-gray-900">Security</h2>
              <p className="mt-1 text-xs text-gray-500">Active sessions, logout from all devices, login history, API keys, IP restriction (future), SSO toggle (future).</p>
            </div>
            <div className="space-y-3">
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
        </section>
      </div>
    </div>
  )
}
