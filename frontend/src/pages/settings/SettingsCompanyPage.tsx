import { Card } from '@/components'
import { SETTINGS_ACTIONS_CLASS, SETTINGS_BTN_PRIMARY_CLASS, SETTINGS_BTN_SECONDARY_CLASS, SETTINGS_CARD_CLASS, SETTINGS_INPUT_CLASS, SETTINGS_LABEL_CLASS, SETTINGS_TEXTAREA_CLASS } from '@/lib/settingsFormStyles'

export function SettingsCompanyPage() {
  return (
    <>
      <header className="mb-8">
        <h1 className="text-lg font-semibold text-gray-900">Company</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage company details and billing address.
        </p>
      </header>
      <Card className={SETTINGS_CARD_CLASS}>
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={SETTINGS_LABEL_CLASS} htmlFor="company-name">Company name</label>
            <input id="company-name" type="text" className={SETTINGS_INPUT_CLASS} placeholder="Acme Corporation" />
          </div>
          <div>
            <label className={SETTINGS_LABEL_CLASS} htmlFor="company-industry">Industry</label>
            <input id="company-industry" type="text" className={SETTINGS_INPUT_CLASS} placeholder="Manufacturing, SaaS..." />
          </div>
          <div>
            <label className={SETTINGS_LABEL_CLASS} htmlFor="company-taxid">Tax ID / EIN</label>
            <input id="company-taxid" type="text" className={SETTINGS_INPUT_CLASS} placeholder="12-3456789" />
          </div>
          <div>
            <label className={SETTINGS_LABEL_CLASS} htmlFor="company-website">Website</label>
            <input id="company-website" type="url" className={SETTINGS_INPUT_CLASS} placeholder="https://example.com" />
          </div>
          <div>
            <label className={SETTINGS_LABEL_CLASS}>Company logo</label>
            <div className="mt-1.5 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg border border-dashed border-gray-300 bg-gray-50" />
              <button type="button" className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">Upload logo</button>
            </div>
          </div>
          <div>
            <label className={SETTINGS_LABEL_CLASS} htmlFor="company-volume">Annual purchase volume</label>
            <input id="company-volume" type="text" className={SETTINGS_INPUT_CLASS} placeholder="$2M–$5M" />
          </div>
          <div>
            <label className={SETTINGS_LABEL_CLASS} htmlFor="company-currency">Default currency</label>
            <select id="company-currency" className={SETTINGS_INPUT_CLASS} defaultValue="USD">
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
            </select>
          </div>
          <div>
            <label className={SETTINGS_LABEL_CLASS} htmlFor="company-timezone">Timezone</label>
            <select id="company-timezone" className={SETTINGS_INPUT_CLASS} defaultValue="America/New_York">
              <option value="America/New_York">New York</option>
              <option value="Europe/London">London</option>
              <option value="Asia/Dubai">Dubai</option>
            </select>
          </div>
          <div>
            <label className={SETTINGS_LABEL_CLASS} htmlFor="billing-address">Billing address</label>
            <textarea id="billing-address" rows={2} className={SETTINGS_TEXTAREA_CLASS} placeholder="Street, city, state, ZIP" />
          </div>
          <div>
            <label className={SETTINGS_LABEL_CLASS} htmlFor="shipping-address">Shipping address</label>
            <textarea id="shipping-address" rows={2} className={SETTINGS_TEXTAREA_CLASS} placeholder="Street, city, state, ZIP" />
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
