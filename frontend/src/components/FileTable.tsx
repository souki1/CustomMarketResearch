import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { FileTableRow as Row } from '@/types'

const MENU_MIN_WIDTH = 160
/** Menu is ~190px (5–6 items). Use so flip/position align with button. */
const ESTIMATED_MENU_HEIGHT = 200
const VIEWPORT_PADDING = 16
const MENU_GAP = 4

type SortKey = 'name' | 'createdAt' | 'owner'
type SortDir = 'asc' | 'desc'

type FileTableProps = {
  rows: Row[]
  onOpenFolder?: (folderId: string) => void
  onOpenFile?: (fileId: string, fileName?: string) => void
  onRename?: (row: Row) => void
  onDuplicate?: (row: Row) => void
  onShare?: (row: Row) => void
  onDownload?: (row: Row) => void
  onDelete?: (row: Row) => void
}

function FolderIcon() {
  return (
    <svg
      className="h-5 w-5 shrink-0 text-amber-500"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2-2z"
      />
    </svg>
  )
}

function FileIcon() {
  return (
    <svg
      className="h-5 w-5 shrink-0 text-gray-400"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
  )
}

function StarIcon({ filled }: { filled: boolean }) {
  const path =
    'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z'
  return (
    <svg
      className={`h-5 w-5 ${filled ? 'fill-amber-400' : ''}`}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d={path} />
    </svg>
  )
}

function FileTableRow({
  row,
  onOpenFolder,
  onOpenFile,
  onRename,
  onDuplicate,
  onShare,
  onDownload,
  onDelete,
}: {
  row: Row
  onOpenFolder?: (folderId: string) => void
  onOpenFile?: (fileId: string, fileName?: string) => void
  onRename?: (row: Row) => void
  onDuplicate?: (row: Row) => void
  onShare?: (row: Row) => void
  onDownload?: (row: Row) => void
  onDelete?: (row: Row) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const portalMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) {
      setMenuPosition(null)
      return
    }
    const rect = buttonRef.current?.getBoundingClientRect()
    if (!rect) return
    const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_PADDING
    const openAbove = spaceBelow < ESTIMATED_MENU_HEIGHT
    // Place menu right next to button: below (top = bottom + gap) or above (bottom of menu = top of button - gap)
    let top = openAbove
      ? rect.top - ESTIMATED_MENU_HEIGHT - MENU_GAP
      : rect.bottom + MENU_GAP
    // Keep menu fully in viewport
    top = Math.max(VIEWPORT_PADDING, Math.min(top, window.innerHeight - ESTIMATED_MENU_HEIGHT - VIEWPORT_PADDING))
    // Align menu under the button (same column); clamp so it stays on screen
    let left = rect.left
    left = Math.max(VIEWPORT_PADDING, Math.min(left, window.innerWidth - MENU_MIN_WIDTH - VIEWPORT_PADDING))
    setMenuPosition({
      top,
      left,
    })
  }, [menuOpen])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node
      if (menuOpen && !buttonRef.current?.contains(target) && !portalMenuRef.current?.contains(target)) {
        setMenuOpen(false)
      }
    }
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [menuOpen])

  const closeMenu = () => setMenuOpen(false)

  const handleOpen = () => {
    if (row.isFolder && onOpenFolder) onOpenFolder(row.id)
    else if (!row.isFolder && onOpenFile) onOpenFile(row.id, row.name)
    closeMenu()
  }

  const handleRename = () => { onRename?.(row); closeMenu() }
  const handleDuplicate = () => { onDuplicate?.(row); closeMenu() }
  const handleShare = () => { onShare?.(row); closeMenu() }
  const handleDownload = () => { onDownload?.(row); closeMenu() }
  const openDeleteConfirm = () => {
    closeMenu()
    setDeleteConfirmOpen(true)
  }
  const closeDeleteConfirm = () => setDeleteConfirmOpen(false)
  const confirmDelete = () => {
    onDelete?.(row)
    closeDeleteConfirm()
  }

  return (
    <tr className="transition-colors hover:bg-gray-100">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          {row.isFolder ? <FolderIcon /> : <FileIcon />}
          {row.isFolder && onOpenFolder ? (
            <button
              type="button"
              onClick={() => onOpenFolder(row.id)}
              className="font-medium text-gray-900 text-left hover:text-blue-600 focus:outline-none focus:ring-0 focus:underline"
            >
              {row.name}
            </button>
          ) : onOpenFile ? (
            <button
              type="button"
              onClick={() => onOpenFile(row.id, row.name)}
              className="font-medium text-gray-900 text-left hover:text-blue-600 focus:outline-none focus:ring-0 focus:underline"
            >
              {row.name}
            </button>
          ) : (
            <span className="font-medium text-gray-900">{row.name}</span>
          )}
        </div>
      </td>
      <td className="px-4 py-3">
        <button
          type="button"
          className="text-gray-400 hover:text-amber-500 focus:outline-none"
          aria-label={row.favorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          <StarIcon filled={row.favorite} />
        </button>
      </td>
      <td className="px-4 py-3 text-gray-500">—</td>
      <td className="px-4 py-3 text-gray-600">{row.createdAt}</td>
      <td className="px-4 py-3 text-gray-600">{row.lastOpened}</td>
      <td className="px-4 py-3">
        <span className="inline-flex items-center gap-2 text-gray-600">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-xs font-medium text-emerald-700">
            {row.owner.slice(0, 1)}
          </span>
          {row.owner}
        </span>
      </td>
      <td className="px-4 py-3 text-gray-600">{row.access}</td>
      <td className="px-4 py-3">
        <div className="relative">
          <button
            ref={buttonRef}
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            aria-label="More options"
            aria-expanded={menuOpen}
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="5" r="1.5" />
              <circle cx="12" cy="12" r="1.5" />
              <circle cx="12" cy="19" r="1.5" />
            </svg>
          </button>
          {menuOpen && menuPosition &&
            createPortal(
              <div
                ref={portalMenuRef}
                className="fixed z-[100] min-w-[160px] rounded-xl border border-gray-200 bg-white py-1 shadow-sm"
                role="menu"
                style={{ top: menuPosition.top, left: menuPosition.left }}
              >
              <button type="button" onClick={handleOpen} className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none" role="menuitem">
                <svg className="h-4 w-4 text-gray-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 11h14" /></svg>
                Open
              </button>
              <button type="button" onClick={handleRename} className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none" role="menuitem">
                <svg className="h-4 w-4 text-gray-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                Rename
              </button>
              <button type="button" onClick={handleDuplicate} className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none" role="menuitem">
                <svg className="h-4 w-4 text-gray-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h2m8 0h2a2 2 0 012 2v2m0 8V6a2 2 0 012-2h2m0 8h2a2 2 0 002-2v-2" /></svg>
                Duplicate
              </button>
              <button type="button" onClick={handleShare} className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none" role="menuitem">
                <svg className="h-4 w-4 text-gray-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                Share
              </button>
              {!row.isFolder && (
                <button type="button" onClick={handleDownload} className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none" role="menuitem">
                  <svg className="h-4 w-4 text-gray-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  Download
                </button>
              )}
              <button type="button" onClick={openDeleteConfirm} className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 focus:bg-red-50 focus:outline-none" role="menuitem">
                <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                Delete
              </button>
              </div>,
              document.body
            )}
          {deleteConfirmOpen &&
            createPortal(
              <>
                <div
                  className="fixed inset-0 z-[110] bg-black/20"
                  aria-hidden
                  onClick={closeDeleteConfirm}
                />
                <div
                  className="fixed left-1/2 top-1/2 z-[111] w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="delete-confirm-title"
                >
                  <p id="delete-confirm-title" className="text-sm font-medium text-gray-900">
                    Are you sure you want to delete this item?
                  </p>
                  <div className="mt-6 flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={closeDeleteConfirm}
                      className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={confirmDelete}
                      className="rounded-lg px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500/20"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </>,
              document.body
            )}
        </div>
      </td>
    </tr>
  )
}

function SortIcon({ dir }: { dir: 'asc' | 'desc' | null }) {
  if (!dir) return <span className="ml-1 inline-block w-4 text-gray-400">↕</span>
  return <span className="ml-1 inline-block w-4 text-gray-600">{dir === 'asc' ? '↑' : '↓'}</span>
}

export function FileTable({
  rows,
  onOpenFolder,
  onOpenFile,
  onRename,
  onDuplicate,
  onShare,
  onDownload,
  onDelete,
}: FileTableProps) {
  const [sortBy, setSortBy] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const sortedRows = useMemo(() => {
    const copy = [...rows]
    copy.sort((a, b) => {
      let cmp = 0
      if (sortBy === 'name') {
        cmp = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      } else if (sortBy === 'owner') {
        cmp = a.owner.localeCompare(b.owner, undefined, { sensitivity: 'base' })
      } else {
        const dA = new Date(a.createdAt).getTime()
        const dB = new Date(b.createdAt).getTime()
        cmp = dA - dB
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return copy
  }, [rows, sortBy, sortDir])

  const toggleSort = (key: SortKey) => {
    setSortBy(key)
    setSortDir((d) => (sortBy === key ? (d === 'asc' ? 'desc' : 'asc') : 'asc'))
  }

  const thClass = "px-4 py-3 font-medium text-gray-900"
  const thSortClass = thClass + " cursor-pointer select-none hover:bg-gray-100 rounded-t transition-colors"

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 shadow-sm">
      <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th scope="col">
              <button type="button" onClick={() => toggleSort('name')} className={`${thSortClass} flex items-center`}>
                Name
                <SortIcon dir={sortBy === 'name' ? sortDir : null} />
              </button>
            </th>
            <th scope="col" className="w-12 px-4 py-3 font-medium text-gray-900">
              Favorite
            </th>
            <th scope="col" className="px-4 py-3 font-medium text-gray-900">
              Tags
            </th>
            <th scope="col">
              <button type="button" onClick={() => toggleSort('createdAt')} className={`${thSortClass} flex items-center`}>
                Created at
                <SortIcon dir={sortBy === 'createdAt' ? sortDir : null} />
              </button>
            </th>
            <th scope="col" className="px-4 py-3 font-medium text-gray-900">
              Last opened by me
            </th>
            <th scope="col">
              <button type="button" onClick={() => toggleSort('owner')} className={`${thSortClass} flex items-center`}>
                Owner
                <SortIcon dir={sortBy === 'owner' ? sortDir : null} />
              </button>
            </th>
            <th scope="col" className="px-4 py-3 font-medium text-gray-900">
              Access
            </th>
            <th scope="col" className="w-12 px-4 py-3" aria-label="Actions" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white">
          {sortedRows.map((row) => (
            <FileTableRow
              key={row.id}
              row={row}
              onOpenFolder={onOpenFolder}
              onOpenFile={onOpenFile}
              onRename={onRename}
              onDuplicate={onDuplicate}
              onShare={onShare}
              onDownload={onDownload}
              onDelete={onDelete}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}
