import { useEffect, useState } from 'react'
import {
  AllFilesView,
  Card,
  CreateFileModal,
  CreateFolderModal,
} from '@/components'
import { getCurrentUserName } from '@/lib/auth'
import type { FileTableRow } from '@/types'



const icon3DClass = 'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl'

const FEATURE_CARDS = [
  {
    id: 'import-image',
    title: 'Upload Image',
    description: 'Upload images from your device or drag and drop.',
    icon: (
      <div className={`${icon3DClass} bg-gradient-to-br from-emerald-50 to-emerald-100/90`}>
        <svg className="h-8 w-8 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </div>
    ),
  },
  {
    id: 'import-data',
    title: 'Import data',
    description: 'Import your existing list from CRM or CSV.',
    icon: (
      <div className={`${icon3DClass} bg-gradient-to-br from-violet-50 to-violet-100/90`}>
        <svg className="h-8 w-8 text-violet-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
      </div>
    ),
  },
  {
    id: 'start-template',
    title: 'Start from template',
    description: 'Choose from pre-built workflows to get started.',
    icon: (
      <div className={`${icon3DClass} bg-gradient-to-br from-blue-50 to-blue-100/90`}>
        <svg className="h-8 w-8 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" />
        </svg>
      </div>
    ),
  },
] as const

const PLACEHOLDER_FILES: FileTableRow[] = [
  { id: 'f1', name: 'Clay Starter Table', isFolder: false, favorite: true, createdAt: 'Feb 25, 2026', lastOpened: 'Feb 28, 2026', owner: 'Souki Girish', access: 'Edit', parentId: null },
  { id: 'f2', name: 'People Search', isFolder: false, favorite: false, createdAt: 'Feb 25, 2026', lastOpened: 'Feb 28, 2026', owner: 'Souki Girish', access: 'Edit', parentId: null },
  { id: 'f3', name: 'updated_file2', isFolder: false, favorite: false, createdAt: 'Feb 25, 2026', lastOpened: 'Feb 28, 2026', owner: 'Souki Girish', access: 'Edit', parentId: null },
  { id: 'f4', name: 'Copy of 10K Finder & Analyzer | Sales', isFolder: false, favorite: false, createdAt: 'Feb 25, 2026', lastOpened: 'Feb 28, 2026', owner: 'Souki Girish', access: 'Edit', parentId: null },
]

type FileTab = 'all' | 'recents' | 'favourites'

type FolderItem = { id: string; name: string; createdAt: string; parentId: string | null }
type FileItem = { id: string; name: string; createdAt: string; lastOpened: string; owner: string; access: string; parentId: string | null }

export function HomePage() {
  const [displayName, setDisplayName] = useState(() => getCurrentUserName() ?? 'there')
  const [searchQuery, setSearchQuery] = useState('')
  const [fileTab, setFileTab] = useState<FileTab>('all')
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const [createFolderOpen, setCreateFolderOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [createFileOpen, setCreateFileOpen] = useState(false)
  const [newFileName, setNewFileName] = useState('')
  const [folders, setFolders] = useState<FolderItem[]>([])
  const [files, setFiles] = useState<FileItem[]>([])

  useEffect(() => {
    const stored = getCurrentUserName()
    if (stored) setDisplayName(stored)
  }, [])

  const handleCreateFolder = () => {
    const name = newFolderName.trim()
    if (!name) return
    setFolders((prev) => [
      ...prev,
      {
        id: `folder-${Date.now()}`,
        name,
        createdAt: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        parentId: currentFolderId,
      },
    ])
    setNewFolderName('')
    setCreateFolderOpen(false)
  }

  const handleCreateFile = () => {
    const name = newFileName.trim()
    if (!name) return
    const now = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    setFiles((prev) => [
      ...prev,
      {
        id: `file-${Date.now()}`,
        name,
        createdAt: now,
        lastOpened: '—',
        owner: displayName,
        access: 'Edit',
        parentId: currentFolderId,
      },
    ])
    setNewFileName('')
    setCreateFileOpen(false)
  }

  const allRows: FileTableRow[] = [
    ...folders.map((f) => ({
      id: f.id,
      name: f.name,
      isFolder: true,
      favorite: false,
      createdAt: f.createdAt,
      lastOpened: '—',
      owner: displayName,
      access: 'Edit',
      parentId: f.parentId,
    })),
    ...PLACEHOLDER_FILES,
    ...files.map((f) => ({
      id: f.id,
      name: f.name,
      isFolder: false,
      favorite: false,
      createdAt: f.createdAt,
      lastOpened: f.lastOpened,
      owner: f.owner,
      access: f.access,
      parentId: f.parentId,
    })),
  ]

  const rowsInCurrentFolder = allRows.filter(
    (row) => (row.parentId ?? null) === currentFolderId
  )

  const breadcrumbPath = (() => {
    if (!currentFolderId) return []
    const path: { id: string; name: string }[] = []
    let id: string | null = currentFolderId
    while (id) {
      const folder = folders.find((f) => f.id === id)
      if (!folder) break
      path.unshift({ id: folder.id, name: folder.name })
      id = folder.parentId
    }
    return path
  })()

  return (
    <div className="min-h-full bg-white">
      <div className="flex flex-col pl-6 pr-6 py-6">
        <h1 className="text-base font-bold tracking-tight text-gray-900 sm:text-lg">
          Hey {displayName}, ready to get started?
        </h1>

        <div className="mt-2 flex w-full max-w-xl items-center rounded-xl border border-gray-200 bg-white px-3 py-1.5 shadow-sm">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-yellow-100 text-sm">
            <span role="img" aria-label="search">🔍</span>
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Ask me anything about Clay or describe what you'd like to do..."
            className="min-w-0 flex-1 border-none bg-transparent px-2 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-0"
          />
          <button
            type="button"
            className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-md bg-blue-500 text-white transition-colors hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
            aria-label="Submit"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
            </svg>
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-5">
          {FEATURE_CARDS.map((card) => (
            <Card
              key={card.id}
              as="button"
              type="button"
              className="flex w-80 flex-row items-center gap-4"
            >
              {card.icon}
              <div className="min-w-10 flex-1">
                <p className="text-sm font-semibold text-gray-900">{card.title}</p>
                <p className="mt-1 text-xs leading-snug text-gray-500">{card.description}</p>
              </div>
            </Card>
          ))}
        </div>

        <div className="mt-6 flex gap-6 border-b border-gray-200">
          {(['all', 'recents', 'favourites'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setFileTab(tab)}
              className={`pb-2.5 text-sm font-medium transition-colors focus:outline-none focus:ring-0 ${
                fileTab === tab
                  ? 'border-b-2 border-blue-600 text-blue-600 -mb-px'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab === 'all' ? 'All files' : tab === 'recents' ? 'Recents' : 'Favorites'}
            </button>
          ))}
        </div>

        {fileTab === 'all' && (
          <AllFilesView
            rows={rowsInCurrentFolder}
            breadcrumbPath={breadcrumbPath}
            onOpenFolder={setCurrentFolderId}
            onGoToFolder={setCurrentFolderId}
            onNewFolderClick={() => setCreateFolderOpen(true)}
            onNewFileClick={() => setCreateFileOpen(true)}
          />
        )}

        {fileTab === 'recents' && (
          <div className="mt-6 text-sm text-gray-500">Recents — no items yet.</div>
        )}
        {fileTab === 'favourites' && (
          <div className="mt-6 text-sm text-gray-500">Favorites — no items yet.</div>
        )}
      </div>

      <CreateFolderModal
        open={createFolderOpen}
        name={newFolderName}
        onNameChange={setNewFolderName}
        onCreate={handleCreateFolder}
        onCancel={() => {
          setCreateFolderOpen(false)
          setNewFolderName('')
        }}
      />
      <CreateFileModal
        open={createFileOpen}
        name={newFileName}
        onNameChange={setNewFileName}
        onCreate={handleCreateFile}
        onCancel={() => {
          setCreateFileOpen(false)
          setNewFileName('')
        }}
      />
    </div>
  )
}
