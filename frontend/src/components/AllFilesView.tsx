import type { FileTableRow } from '@/types'
import { AllFilesFilters } from './AllFilesFilters'
import { FileTable } from './FileTable'
import { NewMenu } from './NewMenu'

type BreadcrumbSegment = { id: string; name: string }

type AllFilesViewProps = {
  rows: FileTableRow[]
  breadcrumbPath: BreadcrumbSegment[]
  onOpenFolder: (folderId: string) => void
  onGoToFolder: (folderId: string | null) => void
  onOpenFile?: (fileId: string, fileName?: string) => void
  onNewFolderClick: () => void
  onNewFileClick: () => void
}

export function AllFilesView({
  rows,
  breadcrumbPath,
  onOpenFolder,
  onGoToFolder,
  onOpenFile,
  onNewFolderClick,
  onNewFileClick,
}: AllFilesViewProps) {
  const breadcrumbParts: { label: string; onClick?: () => void }[] = [
    { label: 'All Files', onClick: () => onGoToFolder(null) },
  ]
  breadcrumbPath.forEach((seg, i) => {
    const isLast = i === breadcrumbPath.length - 1
    breadcrumbParts.push({
      label: seg.name,
      onClick: isLast ? undefined : () => onGoToFolder(seg.id),
    })
  })

  return (
    <div className="mt-6 flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <nav className="flex flex-wrap items-center gap-1 text-sm text-gray-500" aria-label="Breadcrumb">
            {breadcrumbParts.map((part, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <span className="text-gray-400">/</span>}
                {part.onClick ? (
                  <button
                    type="button"
                    onClick={part.onClick}
                    className="hover:text-gray-900 focus:outline-none focus:ring-0"
                  >
                    {part.label}
                  </button>
                ) : (
                  <span className={i === breadcrumbParts.length - 1 ? 'text-gray-700' : ''}>{part.label}</span>
                )}
              </span>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-sm">
            <svg
              className="h-4 w-4 shrink-0 text-gray-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="search"
              placeholder="Search"
              className="ml-2 min-w-[180px] border-none bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-0"
              aria-label="Search files"
            />
          </div>
          <NewMenu onFolderClick={onNewFolderClick} onFileClick={onNewFileClick} />
        </div>
      </div>

      <div className="border-b border-gray-200" />

      <AllFilesFilters />
      <FileTable rows={rows} onOpenFolder={onOpenFolder} onOpenFile={onOpenFile} />
    </div>
  )
}
