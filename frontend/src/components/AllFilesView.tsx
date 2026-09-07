import { ChevronRight, Search } from 'lucide-react'
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
  onOpenFile?: (fileId: string, fileName?: string, access?: string, linkedReportId?: number) => void
  onDelete?: (row: FileTableRow) => void
  onNewFolderClick: () => void
  onNewFileClick?: () => void
  onNewResearchClick?: () => void
  onNewReportClick?: () => void
  onImportCsvClick?: () => void
  onUploadFileClick?: () => void
  onMoveClick?: (row: FileTableRow) => void
}

export function AllFilesView({
  rows,
  breadcrumbPath,
  onOpenFolder,
  onGoToFolder,
  onOpenFile,
  onDelete,
  onNewFolderClick,
  onNewFileClick,
  onNewResearchClick,
  onNewReportClick,
  onImportCsvClick,
  onUploadFileClick,
  onMoveClick,
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
    <div className="mt-5 flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex min-w-0 flex-1 flex-wrap items-center gap-0.5 text-[13px] text-app-secondary" aria-label="Breadcrumb">
          {breadcrumbParts.map((part, i) => (
            <span key={i} className="flex items-center gap-0.5">
              {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-app-tertiary" strokeWidth={1.75} aria-hidden />}
              {part.onClick ? (
                <button
                  type="button"
                  onClick={part.onClick}
                  className="rounded-[6px] px-1 py-0.5 hover:bg-app-fill hover:text-app-label focus:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/40"
                >
                  {part.label}
                </button>
              ) : (
                <span className="px-1 py-0.5 font-medium text-app-label">{part.label}</span>
              )}
            </span>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <div className="flex h-8 items-center rounded-[8px] bg-app-fill px-2.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-app-tertiary" strokeWidth={1.75} aria-hidden />
            <input
              type="search"
              placeholder="Search"
              className="ml-1.5 min-w-[140px] border-none bg-transparent text-[13px] text-app-label placeholder:text-app-tertiary focus:outline-none focus:ring-0"
              aria-label="Search files"
            />
          </div>
          <NewMenu
            onFolderClick={onNewFolderClick}
            onFileClick={onNewFileClick}
            onNewResearchClick={onNewResearchClick}
            onNewReportClick={onNewReportClick}
            onImportCsvClick={onImportCsvClick ?? onNewFileClick}
            onUploadFileClick={onUploadFileClick ?? onNewFileClick}
          />
        </div>
      </div>

      <AllFilesFilters />
      <FileTable
        rows={rows}
        onOpenFolder={onOpenFolder}
        onOpenFile={onOpenFile}
        onDelete={onDelete}
        onMove={onMoveClick}
        onUploadIntoFolder={onUploadFileClick ? (row) => { if (row.isFolder) onUploadFileClick() } : undefined}
      />
    </div>
  )
}
