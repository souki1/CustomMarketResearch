import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { getToken } from '@/lib/auth'
import { getWorkspaceFileContent, listWorkspaceItems } from '@/lib/api'
import { useComparison, type ComparisonItem } from '@/contexts/ComparisonContext'

const RESEARCH_TABS_KEY = 'research-tabs'
const RESEARCH_PAGE_STATE_KEY = 'research-page-state'

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

type TabState = {
  id: string
  name: string
  data: string[][]
  fileId: number | null
  folderPath?: string | null
}

function findPartNumberColumnIndex(headers: string[]): number {
  const partHeaders = ['part number', 'part #', 'part no', 'part no.', 'sku', 'product id', 'item number', 'model']
  for (let i = 0; i < headers.length; i++) {
    const h = String(headers[i] ?? '').trim().toLowerCase()
    if (partHeaders.some((p) => h.includes(p) || h === p)) return i
  }
  return 0
}

function parsePartNumbers(input: string): string[] {
  return input
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function findRowsByPartNumbers(
  tabs: TabState[],
  activeTabId: string | null,
  partNumbers: string[]
): { items: ComparisonItem[]; found: string[]; notFound: string[] } {
  const found: string[] = []
  const notFound: string[] = []
  const seenIds = new Set<string>()
  const items: ComparisonItem[] = []

  const tab = activeTabId
    ? tabs.find((t) => t.id === activeTabId) ?? tabs[0]
    : tabs[0]
  if (!tab?.data?.length) return { items, found, notFound: partNumbers }

  const content = tab.data
  const headers = content[0] ?? []
  const partCol = findPartNumberColumnIndex(headers)

  for (const partNum of partNumbers) {
    const normalized = partNum.trim().toLowerCase()
    let matched = false
    for (let rowIdx = 1; rowIdx < content.length; rowIdx++) {
      const row = content[rowIdx]
      if (!row) continue
      const cellVal = String(row[partCol] ?? row[0] ?? '').trim()
      if (!cellVal) continue
      if (cellVal.toLowerCase() === normalized || cellVal.toLowerCase().includes(normalized)) {
        matched = true
        const title = String(row[0] ?? cellVal)
        const specs = headers.map((label, i) => ({
          label: (label || `Column ${i + 1}`).trim(),
          value: String(row[i] ?? '—'),
        }))
        const id = `${tab.id}-${rowIdx - 1}`
        if (!seenIds.has(id)) {
          seenIds.add(id)
          items.push({ id, title, imageUrl: null, specs })
        }
        found.push(partNum)
        break
      }
    }
    if (!matched) notFound.push(partNum)
  }

  return { items, found, notFound }
}

type CompareNavState =
  | {
      returnTo?: '/research'
      restoreResearchSelection?: {
        selectedRows: number[]
        activeTabId: string | null
        page: number
        rowsPerPage: number
      }
      restoreInspector?: {
        mode: 'single' | 'multi'
        selectedRowIndex: number | null
        multiRowIndices: number[]
        compareSelection: number[]
      }
    }
  | undefined

type FileEntry = { id: number; name: string; folderPath: string | null }

export function ComparePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { items, addItems, removeItem, closeAndClear } = useComparison()
  const [newTabMenuOpen, setNewTabMenuOpen] = useState(false)
  const [partNumberInput, setPartNumberInput] = useState('')
  const [partNumberFeedback, setPartNumberFeedback] = useState<{
    added: number
    found: string[]
    notFound: string[]
  } | null>(null)
  const [filePickerOpen, setFilePickerOpen] = useState(false)
  const [filePickerFiles, setFilePickerFiles] = useState<FileEntry[]>([])
  const [filePickerLoading, setFilePickerLoading] = useState(false)
  const [filePickerError, setFilePickerError] = useState<string | null>(null)
  type LoadedFile = {
    fileId: number
    name: string
    content: string[][]
    folderPath: string | null
  }
  const [selectedFilesData, setSelectedFilesData] = useState<LoadedFile[]>([])
  const [selectedFileRows, setSelectedFileRows] = useState<Record<number, Set<number>>>({})
  const [fileContentLoading, setFileContentLoading] = useState<Set<number>>(new Set())
  const [activeFileId, setActiveFileId] = useState<number | null>(null)
  const comparisonSectionRef = useRef<HTMLDivElement>(null)

  const handleCancel = () => {
    closeAndClear()
    setSelectedFileRows({})
    const state = (location.state as CompareNavState) ?? undefined
    if (state?.restoreInspector) {
      navigate('/research', { state, replace: true })
      return
    }
    if (state?.restoreResearchSelection) {
      navigate('/research', { state, replace: true })
      return
    }
    if (state?.returnTo === '/research') {
      navigate(-1)
      return
    }
    // Stay on Compare page when no restore state - user can see checkboxes unchecked and select again
    if (!state?.returnTo) return
    navigate('/research')
  }

  const handleNewSheet = () => {
    setNewTabMenuOpen(false)
    navigate('/research', { state: { action: 'newSheet' } })
  }

  const handleOpenFile = () => {
    setNewTabMenuOpen(false)
    navigate('/research', { state: { action: 'openFilePicker' } })
  }

  // Fetch workspace files when file picker opens
  useEffect(() => {
    if (!filePickerOpen) return
    const token = getToken()
    if (!token) {
      setFilePickerError('Sign in to open files.')
      return
    }
    setFilePickerLoading(true)
    setFilePickerError(null)
    async function collectFiles(parentId: number | null, pathPrefix: string): Promise<FileEntry[]> {
      const items = await listWorkspaceItems(parentId, token!)
      const result: FileEntry[] = []
      for (const item of items) {
        if (item.is_folder) {
          const nextPrefix = pathPrefix ? `${pathPrefix} / ${item.name}` : item.name
          result.push(...(await collectFiles(item.id, nextPrefix)))
        } else {
          result.push({ id: item.id, name: item.name, folderPath: pathPrefix || null })
        }
      }
      return result
    }
    collectFiles(null, '')
      .then(setFilePickerFiles)
      .catch((err) => setFilePickerError(err instanceof Error ? err.message : 'Failed to load files'))
      .finally(() => setFilePickerLoading(false))
  }, [filePickerOpen])

  const handleFilePickerFileClick = useCallback(
    (file: FileEntry) => {
      const token = getToken()
      if (!token) return
      if (selectedFilesData.some((f) => f.fileId === file.id)) return
      setFileContentLoading((prev) => new Set(prev).add(file.id))
      getWorkspaceFileContent(file.id, token)
        .then((text) => {
          const data = parseCsv(text)
          const newFile = {
            fileId: file.id,
            name: file.name,
            content: data.length > 0 ? data : [['']],
            folderPath: file.folderPath,
          }
          setSelectedFilesData((prev) => {
            const next = [...prev, newFile]
            return next
          })
          setActiveFileId((prev) => prev ?? file.id)
        })
        .catch(() => {})
        .finally(() => setFileContentLoading((prev) => {
          const next = new Set(prev)
          next.delete(file.id)
          return next
        }))
    },
    [selectedFilesData]
  )

  const handleRemoveFile = useCallback((fileId: number) => {
    setSelectedFilesData((prev) => prev.filter((f) => f.fileId !== fileId))
    setSelectedFileRows((prev) => {
      const next = { ...prev }
      delete next[fileId]
      return next
    })
    setActiveFileId((prev) => (prev === fileId ? null : prev))
  }, [])

  const buildItemsFromFileRows = useCallback(
    (fileData: LoadedFile, rowIndices: number[]): ComparisonItem[] => {
      const headers = fileData.content[0] ?? []
      return rowIndices
        .map((rowIdx) => {
          const row = fileData.content[rowIdx + 1]
          if (!row) return null
          const title = String(row[0] ?? '')
          const specs = headers.map((label, i) => ({
            label: (label || `Column ${i + 1}`).trim(),
            value: String(row[i] ?? '—'),
          }))
          return {
            id: `file-${fileData.fileId}-${rowIdx}`,
            title,
            imageUrl: null,
            specs,
          }
        })
        .filter((x): x is ComparisonItem => x != null)
    },
    []
  )

  const handleAddSelectedFileRows = useCallback(
    (fileId: number) => {
      const fileData = selectedFilesData.find((f) => f.fileId === fileId)
      const rows = selectedFileRows[fileId]
      if (!fileData || !rows || rows.size === 0) return
      const newItems = buildItemsFromFileRows(fileData, Array.from(rows).sort((a, b) => a - b))
      if (newItems.length > 0) {
        addItems(newItems)
        comparisonSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    },
    [selectedFilesData, selectedFileRows, buildItemsFromFileRows, addItems]
  )

  const totalSelectedAcrossFiles = selectedFilesData.reduce(
    (sum, f) => sum + (selectedFileRows[f.fileId]?.size ?? 0),
    0
  )
  const filesWithSelection = selectedFilesData.filter(
    (f) => (selectedFileRows[f.fileId]?.size ?? 0) > 0
  ).length

  const handleAddAllSelectedFromAllFiles = useCallback(() => {
    const allItems: ComparisonItem[] = []
    for (const fileData of selectedFilesData) {
      const rows = selectedFileRows[fileData.fileId]
      if (!rows || rows.size === 0) continue
      const items = buildItemsFromFileRows(
        fileData,
        Array.from(rows).sort((a, b) => a - b)
      )
      allItems.push(...items)
    }
    if (allItems.length > 0) {
      addItems(allItems)
      comparisonSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [selectedFilesData, selectedFileRows, buildItemsFromFileRows, addItems])

  const handleAddSingleRow = useCallback(
    (fileId: number, rowIdx: number) => {
      const fileData = selectedFilesData.find((f) => f.fileId === fileId)
      if (!fileData) return
      const newItems = buildItemsFromFileRows(fileData, [rowIdx])
      if (newItems.length > 0) {
        addItems(newItems)
        setSelectedFileRows((prev) => ({
          ...prev,
          [fileId]: new Set(prev[fileId] ?? []).add(rowIdx),
        }))
        comparisonSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    },
    [selectedFilesData, buildItemsFromFileRows, addItems]
  )

  const toggleFileRow = useCallback((fileId: number, rowIdx: number, checked: boolean) => {
    setSelectedFileRows((prev) => {
      const next = { ...prev }
      const set = new Set(next[fileId] ?? [])
      if (checked) set.add(rowIdx)
      else set.delete(rowIdx)
      next[fileId] = set
      return next
    })
  }, [])

  const handleRemoveComparisonItem = useCallback(
    (itemId: string) => {
      removeItem(itemId)
      const match = itemId.match(/^file-(\d+)-(\d+)$/)
      if (match) {
        const fileId = Number(match[1])
        const rowIdx = Number(match[2])
        setSelectedFileRows((prev) => {
          const set = new Set(prev[fileId] ?? [])
          set.delete(rowIdx)
          const next = { ...prev }
          next[fileId] = set
          return next
        })
      }
    },
    [removeItem]
  )

  const handleAddByPartNumber = useCallback(() => {
    const partNumbers = parsePartNumbers(partNumberInput)
    if (partNumbers.length === 0) {
      setPartNumberFeedback(null)
      return
    }
    let tabs: TabState[] = []
    let activeTabId: string | null = null
    try {
      const raw = localStorage.getItem(RESEARCH_TABS_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as TabState[]
        tabs = Array.isArray(parsed) ? parsed : []
      }
      const stateRaw = localStorage.getItem(RESEARCH_PAGE_STATE_KEY)
      if (stateRaw) {
        const state = JSON.parse(stateRaw) as { activeTabId?: string | null }
        activeTabId = state.activeTabId ?? null
      }
    } catch {
      // ignore
    }
    const { items: newItems, found, notFound } = findRowsByPartNumbers(tabs, activeTabId, partNumbers)
    if (newItems.length > 0) addItems(newItems)
    setPartNumberFeedback({ added: newItems.length, found, notFound })
    if (newItems.length > 0) setPartNumberInput('')
  }, [partNumberInput, addItems])

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

      {/* New sheet + New tab bar - same as ResearchTabs */}
      <div className="mt-6 mb-3 flex flex-wrap items-center gap-1 border-b border-gray-200">
        <div className="relative">
          <button
            type="button"
            onClick={() => setNewTabMenuOpen((o) => !o)}
            className="rounded-t border border-transparent px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            title="New tab"
          >
            + New tab
          </button>
          {newTabMenuOpen && (
            <div className="absolute left-0 top-full z-10 mt-1 min-w-[200px] rounded-b border border-gray-200 bg-white py-1 shadow-lg">
              <button
                type="button"
                onClick={handleNewSheet}
                className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
              >
                <span className="text-gray-400">+</span>
                New sheet
              </button>
              <button
                type="button"
                onClick={handleOpenFile}
                className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
              >
                <span className="text-gray-400">↺</span>
                Open file…
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Select file from workspace */}
      <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
        <h3 className="text-sm font-semibold text-gray-900">Select file from workspace</h3>
        <p className="mt-1 text-xs text-gray-600">
          Choose files from the Home page. Click a file chip to switch between files and select rows to add to the comparison.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setFilePickerOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            Choose file…
          </button>
          {fileContentLoading.size > 0 && (
            <span className="text-sm text-gray-500">Loading file…</span>
          )}
          {selectedFilesData.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {selectedFilesData.map((file) => {
                const isActive = file.fileId === (activeFileId ?? selectedFilesData[0]?.fileId)
                return (
                  <span
                    key={file.fileId}
                    onClick={() => setActiveFileId(file.fileId)}
                    className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1 text-sm ${
                      isActive
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <span className="font-medium">{file.name}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleRemoveFile(file.fileId)
                      }}
                      className="rounded p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
                      aria-label={`Remove ${file.name}`}
                    >
                      ×
                    </button>
                  </span>
                )
              })}
            </div>
          )}
        </div>
        {selectedFilesData.length > 0 && (() => {
          const fileData = selectedFilesData.find(
            (f) => f.fileId === (activeFileId ?? selectedFilesData[0]?.fileId)
          )
          if (!fileData) return null
          return (
          <div key={fileData.fileId} className="mt-4">
            <p className="mb-1 text-xs font-medium text-gray-600">{fileData.name}</p>
            {fileData.content.length > 1 ? (
              <div className="max-h-64 overflow-auto rounded-lg border border-gray-200 bg-white">
                <p className="border-b border-gray-200 px-3 py-2 text-xs font-medium text-gray-600">
                  Select rows to compare (header row excluded)
                </p>
                <div className="divide-y divide-gray-100">
                  {fileData.content.slice(1).map((row, idx) => {
                    const rowIdx = idx
                    const label = String(row[0] ?? row[1] ?? `Row ${rowIdx + 1}`)
                    const isChecked = (selectedFileRows[fileData.fileId] ?? new Set()).has(rowIdx)
                    return (
                      <div
                        key={rowIdx}
                        className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50"
                      >
                        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => toggleFileRow(fileData.fileId, rowIdx, e.target.checked)}
                            className="rounded border-gray-300"
                          />
                          <span className="truncate text-sm text-gray-900">{label}</span>
                        </label>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleAddSingleRow(fileData.fileId, rowIdx)
                          }}
                          className="shrink-0 rounded p-1 text-gray-400 hover:bg-emerald-100 hover:text-emerald-600"
                          title="Add to comparison"
                          aria-label="Add to comparison"
                        >
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                          </svg>
                        </button>
                      </div>
                    )
                  })}
                </div>
                <div className="border-t border-gray-200 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => handleAddSelectedFileRows(fileData.fileId)}
                    disabled={!(selectedFileRows[fileData.fileId]?.size ?? 0)}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {(selectedFileRows[fileData.fileId]?.size ?? 0) > 0
                      ? `Add ${selectedFileRows[fileData.fileId]?.size ?? 0} selected to comparison`
                      : 'Select rows above to add'}
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500">No data rows in this file.</p>
            )}
          </div>
          )
        })()}
        {selectedFilesData.length > 1 && totalSelectedAcrossFiles > 0 && (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <h4 className="text-sm font-semibold text-emerald-900">Compare rows from different files</h4>
            <p className="mt-1 text-xs text-emerald-700">
              {totalSelectedAcrossFiles} row{totalSelectedAcrossFiles !== 1 ? 's' : ''} selected from {filesWithSelection} file{filesWithSelection !== 1 ? 's' : ''}. Add all to compare side-by-side.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleAddAllSelectedFromAllFiles}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
                Add all selected to comparison
              </button>
              <button
                type="button"
                onClick={() => {
                  closeAndClear()
                  setSelectedFileRows({})
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add by part number */}
      <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
        <h3 className="text-sm font-semibold text-gray-900">Add by part number</h3>
        <p className="mt-1 text-xs text-gray-600">
          Enter part numbers from your Research sheet (comma or newline separated). Uses the first column or a column
          named &quot;Part Number&quot;, &quot;SKU&quot;, etc.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div className="min-w-[200px] flex-1">
            <textarea
              value={partNumberInput}
              onChange={(e) => setPartNumberInput(e.target.value)}
              placeholder={'e.g. ABC-123, XYZ-456\nor one per line'}
              rows={2}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          <button
            type="button"
            onClick={handleAddByPartNumber}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            Add to comparison
          </button>
        </div>
        {partNumberFeedback && (
          <div className="mt-3 text-sm">
            {partNumberFeedback.added > 0 && (
              <p className="text-emerald-700">
                Added {partNumberFeedback.added} item{partNumberFeedback.added !== 1 ? 's' : ''} to comparison.
              </p>
            )}
            {partNumberFeedback.notFound.length > 0 && (
              <p className="mt-1 text-amber-700">
                Not found: {partNumberFeedback.notFound.join(', ')}
              </p>
            )}
          </div>
        )}
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

      <div ref={comparisonSectionRef}>
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
            {items.map((item) => (
              <div key={item.id} className="relative border-b border-gray-200 pb-6">
                <button
                  type="button"
                  onClick={() => handleRemoveComparisonItem(item.id)}
                  className="absolute right-0 top-0 rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  title="Remove from comparison"
                  aria-label="Remove from comparison"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
                <div className="pr-8 text-center">
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

      {/* File picker modal */}
      {filePickerOpen && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setFilePickerOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="compare-file-picker-title"
        >
          <div
            className="flex max-h-[80vh] w-full max-w-md flex-col rounded-xl border border-gray-200 bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <h3 id="compare-file-picker-title" className="text-base font-semibold text-gray-900">
                Select file from workspace
              </h3>
              <button
                type="button"
                onClick={() => setFilePickerOpen(false)}
                className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                aria-label="Close"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {filePickerLoading && (
                <p className="py-8 text-center text-sm text-gray-500">Loading files…</p>
              )}
              {filePickerError && (
                <p className="py-4 text-center text-sm text-red-600">{filePickerError}</p>
              )}
              {!filePickerLoading && !filePickerError && filePickerFiles.length === 0 && (
                <p className="py-8 text-center text-sm text-gray-500">No files in workspace. Upload files on the Home page first.</p>
              )}
              {!filePickerLoading && !filePickerError && filePickerFiles.length > 0 && (
                <>
                  <p className="mb-2 px-2 text-xs text-gray-500">Click files to add. Close when done.</p>
                  <ul className="space-y-0.5">
                  {filePickerFiles.map((file) => {
                    const isSelected = selectedFilesData.some((f) => f.fileId === file.id)
                    const isLoading = fileContentLoading.has(file.id)
                    return (
                    <li key={file.id}>
                      <button
                        type="button"
                        onClick={() => handleFilePickerFileClick(file)}
                        disabled={isSelected || isLoading}
                        className={`flex w-full flex-col items-start gap-0.5 rounded-lg px-3 py-2.5 text-left text-sm ${
                          isSelected
                            ? 'cursor-default bg-gray-100 text-gray-500'
                            : isLoading
                              ? 'cursor-wait text-gray-500'
                              : 'text-gray-700 hover:bg-emerald-50 hover:text-emerald-800'
                        }`}
                      >
                        <span className="truncate w-full font-medium">{file.name}</span>
                        {file.folderPath && (
                          <span className="truncate w-full text-xs text-gray-500">{file.folderPath}</span>
                        )}
                        {isSelected && (
                          <span className="text-xs text-emerald-600">Added</span>
                        )}
                      </button>
                    </li>
                  )
                  })}
                </ul>
                </>
              )}
            </div>
            <div className="border-t border-gray-200 px-4 py-2">
              <button
                type="button"
                onClick={() => setFilePickerOpen(false)}
                className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
