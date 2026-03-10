import { useNavigate } from 'react-router-dom'
import { useComparison } from '@/contexts/ComparisonContext'

export function ComparePage() {
  const navigate = useNavigate()
  const { items, closeAndClear } = useComparison()

  const handleCancel = () => {
    closeAndClear()
    navigate('/research')
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Compare</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-gray-900">
          Which product is right for you?
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          Select products on the Research page and click Compare to view them side-by-side.
        </p>
      </div>

      <div className="mt-6 flex items-center justify-end">
        <button
          type="button"
          onClick={handleCancel}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancel comparison
        </button>
      </div>

      {items.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-gray-200 bg-gray-50 p-12 text-center">
          <p className="text-sm text-gray-700">No comparison selected.</p>
          <p className="mt-1 text-sm text-gray-500">
            Go to Research, select row(s), then click <strong>Compare</strong> or <strong>Compare Selected</strong>.
          </p>
          <button
            type="button"
            onClick={() => navigate('/research')}
            className="mt-5 inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            Go to Research
          </button>
        </div>
      ) : (
        <div className="mt-10 overflow-x-auto">
          <div
            className="grid gap-6"
            style={{ gridTemplateColumns: `repeat(${items.length}, minmax(240px, 1fr))` }}
          >
            {items.slice(0, 5).map((item) => (
              <div key={item.id} className="border-b border-gray-200 pb-6">
                <div className="text-center">
                  <p className="text-sm font-semibold text-gray-900">{item.title || '—'}</p>
                </div>

                <div className="mt-4 flex items-center justify-center">
                  <div className="h-36 w-full max-w-[220px] rounded-xl border border-gray-200 bg-white shadow-sm flex items-center justify-center overflow-hidden">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt="" className="h-full w-full object-contain" />
                    ) : (
                      <div className="h-full w-full bg-gradient-to-br from-gray-50 to-gray-100" />
                    )}
                  </div>
                </div>

                <div className="mt-6 space-y-0 divide-y divide-gray-200">
                  {item.specs.slice(0, 12).map((spec, idx) => (
                    <div key={idx} className="py-3 text-center">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{spec.label}</p>
                      <p className="mt-1 text-sm font-medium text-gray-900">{spec.value || '—'}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
