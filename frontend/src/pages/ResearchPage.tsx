import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { getToken } from '@/lib/auth'
import { getWorkspaceFileContent } from '@/lib/api'

type TabState = {
  id: string
  name: string
  data: string[][]
  fileId: number | null
  folderPath?: string | null
}

function parseCsv(text: string): string[][] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean)
  return lines.map((line) => {
    const row: string[] = []
    let cell = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (c === '"') inQuotes = !inQuotes
      else if (c === ',' && !inQuotes) {
        row.push(cell.trim())
        cell = ''
      } else cell += c
    }
    row.push(cell.trim())
    return row
  })
}

function newBlankSheet(): TabState {
  const header = Array.from({ length: DEFAULT_SHEET_COLS }, () => '')
  const rows = Array.from({ length: DEFAULT_SHEET_ROWS }, () =>
    Array.from({ length: DEFAULT_SHEET_COLS }, () => '')
  )
  return {
    id: crypto.randomUUID(),
    name: 'New sheet',
    data: [header, ...rows],
    fileId: null,
    folderPath: null,
  }
}
const ROWS_PER_PAGE_OPTIONS: number[] = [10, 25, 50, 100]
const DEFAULT_SHEET_ROWS = 10
const DEFAULT_SHEET_COLS = 10

export function ResearchPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const fileIdParam = searchParams.get('fileId')
  const nameFromUrl = searchParams.get('name')
  const folderFromUrl = searchParams.get('folder')
  const [tabs, setTabs] = useState<TabState[]>(() => [newBlankSheet()])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set())
  const [selectedColumns, setSelectedColumns] = useState<Set<number>>(new Set())
  const [rowsPerPage, setRowsPerPage] = useState(25)
  const [page, setPage] = useState(1)
  const [toolbarActive, setToolbarActive] = useState<'all' | 'selected' | 'deep' | null>('all')
  const [otherMenuOpen, setOtherMenuOpen] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0]
  const content = activeTab?.data ?? null
  const effectiveTabId = activeTab?.id ?? tabs[0]?.id ?? null

  useEffect(() => {
    if (tabs.length > 0 && (!activeTabId || !tabs.some((t) => t.id === activeTabId))) {
      setActiveTabId(tabs[0].id)
    }
  }, [tabs, activeTabId])

  useEffect(() => {
    if (!fileIdParam) return
    const token = getToken()
    if (!token) {
      setError('Sign in to view file content.')
      return
    }
    const numericId = Number(fileIdParam)
    const existing = tabs.find((t) => t.fileId === numericId)
    if (existing) {
      setActiveTabId(existing.id)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    getWorkspaceFileContent(numericId, token)
      .then((text) => {
        const data = parseCsv(text)
        const name = nameFromUrl ?? `File ${fileIdParam}`
        const newTab: TabState = {
          id: crypto.randomUUID(),
          name,
          data: data.length > 0 ? data : [['']],
          fileId: numericId,
          folderPath: folderFromUrl,
        }
        setTabs((prev) => {
          // If a tab for this fileId was created while we were loading, reuse it.
          const existingTab = prev.find((t) => t.fileId === numericId)
          if (existingTab) {
            setActiveTabId(existingTab.id)
            return prev
          }
          setActiveTabId(newTab.id)
          return [...prev, newTab]
        })
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load file')
      })
      .finally(() => setLoading(false))
  }, [fileIdParam, nameFromUrl, folderFromUrl, tabs])

  const addNewTab = useCallback(() => {
    const tab = newBlankSheet()
    setTabs((prev) => [...prev, tab])
    setActiveTabId(tab.id)
    setSearchParams({}, { replace: true })
    setError(null)
  }, [setSearchParams])

  const closeTab = useCallback(
    (id: string) => {
      const idx = tabs.findIndex((t) => t.id === id)
      if (idx < 0) return
      const next = tabs.filter((t) => t.id !== id)
      setTabs(next)
      if (activeTabId === id) {
        const nextActive = next[idx] ?? next[idx - 1] ?? next[0]
        setActiveTabId(nextActive?.id ?? null)
      }
    },
    [tabs, activeTabId]
  )

  const setActiveTabData = useCallback(
    (updater: (prev: string[][]) => string[][]) => {
      if (!effectiveTabId) return
      setTabs((prev) =>
        prev.map((t) => (t.id === effectiveTabId ? { ...t, data: updater(t.data) } : t))
      )
    },
    [effectiveTabId]
  )

  const updateCell = useCallback(
    (rowIndex: number, colIndex: number, value: string) => {
      setActiveTabData((prev) => {
        if (!prev.length) return prev
        const next = prev.map((row) => [...row])
        if (!next[rowIndex]) return prev
        next[rowIndex] = [...next[rowIndex]]
        while (next[rowIndex].length <= colIndex) next[rowIndex].push('')
        next[rowIndex][colIndex] = value
        return next
      })
    },
    [setActiveTabData]
  )

  const addColumn = useCallback(() => {
    setActiveTabData((prev) => (prev.length ? prev.map((row) => [...row, '']) : [['']]))
  }, [setActiveTabData])

  const addRow = useCallback(() => {
    setActiveTabData((prev) => {
      if (!prev.length) return [['']]
      const numCols = prev[0]?.length ?? 1
      return [...prev, Array(numCols).fill('')]
    })
  }, [setActiveTabData])

  const toggleRowSelection = (rowIndex: number) => {
    setSelectedRows((prev) => {
      const next = new Set(prev)
      if (next.has(rowIndex)) next.delete(rowIndex)
      else next.add(rowIndex)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (!content || content.length <= 1) return
    if (selectedRows.size >= content.length - 1) setSelectedRows(new Set())
    else setSelectedRows(new Set(Array.from({ length: content.length - 1 }, (_, i) => i)))
  }

  const totalDataRows = content ? content.length - 1 : 0
  const totalPages = Math.max(1, Math.ceil(totalDataRows / rowsPerPage))
  const currentPage = Math.min(page, totalPages)
  const startRow = (currentPage - 1) * rowsPerPage
  const endRow = Math.min(startRow + rowsPerPage, totalDataRows)
  const pageRows = content ? content.slice(1 + startRow, 1 + endRow) : []
  const rowIndices = pageRows.map((_, i) => startRow + i)

  if (!content && !loading && !error && tabs.length === 0) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-4 px-6 py-12 text-center">
        <h2 className="text-lg font-semibold text-gray-900">Data Research</h2>
        <p className="max-w-sm text-sm text-gray-500">
          Open a file from Home or start with a new sheet.
        </p>
        <div className="flex gap-2">
          <Link
            to="/"
            className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
          >
            Go to Home
          </Link>
          <button
            type="button"
            onClick={addNewTab}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            + New tab
          </button>
        </div>
      </div>
    )
  }

  if (!fileIdParam && tabs.length > 0 && !activeTab) {
    return null
  }

  const numCols = content?.[0]?.length ?? 0
  const activePathLabel =
    activeTab && activeTab.name
      ? ['All Files', activeTab.folderPath, activeTab.name].filter(Boolean).join(' / ')
      : ''

  return (
    <div className="min-h-full bg-white px-6 py-6">
      <h2 className="mb-2 text-lg font-semibold text-gray-900">Data Research</h2>

      {/* Tab bar */}
      <div className="mb-3 flex flex-wrap items-center gap-1 border-b border-gray-200">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            role="tab"
            aria-selected={tab.id === activeTabId}
            className={`flex items-center gap-1.5 rounded-t border border-b-0 px-3 py-2 text-sm ${
              tab.id === activeTabId
                ? 'border-gray-300 bg-white text-gray-900'
                : 'border-transparent bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <button
              type="button"
              onClick={() => setActiveTabId(tab.id)}
              className="font-medium"
            >
              {tab.name}
            </button>
            <button
              type="button"
              onClick={() => closeTab(tab.id)}
              className="rounded p-0.5 text-gray-400 hover:bg-gray-300 hover:text-gray-600"
              aria-label="Close tab"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addNewTab}
          className="rounded-t border border-transparent px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          title="New tab"
        >
          + New tab
        </button>
      </div>

      {activePathLabel && (
        <p className="mb-1 text-xs font-medium text-gray-500 truncate">
          {activePathLabel}
        </p>
      )}

      {loading && (
        <p className="mb-2 text-sm text-gray-500">Loading file…</p>
      )}
      {error && (
        <p className="mb-2 text-sm text-red-600">{error}</p>
      )}

      {/* Toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setToolbarActive('all')}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${
            toolbarActive === 'all' ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          Research All
        </button>
        <button
          type="button"
          onClick={() => setToolbarActive('selected')}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${
            toolbarActive === 'selected' ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          Research Selected
        </button>
        <button
          type="button"
          onClick={() => setToolbarActive('deep')}
          className="inline-flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          Deep Search Selected
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={() => setOtherMenuOpen((o) => !o)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h16v2H4v-2z" />
            </svg>
            Other options
          </button>
          {otherMenuOpen && (
            <div className="absolute left-0 top-full z-10 mt-1 min-w-[160px] rounded-xl border border-gray-200 bg-white py-1 shadow-sm">
              <button
                type="button"
                className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
                onClick={() => { setOtherMenuOpen(false); addColumn(); }}
              >
                Add column
              </button>
              <button
                type="button"
                className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
                onClick={() => { setOtherMenuOpen(false); addRow(); }}
              >
                Add row
              </button>
              <Link
                to="/"
                className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
                onClick={() => setOtherMenuOpen(false)}
              >
                Back to Home
              </Link>
            </div>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFilterOpen((f) => !f)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17m0 0h2m-2 0h-5m-9 0H3" />
            </svg>
            Filter
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download Selected
          </button>
        </div>
      </div>

      {filterOpen && (
        <div className="mb-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
          Filter options (placeholder). Configure filters per column.
        </div>
      )}

      {content && content.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-lg border border-gray-200 shadow-sm">
            <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="w-10 px-2 py-3 border-r border-gray-200">
                    <input
                      type="checkbox"
                      checked={totalDataRows > 0 && selectedRows.size >= totalDataRows}
                      onChange={toggleSelectAll}
                      className="rounded border-gray-300"
                    />
                  </th>
                  {content[0].map((cell, i) => {
                    const columnHasData = content.some(
                      (row) => (row[i] ?? '').trim().length > 0
                    )
                    return (
                      <th key={i} scope="col" className="px-2 py-2 border-r border-gray-200 last:border-r-0">
                        <div className="flex items-center gap-2">
                          {columnHasData && (
                            <input
                              type="checkbox"
                              checked={selectedColumns.has(i)}
                              onChange={() =>
                                setSelectedColumns((prev) => {
                                  const next = new Set(prev)
                                  if (next.has(i)) next.delete(i)
                                  else next.add(i)
                                  return next
                                })
                              }
                              className="mt-0.5 rounded border-gray-300"
                            />
                          )}
                          <input
                            value={cell}
                            onChange={(e) => updateCell(0, i, e.target.value)}
                            className="w-full min-w-[100px] border-0 bg-transparent px-2 py-1.5 font-medium text-gray-900 focus:ring-2 focus:ring-inset focus:ring-blue-500"
                          />
                        </div>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {pageRows.map((row, idx) => {
                  const dataRowIndex = rowIndices[idx]
                  return (
                    <tr key={dataRowIndex} className="hover:bg-gray-50">
                      <td className="w-10 px-2 py-2 border-r border-gray-200">
                        <input
                          type="checkbox"
                          checked={selectedRows.has(dataRowIndex)}
                          onChange={() => toggleRowSelection(dataRowIndex)}
                          className="rounded border-gray-300"
                        />
                      </td>
                      {Array.from({ length: numCols }, (_, colIndex) => (
                        <td key={colIndex} className="p-0 border-r border-gray-200 last:border-r-0">
                          <input
                            value={row[colIndex] ?? ''}
                            onChange={(e) => updateCell(dataRowIndex + 1, colIndex, e.target.value)}
                            className="w-full min-w-[100px] border-0 bg-transparent px-4 py-3 text-gray-700 focus:ring-2 focus:ring-inset focus:ring-blue-500"
                          />
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Footer: Add row + pagination */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-4 border-t border-gray-200 pt-3">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={addRow}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1"
              >
                + Add row
              </button>
              <span className="text-sm text-gray-600">
                Showing {totalDataRows === 0 ? 0 : startRow + 1} to {endRow} of {totalDataRows} entries
              </span>
              <label className="flex items-center gap-2 text-sm text-gray-600">
                Rows per page
                <select
                  value={rowsPerPage}
                  onChange={(e) => { setRowsPerPage(Number(e.target.value)); setPage(1); }}
                  className="rounded border border-gray-300 py-1 pl-2 pr-6 text-sm"
                >
                  {ROWS_PER_PAGE_OPTIONS.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage(1)}
                disabled={currentPage <= 1}
                className="rounded border border-gray-300 bg-white px-2 py-1.5 text-sm disabled:opacity-50"
              >
                &laquo;
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="rounded border border-gray-300 bg-white px-2 py-1.5 text-sm disabled:opacity-50"
              >
                &lsaquo;
              </button>
              <span className="px-3 py-1.5 text-sm text-gray-600">
                Page {currentPage} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="rounded border border-gray-300 bg-white px-2 py-1.5 text-sm disabled:opacity-50"
              >
                &rsaquo;
              </button>
              <button
                type="button"
                onClick={() => setPage(totalPages)}
                disabled={currentPage >= totalPages}
                className="rounded border border-gray-300 bg-white px-2 py-1.5 text-sm disabled:opacity-50"
              >
                &raquo;
              </button>
            </div>
          </div>
        </>
      )}

      {content && content.length === 0 && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center text-sm text-gray-500">
          No data. Use &quot;+ Add row&quot; or &quot;Other options &rarr; Add row&quot; to add rows.
        </div>
      )}

      {!content && !loading && tabs.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center text-sm text-gray-500">
          Select a tab or open a file from Home.
        </div>
      )}
    </div>
  )
}
