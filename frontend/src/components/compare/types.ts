export type FileEntry = { id: number; name: string; folderPath: string | null }

export type LoadedFile = {
  fileId: number
  name: string
  content: string[][]
  folderPath: string | null
}

export type CompareTabData = {
  selectedFilesData: LoadedFile[]
  selectedFileRows: Record<number, number[]>
  activeFileId: number | null
  selectedRowForScraped: { fileId: number; rowIdx: number; partLabel: string } | null
}

export type CompareTab = {
  id: string
  name: string
  data: CompareTabData
}

export type CompareMode = 'same-part' | 'different-same-vendor' | 'different-different-vendors'
