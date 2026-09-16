import { useEffect, useRef, useState } from 'react'
import { Card } from '@/components'
import {
  getCompanyLogoBlob,
  getCompanyProfile,
  updateCompanyProfile,
  uploadCompanyLogo,
} from '@/lib/api'
import { getToken } from '@/lib/auth'
import {
  SETTINGS_ACTIONS_CLASS,
  SETTINGS_BTN_PRIMARY_CLASS,
  SETTINGS_BTN_SECONDARY_CLASS,
  SETTINGS_CARD_CLASS,
  SETTINGS_INPUT_CLASS,
  SETTINGS_LABEL_CLASS,
  SETTINGS_TEXTAREA_CLASS,
} from '@/lib/settingsFormStyles'

type CompanyForm = {
  company_name: string
  industry: string
  tax_id: string
  website: string
  annual_volume: string
  currency: string
  timezone: string
  billing_address: string
  shipping_address: string
}

const EMPTY_FORM: CompanyForm = {
  company_name: '',
  industry: '',
  tax_id: '',
  website: '',
  annual_volume: '',
  currency: 'USD',
  timezone: 'America/New_York',
  billing_address: '',
  shipping_address: '',
}

export function SettingsCompanyPage() {
  const [form, setForm] = useState<CompanyForm>(EMPTY_FORM)
  const [initial, setInitial] = useState<CompanyForm>(EMPTY_FORM)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [pendingLogo, setPendingLogo] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const token = getToken()
    if (!token) {
      setError('Sign in to manage company details.')
      return
    }
    let objectUrl: string | null = null
    getCompanyProfile()
      .then(async (data) => {
        const next: CompanyForm = {
          company_name: data.company_name ?? '',
          industry: data.industry ?? '',
          tax_id: data.tax_id ?? '',
          website: data.website ?? '',
          annual_volume: data.annual_volume ?? '',
          currency: data.currency ?? 'USD',
          timezone: data.timezone ?? 'America/New_York',
          billing_address: data.billing_address ?? '',
          shipping_address: data.shipping_address ?? '',
        }
        setForm(next)
        setInitial(next)
        if (data.has_logo) {
          const blob = await getCompanyLogoBlob()
          if (blob) {
            objectUrl = URL.createObjectURL(blob)
            setLogoUrl(objectUrl)
          }
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load company profile'))
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [])

  const setField = (key: keyof CompanyForm, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSuccess(false)
    try {
      const saved = await updateCompanyProfile({
        company_name: form.company_name,
        industry: form.industry,
        tax_id: form.tax_id,
        website: form.website,
        annual_volume: form.annual_volume,
        currency: form.currency,
        timezone: form.timezone,
        billing_address: form.billing_address,
        shipping_address: form.shipping_address,
      })
      if (pendingLogo) {
        await uploadCompanyLogo(pendingLogo)
        const blob = await getCompanyLogoBlob()
        if (logoUrl) URL.revokeObjectURL(logoUrl)
        if (blob) setLogoUrl(URL.createObjectURL(blob))
        setPendingLogo(null)
      }
      const next: CompanyForm = {
        company_name: saved.company_name ?? form.company_name,
        industry: saved.industry ?? form.industry,
        tax_id: saved.tax_id ?? form.tax_id,
        website: saved.website ?? form.website,
        annual_volume: saved.annual_volume ?? form.annual_volume,
        currency: saved.currency ?? form.currency,
        timezone: saved.timezone ?? form.timezone,
        billing_address: saved.billing_address ?? form.billing_address,
        shipping_address: saved.shipping_address ?? form.shipping_address,
      }
      setForm(next)
      setInitial(next)
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
        <h1 className="text-lg font-semibold text-app-label">Company</h1>
        <p className="mt-1 text-sm text-app-secondary">
          Manage company details and billing address.
        </p>
      </header>
      <Card className={SETTINGS_CARD_CLASS}>
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={SETTINGS_LABEL_CLASS} htmlFor="company-name">Company name</label>
            <input id="company-name" type="text" className={SETTINGS_INPUT_CLASS} placeholder="Acme Corporation" value={form.company_name} onChange={(e) => setField('company_name', e.target.value)} />
          </div>
          <div>
            <label className={SETTINGS_LABEL_CLASS} htmlFor="company-industry">Industry</label>
            <input id="company-industry" type="text" className={SETTINGS_INPUT_CLASS} placeholder="Manufacturing, SaaS..." value={form.industry} onChange={(e) => setField('industry', e.target.value)} />
          </div>
          <div>
            <label className={SETTINGS_LABEL_CLASS} htmlFor="company-taxid">Tax ID / EIN</label>
            <input id="company-taxid" type="text" className={SETTINGS_INPUT_CLASS} placeholder="12-3456789" value={form.tax_id} onChange={(e) => setField('tax_id', e.target.value)} />
          </div>
          <div>
            <label className={SETTINGS_LABEL_CLASS} htmlFor="company-website">Website</label>
            <input id="company-website" type="url" className={SETTINGS_INPUT_CLASS} placeholder="https://example.com" value={form.website} onChange={(e) => setField('website', e.target.value)} />
          </div>
          <div>
            <label className={SETTINGS_LABEL_CLASS}>Company logo</label>
            <div className="mt-1.5 flex items-center gap-3">
              {logoUrl ? (
                <img src={logoUrl} alt="Company logo" className="h-10 w-10 rounded-lg border border-app-separator object-cover" />
              ) : (
                <div className="h-10 w-10 rounded-lg border border-dashed border-app-separator bg-app-fill" />
              )}
              <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={(e) => {
                const file = e.target.files?.[0]
                if (!file) return
                if (logoUrl) URL.revokeObjectURL(logoUrl)
                setLogoUrl(URL.createObjectURL(file))
                setPendingLogo(file)
                e.target.value = ''
              }} />
              <button type="button" onClick={() => fileInputRef.current?.click()} className="rounded-md border border-app-separator bg-app-surface px-3 py-1.5 text-xs font-medium text-app-secondary hover:bg-app-fill">
                {pendingLogo ? 'Logo selected' : 'Upload logo'}
              </button>
            </div>
          </div>
          <div>
            <label className={SETTINGS_LABEL_CLASS} htmlFor="company-volume">Annual purchase volume</label>
            <input id="company-volume" type="text" className={SETTINGS_INPUT_CLASS} placeholder="$2M–$5M" value={form.annual_volume} onChange={(e) => setField('annual_volume', e.target.value)} />
          </div>
          <div>
            <label className={SETTINGS_LABEL_CLASS} htmlFor="company-currency">Default currency</label>
            <select id="company-currency" className={SETTINGS_INPUT_CLASS} value={form.currency} onChange={(e) => setField('currency', e.target.value)}>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
            </select>
          </div>
          <div>
            <label className={SETTINGS_LABEL_CLASS} htmlFor="company-timezone">Timezone</label>
            <select id="company-timezone" className={SETTINGS_INPUT_CLASS} value={form.timezone} onChange={(e) => setField('timezone', e.target.value)}>
              <option value="America/New_York">New York</option>
              <option value="Europe/London">London</option>
              <option value="Asia/Dubai">Dubai</option>
            </select>
          </div>
          <div>
            <label className={SETTINGS_LABEL_CLASS} htmlFor="billing-address">Billing address</label>
            <textarea id="billing-address" rows={2} className={SETTINGS_TEXTAREA_CLASS} placeholder="Street, city, state, ZIP" value={form.billing_address} onChange={(e) => setField('billing_address', e.target.value)} />
          </div>
          <div>
            <label className={SETTINGS_LABEL_CLASS} htmlFor="shipping-address">Shipping address</label>
            <textarea id="shipping-address" rows={2} className={SETTINGS_TEXTAREA_CLASS} placeholder="Street, city, state, ZIP" value={form.shipping_address} onChange={(e) => setField('shipping_address', e.target.value)} />
          </div>
        </div>
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
