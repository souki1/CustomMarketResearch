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
}
