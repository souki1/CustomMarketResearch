// Shared TypeScript types and interfaces — export app-wide types from here

export type FileTableRow = {
  id: string
  name: string
  isFolder: boolean
  favorite: boolean
  createdAt: string
  lastOpened: string
  owner: string
  access: string
  parentId?: string | null
  /** Row is a saved report (Mongo) shown in the workspace file list */
  rowKind?: 'workspace' | 'report'
  /** Numeric report id when `rowKind === 'report'` */
  reportId?: number
}
