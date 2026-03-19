const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export type SignUpPayload = { email: string; password: string; display_name?: string }
export type SignInPayload = { email: string; password: string }
export type AuthResponse = { access_token: string; token_type: string; display_name: string }

export type WorkspaceItem = {
  id: number
  name: string
  is_folder: boolean
  parent_id: number | null
  favorite: boolean
  access: string
  created_at: string
  last_opened: string | null
  owner_display_name?: string | null
}

async function request<T>(
  path: string,
  options: RequestInit & { token?: string } = {}
): Promise<T> {
  const { token, ...init } = options
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string>),
  }
  if (token) (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    const msg = Array.isArray(err.detail) ? err.detail[0]?.msg ?? 'Request failed' : (err.detail ?? 'Request failed')
    throw new Error(typeof msg === 'string' ? msg : 'Request failed')
  }
  return res.json()
}

export async function signUp(payload: SignUpPayload): Promise<AuthResponse> {
  return request<AuthResponse>('/auth/signup', { method: 'POST', body: JSON.stringify(payload) })
}

export async function signIn(payload: SignInPayload): Promise<AuthResponse> {
  return request<AuthResponse>('/auth/signin', { method: 'POST', body: JSON.stringify(payload) })
}

export type MeResponse = {
  id: number
  email: string
  display_name: string
  phone: string | null
  job_title: string | null
  profile_photo_url: string | null
}

export async function getMe(token: string): Promise<MeResponse> {
  return request<MeResponse>('/auth/me', { token })
}

export async function updateProfile(
  payload: { display_name?: string; phone?: string; job_title?: string },
  token: string
): Promise<MeResponse> {
  return request<MeResponse>('/auth/me', {
    method: 'PATCH',
    body: JSON.stringify(payload),
    token,
  })
}

export function profilePhotoUrl(url: string | null | undefined): string | null {
  if (!url) return null
  const base = API_BASE.replace(/\/$/, '')
  const path = url.startsWith('/') ? url : `/${url}`
  return `${base}${path}`
}

export async function uploadProfilePhoto(file: File, token: string): Promise<MeResponse> {
  const headers: HeadersInit = { Authorization: `Bearer ${token}` }
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${API_BASE}/auth/me/photo`, {
    method: 'POST',
    headers,
    body: form,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    const msg = typeof err.detail === 'string' ? err.detail : 'Upload failed'
    throw new Error(msg)
  }
  return res.json()
}

export type PasswordChangeRequestResponse = { detail: string; delivery?: string | null; dev_code?: string | null }

export async function requestPasswordChangeCode(
  token: string,
  channel: 'email' | 'sms' = 'email'
): Promise<PasswordChangeRequestResponse> {
  return request<PasswordChangeRequestResponse>('/auth/change-password/request', {
    method: 'POST',
    body: JSON.stringify({ channel }),
    token,
  })
}

export type PasswordChangeConfirmResponse = { detail: string }

export async function confirmPasswordChange(
  token: string,
  payload: { code: string; new_password: string }
): Promise<PasswordChangeConfirmResponse> {
  return request<PasswordChangeConfirmResponse>('/auth/change-password/confirm', {
    method: 'POST',
    body: JSON.stringify(payload),
    token,
  })
}

export function getGoogleLoginUrl(): string {
  return `${API_BASE}/auth/google`
}

export async function listWorkspaceItems(parentId: number | null, token: string): Promise<WorkspaceItem[]> {
  const search = parentId == null ? '' : `?parent_id=${parentId}`
  return request<WorkspaceItem[]>(`/workspace/items${search}`, { token })
}

export async function createWorkspaceFolder(
  name: string,
  parentId: number | null,
  token: string
): Promise<WorkspaceItem> {
  return request<WorkspaceItem>('/workspace/folders', {
    method: 'POST',
    body: JSON.stringify({ name, is_folder: true, parent_id: parentId }),
    token,
  })
}

export async function createWorkspaceFile(
  name: string,
  parentId: number | null,
  token: string
): Promise<WorkspaceItem> {
  return request<WorkspaceItem>('/workspace/files', {
    method: 'POST',
    body: JSON.stringify({ name, is_folder: false, parent_id: parentId }),
    token,
  })
}

export async function uploadWorkspaceCsv(
  file: File,
  parentId: number | null,
  token: string
): Promise<WorkspaceItem> {
  const form = new FormData()
  form.append('file', file)
  if (parentId != null) form.append('parent_id', String(parentId))

  const headers: HeadersInit = {}
  if (token) (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${API_BASE}/workspace/upload-csv`, {
    method: 'POST',
    headers,
    body: form,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    const msg = Array.isArray(err.detail) ? err.detail[0]?.msg ?? 'Request failed' : (err.detail ?? 'Request failed')
    throw new Error(typeof msg === 'string' ? msg : 'Request failed')
  }
  return res.json()
}

export async function uploadWorkspaceImage(
  file: File,
  parentId: number | null,
  token: string
): Promise<WorkspaceItem> {
  const form = new FormData()
  form.append('file', file)
  if (parentId != null) form.append('parent_id', String(parentId))

  const headers: HeadersInit = {}
  if (token) (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${API_BASE}/workspace/upload-image`, {
    method: 'POST',
    headers,
    body: form,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    const msg = Array.isArray(err.detail) ? err.detail[0]?.msg ?? 'Request failed' : (err.detail ?? 'Request failed')
    throw new Error(typeof msg === 'string' ? msg : 'Request failed')
  }
  return res.json()
}

export async function moveWorkspaceItem(
  itemId: number,
  parentId: number | null,
  token: string
): Promise<WorkspaceItem> {
  return request<WorkspaceItem>(`/workspace/items/${itemId}/move`, {
    method: 'PATCH',
    body: JSON.stringify({ parent_id: parentId }),
    token,
  })
}

export async function getWorkspaceFileContent(itemId: number, token: string): Promise<string> {
  const headers: HeadersInit = { Authorization: `Bearer ${token}` }
  const res = await fetch(`${API_BASE}/workspace/items/${itemId}/content`, { headers })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    const msg = Array.isArray(err.detail) ? err.detail[0]?.msg ?? 'Request failed' : (err.detail ?? 'Request failed')
    throw new Error(typeof msg === 'string' ? msg : 'Request failed')
  }
  return res.text()
}

export async function updateWorkspaceFileContent(
  itemId: number,
  content: string,
  token: string
): Promise<void> {
  const headers: HeadersInit = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'text/plain; charset=utf-8',
  }
  const res = await fetch(`${API_BASE}/workspace/items/${itemId}/content`, {
    method: 'PUT',
    headers,
    body: content,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    const msg = Array.isArray(err.detail) ? err.detail[0]?.msg ?? 'Request failed' : (err.detail ?? 'Request failed')
    throw new Error(typeof msg === 'string' ? msg : 'Request failed')
  }
}

export type DataSheetSelectionPayload = {
  headers: string[]
  rows: string[][]
  row_indices?: number[] | null
  sheet_name?: string | null
  file_id?: number | null
  tab_id?: string | null
}

export type DataSheetSelection = {
  id: number
  headers: string[]
  rows: string[][]
  sheet_name: string | null
  file_id: number | null
  tab_id: string | null
  created_at: string
}

export async function saveDataSheetSelection(
  payload: DataSheetSelectionPayload,
  token: string
): Promise<DataSheetSelection> {
  return request<DataSheetSelection>('/datasheet/selections', {
    method: 'POST',
    body: JSON.stringify(payload),
    token,
  })
}

export async function listDataSheetSelections(token: string): Promise<DataSheetSelection[]> {
  return request<DataSheetSelection[]>('/datasheet/selections', { token })
}

export type ResearchSearchResult = {
  selection_id: number
  rows_searched: number
  total_urls: number
  research_url_ids: number[]
}

export async function searchSelectionAndStoreUrls(
  selectionId: number,
  token: string,
  aiQuery?: string | null
): Promise<ResearchSearchResult> {
  const body = aiQuery?.trim() ? { ai_query: aiQuery.trim() } : {}
  return request<ResearchSearchResult>(
    `/datasheet/selections/${selectionId}/search`,
    {
      method: 'POST',
      token,
      body: JSON.stringify(body),
    }
  )
}

export type ResearchUrlResult = {
  title: string
  link: string
  snippet: string
  position?: number
}

export type ScrapedDataItem = { url: string; data: Record<string, unknown> }

export type ResearchUrlItem = {
  id: number
  selection_id: number
  row_index: number
  search_query: string
  urls: string[]
  results: ResearchUrlResult[]
  scraped_data?: ScrapedDataItem[] | null
  headers: string[]
  row_data: string[]
  created_at: string
}

export async function listResearchUrls(
  token: string,
  options?: {
    selectionId?: number | null
    tabId?: string | null
    fileId?: number | null
    tableRowIndex?: number | null
  }
): Promise<ResearchUrlItem[]> {
  const params = new URLSearchParams()
  if (options?.selectionId != null) params.set('selection_id', String(options.selectionId))
  if (options?.tabId != null) params.set('tab_id', options.tabId)
  if (options?.fileId != null) params.set('file_id', String(options.fileId))
  if (options?.tableRowIndex != null) params.set('table_row_index', String(options.tableRowIndex))
  const search = params.toString() ? `?${params}` : ''
  return request<ResearchUrlItem[]>(`/datasheet/research-urls${search}`, { token })
}

export type PortfolioItem = {
  part_number: string | null
  vendor_name: string | null
  price: string | null
  quantity: number | null
  url: string | null
}

export async function listPortfolioItems(token: string, selectionId: number): Promise<PortfolioItem[]> {
  return request<PortfolioItem[]>(`/portfolio/items?selection_id=${selectionId}`, { token })
}

export async function deleteWorkspaceItem(itemId: number, token: string): Promise<void> {
  const headers: HeadersInit = { Authorization: `Bearer ${token}` }
  const res = await fetch(`${API_BASE}/workspace/items/${itemId}`, { method: 'DELETE', headers })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    const msg = Array.isArray(err.detail) ? err.detail[0]?.msg ?? 'Request failed' : (err.detail ?? 'Request failed')
    throw new Error(typeof msg === 'string' ? msg : 'Request failed')
  }
}
