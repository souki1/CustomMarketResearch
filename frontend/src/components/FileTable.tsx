import { useEffect, useRef, useState } from 'react'
import type { FileTableRow as Row } from '@/types'

type FileTableProps = {
  rows: Row[]
  onOpenFolder?: (folderId: string) => void
  onOpenFile?: (fileId: string, fileName?: string) => void
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
}: {
  row: Row
  onOpenFolder?: (folderId: string) => void
  onOpenFile?: (fileId: string, fileName?: string) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [menuOpen])

  const handleOpenFolder = () => {
    if (row.isFolder && onOpenFolder) onOpenFolder(row.id)
    setMenuOpen(false)
  }

  return (
    <tr className="transition-colors hover:bg-gray-50">
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
        <div className="relative" ref={menuRef}>
          <button
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
          {menuOpen && (
            <div
              className="absolute right-0 top-full z-10 mt-1 min-w-[140px] rounded-xl border border-gray-200 bg-white py-1 shadow-sm"
              role="menu"
            >
              {row.isFolder && (
                <button
                  type="button"
                  onClick={handleOpenFolder}
                  className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none"
                  role="menuitem"
                >
                  <svg className="h-4 w-4 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 11h14" />
                  </svg>
                  Open folder
                </button>
              )}
            </div>
          )}
        </div>
      </td>
    </tr>
  )
}

export function FileTable({ rows, onOpenFolder, onOpenFile }: FileTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 shadow-sm">
      <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th scope="col" className="px-4 py-3 font-medium text-gray-900">
              Name
            </th>
            <th scope="col" className="w-12 px-4 py-3 font-medium text-gray-900">
              Favorite
            </th>
            <th scope="col" className="px-4 py-3 font-medium text-gray-900">
              Tags
            </th>
            <th scope="col" className="px-4 py-3 font-medium text-gray-900">
              Created at
            </th>
            <th scope="col" className="px-4 py-3 font-medium text-gray-900">
              Last opened by me
            </th>
            <th scope="col" className="px-4 py-3 font-medium text-gray-900">
              Owner
            </th>
            <th scope="col" className="px-4 py-3 font-medium text-gray-900">
              Access
            </th>
            <th scope="col" className="w-12 px-4 py-3" aria-label="Actions" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white">
          {rows.map((row) => (
            <FileTableRow key={row.id} row={row} onOpenFolder={onOpenFolder} onOpenFile={onOpenFile} />
          ))}
        </tbody>
      </table>
    </div>
  )
}
