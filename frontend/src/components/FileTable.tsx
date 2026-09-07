import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Download,
  FileBarChart,
  FileText,
  Folder,
  FolderInput,
  MoreHorizontal,
  Pencil,
  Share2,
  Star,
  Trash2,
  Upload,
} from 'lucide-react'
import type { FileTableRow as Row } from '@/types'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

type SortKey = 'name' | 'createdAt' | 'owner'
type SortDir = 'asc' | 'desc'

type FileTableProps = {
  rows: Row[]
  onOpenFolder?: (folderId: string) => void
  onOpenFile?: (fileId: string, fileName?: string, access?: string, linkedReportId?: number) => void
  onRename?: (row: Row) => void
  onMove?: (row: Row) => void
  onShare?: (row: Row) => void
  onDownload?: (row: Row) => void
  onDelete?: (row: Row) => void
  onUploadIntoFolder?: (row: Row) => void
}

function FolderIcon() {
  return <Folder className="h-4 w-4 shrink-0 text-app-warn" strokeWidth={1.75} />
}

function FileIcon() {
  return <FileText className="h-4 w-4 shrink-0 text-app-tertiary" strokeWidth={1.75} />
}

function ReportFileIcon() {
  return <FileBarChart className="h-4 w-4 shrink-0 text-app-accent" strokeWidth={1.75} />
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <Star
      className={`h-4 w-4 ${filled ? 'fill-app-warn text-app-warn' : 'text-app-tertiary'}`}
      strokeWidth={1.75}
    />
  )
}

function FileTableRow({
  row,
  onOpenFolder,
  onOpenFile,
  onRename,
  onMove,
  onShare,
  onDownload,
  onDelete,
  onUploadIntoFolder,
}: {
  row: Row
  onOpenFolder?: (folderId: string) => void
  onOpenFile?: (fileId: string, fileName?: string, access?: string, linkedReportId?: number) => void
  onRename?: (row: Row) => void
  onMove?: (row: Row) => void
  onShare?: (row: Row) => void
  onDownload?: (row: Row) => void
  onDelete?: (row: Row) => void
  onUploadIntoFolder?: (row: Row) => void
}) {
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)

  const handleOpen = () => {
    if (row.isFolder && onOpenFolder) onOpenFolder(row.id)
    else if (!row.isFolder && onOpenFile) onOpenFile(row.id, row.name, row.access, row.linkedReportId)
  }

  const handleRename = () => { onRename?.(row) }
  const handleMove = () => { onMove?.(row) }
  const handleShare = () => { onShare?.(row) }
  const handleDownload = () => { onDownload?.(row) }
  const handleUploadHere = () => { onUploadIntoFolder?.(row) }
  const openDeleteConfirm = () => {
    setDeleteConfirmOpen(true)
  }
  const closeDeleteConfirm = () => setDeleteConfirmOpen(false)
  const confirmDelete = () => {
    onDelete?.(row)
    closeDeleteConfirm()
  }

  return (
    <tr className="bg-app-surface transition-colors duration-150 ease-out hover:bg-app-fill">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          {row.isFolder ? <FolderIcon /> : row.rowKind === 'report' || row.access === 'Report' ? <ReportFileIcon /> : <FileIcon />}
          {row.isFolder && onOpenFolder ? (
            <button
              type="button"
              onClick={() => onOpenFolder(row.id)}
              className="font-medium text-app-label text-left hover:text-app-accent-hover focus:outline-none focus:ring-0 focus:underline"
            >
              {row.name}
            </button>
          ) : onOpenFile ? (
            <button
              type="button"
              onClick={() => onOpenFile(row.id, row.name, row.access, row.linkedReportId)}
              className="font-medium text-app-label text-left hover:text-app-accent-hover focus:outline-none focus:ring-0 focus:underline"
            >
              {row.name}
            </button>
          ) : (
            <span className="font-medium text-app-label">{row.name}</span>
          )}
        </div>
      </td>
      <td className="px-4 py-3">
        <button
          type="button"
          className="text-app-tertiary hover:text-amber-500 focus:outline-none"
          aria-label={row.favorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          <StarIcon filled={row.favorite} />
        </button>
      </td>
      <td className="px-4 py-3 text-app-secondary">—</td>
      <td className="px-4 py-3 text-app-secondary">{row.createdAt}</td>
      <td className="px-4 py-3 text-app-secondary">{row.lastOpened}</td>
      <td className="px-4 py-3">
        <span className="inline-flex items-center gap-2 text-app-secondary">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-app-ok-soft text-[11px] font-medium text-app-ok">
            {row.owner.slice(0, 1)}
          </span>
          {row.owner}
        </span>
      </td>
      <td className="px-4 py-3 text-app-secondary">{row.access}</td>
      <td className="px-4 py-3">
        <div className="relative">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex h-7 w-7 items-center justify-center rounded-[6px] text-app-tertiary hover:bg-app-fill hover:text-app-label focus:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/40"
                aria-label="More options"
              >
                <MoreHorizontal className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="min-w-[160px]" side="bottom" align="end" alignOffset={25} sideOffset={-1} collisionPadding={16}>
              <DropdownMenuItem onSelect={handleOpen} className="flex cursor-pointer items-center gap-2 px-3 py-1.5">
                <Folder className="h-4 w-4 shrink-0 text-app-secondary" strokeWidth={1.75} />
                Open
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={handleRename} className="flex cursor-pointer items-center gap-2 px-3 py-1.5">
                <Pencil className="h-4 w-4 shrink-0 text-app-secondary" strokeWidth={1.75} />
                Rename
              </DropdownMenuItem>
              {!row.isFolder && onMove && row.rowKind !== 'report' && row.access !== 'Report' && (
                <DropdownMenuItem onSelect={handleMove} className="flex cursor-pointer items-center gap-2 px-3 py-1.5">
                  <FolderInput className="h-4 w-4 shrink-0 text-app-secondary" strokeWidth={1.75} />
                  Move to folder
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={handleShare} className="flex cursor-pointer items-center gap-2 px-3 py-1.5">
                <Share2 className="h-4 w-4 shrink-0 text-app-secondary" strokeWidth={1.75} />
                Share
              </DropdownMenuItem>
              {row.isFolder && onUploadIntoFolder && (
                <DropdownMenuItem onSelect={handleUploadHere} className="flex cursor-pointer items-center gap-2 px-3 py-1.5">
                  <Upload className="h-4 w-4 shrink-0 text-app-secondary" strokeWidth={1.75} />
                  Upload here
                </DropdownMenuItem>
              )}
              {!row.isFolder && (
                <DropdownMenuItem onSelect={handleDownload} className="flex cursor-pointer items-center gap-2 px-3 py-1.5">
                  <Download className="h-4 w-4 shrink-0 text-app-secondary" strokeWidth={1.75} />
                  Download
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={openDeleteConfirm} variant="destructive" className="flex cursor-pointer items-center gap-2 px-3 py-1.5">
                <Trash2 className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {deleteConfirmOpen &&
            createPortal(
              <>
                <div
                  className="fixed inset-0 z-[110] bg-black/20"
                  aria-hidden
                  onClick={closeDeleteConfirm}
                />
                <div
                  className="fixed left-1/2 top-1/2 z-[111] w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-[14px] border border-app-separator bg-app-elevated p-6 shadow-[0_22px_50px_-12px_rgba(0,0,0,0.28)]"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="delete-confirm-title"
                >
                  <p id="delete-confirm-title" className="text-sm font-medium text-app-label">
                    Are you sure you want to delete this item?
                  </p>
                  <div className="mt-6 flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={closeDeleteConfirm}
                      className="rounded-lg px-4 py-2 text-sm font-medium text-app-secondary transition-colors hover:bg-app-fill focus:outline-none focus:ring-2 focus:ring-app-accent/20"
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
  if (!dir) return <ChevronsUpDown className="ml-1 h-3.5 w-3.5 text-app-tertiary" strokeWidth={1.75} />
  if (dir === 'asc') return <ChevronUp className="ml-1 h-3.5 w-3.5 text-app-secondary" strokeWidth={1.75} />
  return <ChevronDown className="ml-1 h-3.5 w-3.5 text-app-secondary" strokeWidth={1.75} />
}

export function FileTable({
  rows,
  onOpenFolder,
  onOpenFile,
  onRename,
  onMove,
  onShare,
  onDownload,
  onDelete,
  onUploadIntoFolder,
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

  const thClass = 'px-4 py-2.5 text-[11px] font-semibold tracking-[-0.01em] text-app-secondary'
  const thSortClass =
    'w-full text-left ' + thClass + ' cursor-pointer select-none hover:bg-app-fill rounded-t-[12px] transition-colors inline-flex items-center'

  return (
    <div className="overflow-x-auto rounded-[12px] border border-app-separator bg-app-surface">
      <table className="min-w-full divide-y divide-app-separator text-left text-[13px]">
        <thead className="bg-app-fill/70">
          <tr>
            <th scope="col" className="p-0" aria-sort={sortBy === 'name' ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}>
              <button type="button" onClick={() => toggleSort('name')} className={thSortClass}>
                Name
                <SortIcon dir={sortBy === 'name' ? sortDir : null} />
              </button>
            </th>
            <th scope="col" className="w-12 px-4 py-3 font-medium text-app-label">
              Favorite
            </th>
            <th scope="col" className="px-4 py-3 font-medium text-app-label">
              Tags
            </th>
            <th scope="col" className="p-0" aria-sort={sortBy === 'createdAt' ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}>
              <button type="button" onClick={() => toggleSort('createdAt')} className={thSortClass}>
                Created at
                <SortIcon dir={sortBy === 'createdAt' ? sortDir : null} />
              </button>
            </th>
            <th scope="col" className="px-4 py-3 font-medium text-app-label">
              Last opened by me
            </th>
            <th scope="col" className="p-0" aria-sort={sortBy === 'owner' ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}>
              <button type="button" onClick={() => toggleSort('owner')} className={thSortClass}>
                Owner
                <SortIcon dir={sortBy === 'owner' ? sortDir : null} />
              </button>
            </th>
            <th scope="col" className="px-4 py-3 font-medium text-app-label">
              Access
            </th>
            <th scope="col" className="w-12 px-4 py-3" aria-label="Actions" />
          </tr>
        </thead>
        <tbody className="divide-y divide-app-separator bg-app-surface">
          {sortedRows.map((row) => (
            <FileTableRow
              key={row.id}
              row={row}
              onOpenFolder={onOpenFolder}
              onOpenFile={onOpenFile}
              onRename={onRename}
              onMove={onMove}
              onShare={onShare}
              onDownload={onDownload}
              onDelete={onDelete}
              onUploadIntoFolder={onUploadIntoFolder}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}
