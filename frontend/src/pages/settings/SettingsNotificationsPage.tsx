import { useEffect, useState } from 'react'
import { Card } from '@/components'
import { getNotificationSettings, updateNotificationSettings, type NotificationSettings } from '@/lib/api'
import { getToken } from '@/lib/auth'
import {
  SETTINGS_ACTIONS_CLASS,
  SETTINGS_BTN_PRIMARY_CLASS,
  SETTINGS_BTN_SECONDARY_CLASS,
  SETTINGS_CARD_CLASS,
} from '@/lib/settingsFormStyles'

const DEFAULTS: NotificationSettings = {
  price_drop_alerts: true,
  stock_alerts: true,
  rfq_alerts: true,
  weekly_spend_report: true,
  delivery_email: true,
  delivery_sms: false,
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-app-separator bg-app-fill px-4 py-3">
      <span className="text-sm font-medium text-app-label">{label}</span>
      <label className="relative inline-flex cursor-pointer items-center">
        <input
          type="checkbox"
          className="peer sr-only"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="h-5 w-9 rounded-full bg-app-fill-strong peer-checked:bg-emerald-500 transition-colors" />
        <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-app-surface shadow transition-transform peer-checked:translate-x-4" />
      </label>
    </div>
  )
}

export function SettingsNotificationsPage() {
  const [form, setForm] = useState<NotificationSettings>(DEFAULTS)
  const [initial, setInitial] = useState<NotificationSettings>(DEFAULTS)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (!getToken()) {
      setError('Sign in to manage notifications.')
      return
    }
    getNotificationSettings()
      .then((data) => {
        setForm(data)
        setInitial(data)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load notifications'))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSuccess(false)
    try {
      const saved = await updateNotificationSettings(form)
      setForm(saved)
      setInitial(saved)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <header className="mb-8">
        <h1 className="text-lg font-semibold text-app-label">Notifications</h1>
        <p className="mt-1 text-sm text-app-secondary">
          Control how you receive alerts and updates.
        </p>
      </header>

      <Card className={SETTINGS_CARD_CLASS}>
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-app-secondary">Alerts</h2>
          <div className="mt-4 space-y-3">
            <ToggleRow label="Price drop alerts" checked={form.price_drop_alerts} onChange={(v) => setForm((s) => ({ ...s, price_drop_alerts: v }))} />
            <ToggleRow label="Stock alerts" checked={form.stock_alerts} onChange={(v) => setForm((s) => ({ ...s, stock_alerts: v }))} />
            <ToggleRow label="RFQ response alerts" checked={form.rfq_alerts} onChange={(v) => setForm((s) => ({ ...s, rfq_alerts: v }))} />
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-app-secondary">Reports</h2>
          <div className="mt-4 space-y-3">
            <ToggleRow label="Weekly spend report" checked={form.weekly_spend_report} onChange={(v) => setForm((s) => ({ ...s, weekly_spend_report: v }))} />
          </div>
        </section>

        <section className="mt-8 border-t border-app-separator pt-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-app-secondary">Delivery</h2>
          <div className="mt-4 flex flex-wrap gap-6">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={form.delivery_email}
                onChange={(e) => setForm((s) => ({ ...s, delivery_email: e.target.checked }))}
                className="h-4 w-4 rounded border-app-separator text-app-accent focus:ring-app-accent/20"
              />
              <span className="text-sm font-medium text-app-label">Email</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={form.delivery_sms}
                onChange={(e) => setForm((s) => ({ ...s, delivery_sms: e.target.checked }))}
                className="h-4 w-4 rounded border-app-separator text-app-accent focus:ring-app-accent/20"
              />
              <span className="text-sm font-medium text-app-label">SMS</span>
            </label>
          </div>
        </section>
      </Card>
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      {success && <p className="mt-4 text-sm font-medium text-emerald-600">Changes saved.</p>}
      <div className={SETTINGS_ACTIONS_CLASS}>
        <button type="button" className={SETTINGS_BTN_SECONDARY_CLASS} onClick={() => setForm(initial)}>Cancel</button>
        <button type="button" className={SETTINGS_BTN_PRIMARY_CLASS} onClick={() => void handleSave()} disabled={saving}>
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </>
  )
}
