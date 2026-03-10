import { useComparison } from '@/contexts/ComparisonContext'

export function ComparisonModal() {
  const { items, isOpen, closeAndClear } = useComparison()

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="comparison-modal-title"
      onClick={(e) => e.target === e.currentTarget && closeAndClear()}
    >
      <div
        className="w-full max-w-3xl max-h-[85vh] flex flex-col rounded-xl border border-gray-200 bg-white shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 shrink-0">
          <h2 id="comparison-modal-title" className="text-base font-semibold text-gray-900">
            Compare products
          </h2>
          <button
            type="button"
            onClick={closeAndClear}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
        <div className="flex-1 overflow-auto p-4">
          {items.length === 0 ? (
            <p className="text-sm text-gray-500 py-4">No items to compare. Add rows from Research and click Compare.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">#</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Title</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Manufacturer</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Price</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {items.map((item, index) => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">{index + 1}</td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{item.title || '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{item.manufacturer || '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{item.price || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
