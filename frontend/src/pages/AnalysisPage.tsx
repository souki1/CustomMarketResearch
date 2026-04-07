import { useMemo, useState } from 'react'
import {
  ArrowRightLeft,
  BadgeDollarSign,
  Calculator,
  Factory,
  HandCoins,
  Package,
} from 'lucide-react'
import { Card } from '@/components'

function parseNum(s: string): number {
  const t = s.replace(/,/g, '').trim()
  if (t === '' || t === '-') return 0
  const n = Number(t)
  return Number.isFinite(n) ? n : 0
}

function formatMoney(n: number): string {
  if (!Number.isFinite(n)) return '—'
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: n % 1 === 0 ? 0 : 2,
    minimumFractionDigits: 0,
  }).format(n)
}

export function AnalysisPage() {
  const [partLabel, setPartLabel] = useState('')
  const [annualVolume, setAnnualVolume] = useState('10000')
  const [vendorA, setVendorA] = useState('Current supplier')
  const [priceA, setPriceA] = useState('12.50')
  const [vendorB, setVendorB] = useState('Alternative vendor')
  const [priceB, setPriceB] = useState('10.80')
  const [switchCost, setSwitchCost] = useState('2500')
  const [resellerMode, setResellerMode] = useState(false)
  const [sellPrice, setSellPrice] = useState('24.99')

  const v = parseNum(annualVolume)
  const pA = parseNum(priceA)
  const pB = parseNum(priceB)
  const nre = parseNum(switchCost)
  const asp = parseNum(sellPrice)

  const metrics = useMemo(() => {
    const spendA = v * pA
    const spendB = v * pB
    const savings = spendA - spendB
    const savingsPct = spendA > 0 ? (savings / spendA) * 100 : 0
    const paybackMonths = savings > 0 && nre > 0 ? (nre / savings) * 12 : savings > 0 ? 0 : null
    const profitA = resellerMode && asp > 0 ? v * (asp - pA) : null
    const profitB = resellerMode && asp > 0 ? v * (asp - pB) : null
    const profitUplift =
      profitA != null && profitB != null ? profitB - profitA : null
    const maxSpend = Math.max(spendA, spendB, 1)
    return {
      spendA,
      spendB,
      savings,
      savingsPct,
      paybackMonths,
      profitA,
      profitB,
      profitUplift,
      barA: (spendA / maxSpend) * 100,
      barB: (spendB / maxSpend) * 100,
    }
  }, [v, pA, pB, nre, resellerMode, asp])

  const inputClass =
    'mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm outline-none transition placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'

  return (
    <div className="min-h-full bg-linear-to-b from-slate-50/90 to-white pb-12">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <header className="mb-8">
          <div className="flex flex-wrap items-center gap-2 text-blue-600">
            <Calculator className="h-5 w-5" aria-hidden />
            <span className="text-xs font-semibold uppercase tracking-wide">Sourcing analysis</span>
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-gray-900 md:text-3xl">
            Vendor &amp; price impact
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-600">
            Compare two quotes side by side. See annual spend, how much you save by switching, payback on
            one-time costs, and—if you resell—the gross profit lift from a better buy price.
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-5">
          <div className="space-y-4 lg:col-span-2">
            <Card className="border-gray-200/80 p-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                <Package className="h-4 w-4 text-gray-500" aria-hidden />
                Part &amp; volume
              </div>
              <label className="mt-4 block text-xs font-medium text-gray-600">
                Part / SKU (optional)
                <input
                  type="text"
                  value={partLabel}
                  onChange={(e) => setPartLabel(e.target.value)}
                  placeholder="e.g. Motor assembly A-440"
                  className={inputClass}
                  autoComplete="off"
                />
              </label>
              <label className="mt-3 block text-xs font-medium text-gray-600">
                Annual volume (units)
                <input
                  type="text"
                  inputMode="decimal"
                  value={annualVolume}
                  onChange={(e) => setAnnualVolume(e.target.value)}
                  className={inputClass}
                  aria-describedby="vol-hint"
                />
              </label>
              <p id="vol-hint" className="mt-1 text-xs text-gray-500">
                All costs below are multiplied by this quantity for a full-year view.
              </p>
            </Card>

            <Card className="border-gray-200/80 p-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                <Factory className="h-4 w-4 text-gray-500" aria-hidden />
                Vendor A (baseline)
              </div>
              <label className="mt-4 block text-xs font-medium text-gray-600">
                Name
                <input
                  type="text"
                  value={vendorA}
                  onChange={(e) => setVendorA(e.target.value)}
                  className={inputClass}
                  autoComplete="organization"
                />
              </label>
              <label className="mt-3 block text-xs font-medium text-gray-600">
                Unit price (USD)
                <input
                  type="text"
                  inputMode="decimal"
                  value={priceA}
                  onChange={(e) => setPriceA(e.target.value)}
                  className={inputClass}
                />
              </label>
            </Card>

            <Card className="border-gray-200/80 p-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                <ArrowRightLeft className="h-4 w-4 text-gray-500" aria-hidden />
                Vendor B (alternative)
              </div>
              <label className="mt-4 block text-xs font-medium text-gray-600">
                Name
                <input
                  type="text"
                  value={vendorB}
                  onChange={(e) => setVendorB(e.target.value)}
                  className={inputClass}
                  autoComplete="organization"
                />
              </label>
              <label className="mt-3 block text-xs font-medium text-gray-600">
                Unit price (USD)
                <input
                  type="text"
                  inputMode="decimal"
                  value={priceB}
                  onChange={(e) => setPriceB(e.target.value)}
                  className={inputClass}
                />
              </label>
            </Card>

            <Card className="border-gray-200/80 p-5">
              <label className="block text-xs font-medium text-gray-600">
                One-time switch cost (tooling, qualification, shipping setup…)
                <input
                  type="text"
                  inputMode="decimal"
                  value={switchCost}
                  onChange={(e) => setSwitchCost(e.target.value)}
                  className={inputClass}
                />
              </label>
              <p className="mt-2 text-xs text-gray-500">
                Used only to estimate how many months until switching pays for itself.
              </p>
            </Card>

            <Card className="border-gray-200/80 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                    <HandCoins className="h-4 w-4 text-gray-500" aria-hidden />
                    Reseller / margin view
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    If you buy and resell, enter your sell price to see gross profit improvement (same units,
                    better COGS).
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={resellerMode}
                  onClick={() => setResellerMode((x) => !x)}
                  className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                    resellerMode ? 'bg-blue-600' : 'bg-gray-200'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition ${
                      resellerMode ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>
              {resellerMode && (
                <label className="mt-4 block text-xs font-medium text-gray-600">
                  Average sell price per unit (USD)
                  <input
                    type="text"
                    inputMode="decimal"
                    value={sellPrice}
                    onChange={(e) => setSellPrice(e.target.value)}
                    className={inputClass}
                  />
                </label>
              )}
            </Card>
          </div>

          <div className="space-y-4 lg:col-span-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Card className="border border-slate-200/80 bg-white p-5 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  Annual spend — {vendorA || 'Vendor A'}
                </p>
                <p className="mt-2 text-2xl font-semibold tabular-nums text-gray-900">
                  {formatMoney(metrics.spendA)}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  {v.toLocaleString()} units × {formatMoney(pA)}
                </p>
              </Card>
              <Card className="border border-slate-200/80 bg-white p-5 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  Annual spend — {vendorB || 'Vendor B'}
                </p>
                <p className="mt-2 text-2xl font-semibold tabular-nums text-gray-900">
                  {formatMoney(metrics.spendB)}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  {v.toLocaleString()} units × {formatMoney(pB)}
                </p>
              </Card>
            </div>

            {resellerMode && asp > 0 && metrics.profitUplift != null && (
              <Card className="border-gray-200/80 p-5">
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                  <BadgeDollarSign className="h-5 w-5 text-emerald-700" aria-hidden />
                  Gross profit (same volume, your sell price {formatMoney(asp)})
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg bg-white/90 px-3 py-2 ring-1 ring-gray-200/80">
                    <p className="text-xs text-gray-500">With {vendorA || 'A'}</p>
                    <p className="text-lg font-semibold tabular-nums text-gray-900">
                      {formatMoney(metrics.profitA ?? 0)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-white/90 px-3 py-2 ring-1 ring-gray-200/80">
                    <p className="text-xs text-gray-500">With {vendorB || 'B'}</p>
                    <p className="text-lg font-semibold tabular-nums text-gray-900">
                      {formatMoney(metrics.profitB ?? 0)}
                    </p>
                  </div>
                </div>
                <p className="mt-3 text-sm text-gray-800">
                  <span className="font-semibold text-emerald-800">Gross profit uplift: </span>
                  {metrics.profitUplift >= 0 ? (
                    <span className="tabular-nums text-emerald-800">
                      +{formatMoney(metrics.profitUplift)} / year vs buying from {vendorA || 'A'}
                    </span>
                  ) : (
                    <span className="tabular-nums text-amber-800">
                      {formatMoney(metrics.profitUplift)} / year (B is worse for margin at this sell price)
                    </span>
                  )}
                </p>
                <p className="mt-2 text-xs text-gray-600">
                  Revenue is {formatMoney(v * asp)} / year either way; the difference is how much you keep after
                  COGS.
                </p>
              </Card>
            )}

            <Card className="border border-dashed border-slate-200/90 bg-slate-50/50 p-4 text-sm text-slate-700">
              <p className="font-medium text-slate-900">Savings &amp; spend comparison</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">
                Annual savings (B vs A), payback, and side-by-side spend bars now live on the{' '}
                <strong className="font-semibold text-slate-800">Price calculator</strong> page under Scenario
                comparison (Compare 1 vs Compare 2).
              </p>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
