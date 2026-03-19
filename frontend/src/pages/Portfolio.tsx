import { useEffect, useMemo, useState } from "react"
import { getToken } from "@/lib/auth"
import { listDataSheetSelections, listPortfolioItems } from "@/lib/api"
import type { PortfolioItem } from "@/lib/api"

export function PortfolioPage() {
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [portfolioItems, setPortfolioItems] = useState<PortfolioItem[]>([])
  
    const token = useMemo(() => getToken(), [])

    const groupedPortfolioItems = useMemo(() => {
      const keyFor = (item: PortfolioItem): string => item.part_number ?? "__null_part__"

      const map = new Map<string, PortfolioItem[]>()
      for (const item of portfolioItems) {
        const k = keyFor(item)
        const arr = map.get(k)
        if (arr) arr.push(item)
        else map.set(k, [item])
      }

      const out: Array<{ part_number: string | null; entries: PortfolioItem[] }> = []
      for (const [k, items] of map.entries()) {
        out.push({
          part_number: k === "__null_part__" ? null : k,
          entries: items,
        })
      }
      return out
    }, [portfolioItems])
  
    useEffect(() => {
      if (!token) {
        setError('Sign in to view portfolio.')
        return
      }
  
      setLoading(true)
      setError(null)
      setPortfolioItems([])

      // Load ALL selections then fetch portfolio items for each, combining into one list.
      // This way parts from all "Research Selected" sessions show up, not just the most recent one.
      listDataSheetSelections(token)
        .then(async (selections) => {
          if (selections.length === 0) return
          const results = await Promise.all(
            selections.map((s) =>
              listPortfolioItems(token, s.id).catch(() => [] as PortfolioItem[])
            )
          )
          // Merge all results, dedup by part_number+vendor_name+price+quantity
          const seen = new Set<string>()
          const merged: PortfolioItem[] = []
          for (const batch of results) {
            for (const item of batch) {
              const key = `${item.part_number}|${item.vendor_name}|${item.price}|${item.quantity}`
              if (!seen.has(key)) {
                seen.add(key)
                merged.push(item)
              }
            }
          }
          setPortfolioItems(merged)
        })
        .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load portfolio'))
        .finally(() => setLoading(false))
    }, [token])
  
    return (
      <div className="mx-auto w-full max-w-7xl px-6 py-8">
        <div className="text-center">
          <p className="text-xl font-semibold uppercase tracking-wide text-gray-500">Portfolio</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-gray-900">Structured results</h1>
          <p className="mt-3 text-sm text-gray-600">
            Shows your saved “Research Selected” inputs and the structured scraped output stored in MongoDB.
          </p>
        </div>
        <table className="w-full">
          <thead>
            <tr>
                <th>Part Number</th>
                <th> Vendor name</th>
                <th>Price</th>
                <th>Quantity</th>
            </tr>
          </thead>
          <tbody>
            {(!token || loading) && (
              <tr>
                <td colSpan={4} className="py-6 text-center text-sm text-gray-500">
                  {error ?? 'Loading…'}
                </td>
              </tr>
            )}

            {token && !loading && error && (
              <tr>
                <td colSpan={4} className="py-6 text-center text-sm text-red-600">
                  {error}
                </td>
              </tr>
            )}

            {token && !loading && !error && portfolioItems.length === 0 && (
              <tr>
                <td colSpan={4} className="py-6 text-center text-sm text-gray-500">
                  No portfolio items found. Run "Research Selected" first.
                </td>
              </tr>
            )}

            {token &&
              !loading &&
              !error &&
              groupedPortfolioItems.map((group, idx) => (
                <tr
                  key={`${group.part_number ?? "null"}-${idx}`}
                  className="border-t"
                >
                  <td className="py-3 pr-4">
                    {group.part_number ?? "—"}
                  </td>
                  <td className="py-3 pr-4">
                    <div className="space-y-1">
                      {group.entries.map((e, i) => (
                        <div key={`v-${i}`}>
                          {e.vendor_name ? (
                            e.url ? (
                              <a
                                href={e.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 underline hover:text-blue-800"
                              >
                                {e.vendor_name}
                              </a>
                            ) : (
                              e.vendor_name
                            )
                          ) : (
                            e.url ? (
                              <a
                                href={e.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 underline hover:text-blue-800"
                              >
                                —
                              </a>
                            ) : "—"
                          )}
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="py-3 pr-4">
                    <div className="space-y-1">
                      {group.entries.map((e, i) => (
                        <div key={`p-${i}`}>
                          {e.price ?? "—"}
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="py-3 pr-4">
                    <div className="space-y-1">
                      {group.entries.map((e, i) => (
                        <div key={`q-${i}`}>
                          {e.quantity ?? "—"}
                        </div>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
  
      </div>
    )
  }