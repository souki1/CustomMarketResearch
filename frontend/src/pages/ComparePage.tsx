import { useNavigate } from 'react-router-dom'
import { useComparison } from '@/contexts/ComparisonContext'

export function ComparePage() {
  const navigate = useNavigate()
  const { items, closeAndClear } = useComparison()

  const handleCancel = () => {
    closeAndClear()
    navigate('/research')
  }

  const hasItems = items.length > 0

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-10 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Compare</p>
          <h1 className="mt-1 text-2xl font-semibold text-gray-900">Which option is right for you?</h1>
          {hasItems && (
            <p className="mt-1 text-sm text-gray-500">
              Each column represents one website or source you selected from the inspector.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={handleCancel}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>

      {!hasItems ? (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-12 text-center">
          <p className="text-sm text-gray-600">No items to compare.</p>
          <p className="mt-1 text-sm text-gray-500">
            Select row(s) on the Research page and click <strong>Compare</strong> or <strong>Compare Selected</strong> to
            send data here.
          </p>
          <button
            type="button"
            onClick={() => navigate('/research')}
            className="mt-4 inline-block rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            Go to Research
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="flex gap-8 pb-6">
            {items.map((item, index) => (
              <div
                key={item.id}
                className="flex w-64 shrink-0 flex-col items-center rounded-2xl border border-gray-200 bg-white px-4 pb-6 pt-5 shadow-sm"
              >
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Option {index + 1}
                </p>
                <h3 className="w-full truncate text-center text-sm font-semibold text-gray-900">
                  {item.title || 'Untitled'}
                </h3>
                <p className="mt-1 text-center text-xs text-gray-500">
                  {item.manufacturer || 'Source not specified'}
                </p>

                <div className="mt-4 flex h-24 w-full items-center justify-center rounded-xl bg-gray-50 text-xs text-gray-400">
                  Image / screenshot
                </div>

                <div className="mt-4 w-full space-y-2 text-sm text-gray-700">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs uppercase tracking-wide text-gray-500">Price</span>
                    <span className="font-semibold text-gray-900">{item.price || '—'}</span>
                  </div>
                  {/* Add more attribute rows here when your data model grows (ratings, delivery time, etc.) */}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
