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
  selectedRowForScraped: { fileId: number | null; tabId: string | null; rowIdx: number; partLabel: string } | null
}

export type CompareTab = {
  id: string
  name: string
  data: CompareTabData
}

export type CompareMode = 'same-part' | 'different-same-vendor' | 'different-different-vendors'

export type CompareDecisionRow = {
  id: string
  url: string
  vendor: string
  price: number | null
  priceLabel: string
  shipping: number | null
  shippingLabel: string
  availability: string
  rating: number | null
  ratingLabel: string
  delivery: string
  location: string
  contact: string
  rawData: Record<string, unknown>
  partId?: string
  partLabel?: string
}
