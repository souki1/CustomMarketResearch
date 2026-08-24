import { getToken } from './auth'

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

/** Always read JWT from storage so requests never use a stale token captured in React closures. */
function bearerAuthHeader(): Record<string, string> {
  const t = getToken()
  return t ? { Authorization: `Bearer ${t}` } : {}
}

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
  report_id?: number | null
}

async function request<T>(
  path: string,
  options: RequestInit & { token?: string } = {}
): Promise<T> {
  const { token: _ignoredExplicitToken, ...init } = options
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string>),
    ...bearerAuthHeader(),
  }
  void _ignoredExplicitToken
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
  const headers: HeadersInit = { ...bearerAuthHeader() }
  void token
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

  const headers: HeadersInit = { ...bearerAuthHeader() }
  void token

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

  const headers: HeadersInit = { ...bearerAuthHeader() }
  void token

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

export async function uploadWorkspaceDocx(file: File, token: string): Promise<WorkspaceItem> {
  const form = new FormData()
  form.append('file', file)

  const headers: HeadersInit = { ...bearerAuthHeader() }
  void token

  const res = await fetch(`${API_BASE}/workspace/upload-docx`, {
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

export async function getWorkspaceMediaBlob(itemId: number, token: string): Promise<Blob> {
  const headers: HeadersInit = { ...bearerAuthHeader() }
  void token
  const res = await fetch(`${API_BASE}/workspace/items/${itemId}/media`, { headers })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    const msg = Array.isArray(err.detail) ? err.detail[0]?.msg ?? 'Request failed' : (err.detail ?? 'Request failed')
    throw new Error(typeof msg === 'string' ? msg : 'Request failed')
  }
  return res.blob()
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
  const headers: HeadersInit = { ...bearerAuthHeader() }
  void token
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

export type ResearchSearchLocation = {
  zipCode?: string | null
  address?: string | null
  location?: string | null
}

export async function searchSelectionAndStoreUrls(
  selectionId: number,
  token: string,
  aiQuery?: string | null,
  searchLocation?: ResearchSearchLocation | null
): Promise<ResearchSearchResult> {
  const body: Record<string, string> = {}
  const query = aiQuery?.trim() ?? ''
  if (query) body.ai_query = query
  const zip = searchLocation?.zipCode?.trim() ?? ''
  const address = searchLocation?.address?.trim() ?? ''
  const location = searchLocation?.location?.trim() ?? ''
  if (zip) body.zip_code = zip.slice(0, 20)
  if (address) body.address = address.slice(0, 300)
  if (location) body.location = location.slice(0, 300)
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

export type ResearchFieldChange = {
  field: string
  before?: unknown
  after?: unknown
  kind: 'updated' | 'added'
}

export type ResearchChangeLogEntry = {
  at: string
  changes: ResearchFieldChange[]
}

export type ScrapedDataItem = {
  id?: number | null
  url: string
  data: Record<string, unknown>
  last_field_changes?: ResearchFieldChange[] | null
  change_log?: ResearchChangeLogEntry[] | null
}

export type ResearchUrlItem = {
  id: number
  selection_id: number
  row_index: number
  /** Sheet data row index (0 = first row under header); aligns with wishlist / research grid rows. */
  table_row_index?: number | null
  file_id?: number | null
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
    /** Skip Groq re-cleaning; use cached cleaned/raw scraped data only (wishlist/catalog). */
    fast?: boolean
  }
): Promise<ResearchUrlItem[]> {
  const params = new URLSearchParams()
  if (options?.selectionId != null) params.set('selection_id', String(options.selectionId))
  if (options?.tabId != null) params.set('tab_id', options.tabId)
  if (options?.fileId != null) params.set('file_id', String(options.fileId))
  if (options?.tableRowIndex != null) params.set('table_row_index', String(options.tableRowIndex))
  if (options?.fast) params.set('fast', 'true')
  const search = params.toString() ? `?${params}` : ''
  return request<ResearchUrlItem[]>(`/datasheet/research-urls${search}`, { token })
}

export type ResearchTransferRowMap = {
  source_table_row_index: number
  dest_table_row_index: number
}

export type ResearchTransferRequest = {
  mode: 'move' | 'duplicate'
  source_file_id?: number | null
  source_tab_id?: string | null
  dest_file_id?: number | null
  dest_tab_id?: string | null
  row_map: ResearchTransferRowMap[]
}

export type ResearchTransferResponse = {
  mode: 'move' | 'duplicate'
  rows_matched: number
  research_docs_touched: number
  scraped_docs_copied: number
}

/** Move or copy research_urls (+ scraped/cleaned on duplicate) to destination sheet rows. */
export async function transferResearchUrls(
  token: string,
  body: ResearchTransferRequest
): Promise<ResearchTransferResponse> {
  return request<ResearchTransferResponse>('/datasheet/research-urls/transfer', {
    method: 'POST',
    token,
    body: JSON.stringify(body),
  })
}

export type ResearchMoreSourceResult = {
  research_url_id: number
  scraped_id: number
  url: string
  data: Record<string, unknown>
  updated_fields: string[]
  new_fields: string[]
  field_changes?: ResearchFieldChange[]
  change_log?: ResearchChangeLogEntry[]
}

/** Re-scrape one existing source URL with a prompt; merges updated/new fields into that source only. */
export async function researchMoreSource(
  token: string,
  researchUrlId: number,
  payload: { scrapedId: number; aiQuery: string }
): Promise<ResearchMoreSourceResult> {
  return request<ResearchMoreSourceResult>(
    `/datasheet/research-urls/${researchUrlId}/sources/research-more`,
    {
      method: 'POST',
      token,
      body: JSON.stringify({
        scraped_id: payload.scrapedId,
        ai_query: payload.aiQuery,
      }),
    }
  )
}

export type ResearchGridSummaryRow = {
  table_row_index: number
  results_count: number
  structured_sources_count: number
  has_structured_data: boolean
}

export async function listResearchGridSummary(
  token: string,
  options: { fileId?: number | null; tabId?: string | null }
): Promise<ResearchGridSummaryRow[]> {
  const params = new URLSearchParams()
  if (options.tabId != null) params.set('tab_id', options.tabId)
  if (options.fileId != null) params.set('file_id', String(options.fileId))
  const search = params.toString() ? `?${params}` : ''
  return request<ResearchGridSummaryRow[]>(`/datasheet/research-urls/grid-summary${search}`, {
    token,
  })
}

export type PortfolioItem = {
  part_number: string | null
  vendor_name: string | null
  price: string | null
  quantity: number | null
  url: string | null
  image_url?: string | null
  row_index?: number | null
}

export type ListPortfolioItemsOptions = {
  /** Omit to return merged offers across all saved datasheet selections (same dedupe as portfolio summary). */
  selectionId?: number
  rowIndex?: number
}

export async function listPortfolioItems(
  token: string,
  options?: ListPortfolioItemsOptions
): Promise<PortfolioItem[]> {
  const params = new URLSearchParams()
  if (options?.selectionId != null) {
    params.set('selection_id', String(options.selectionId))
  }
  if (options?.rowIndex != null) {
    params.set('row_index', String(options.rowIndex))
  }
  const q = params.toString() ? `?${params}` : ''
  return request<PortfolioItem[]>(`/portfolio/items${q}`, { token })
}

export type PortfolioSummary = {
  unique_parts: number
  offer_count: number
  best_price: number | null
  average_price: number | null
  prices_included: number
}

export async function getPortfolioSummary(token: string): Promise<PortfolioSummary> {
  return request<PortfolioSummary>('/portfolio/summary', { token })
}

export type PortfolioExcludePayload = {
  part_number: string
  exclude_entire_part?: boolean
  vendor_name?: string | null
  url?: string | null
  price?: string | null
  quantity?: number | null
}

export async function excludePortfolioItem(
  token: string,
  payload: PortfolioExcludePayload,
): Promise<{ status: string }> {
  return request<{ status: string }>('/portfolio/items/exclude', {
    method: 'POST',
    token,
    body: JSON.stringify(payload),
  })
}

export async function restorePortfolioItem(
  token: string,
  payload: PortfolioExcludePayload,
): Promise<{ status: string }> {
  return request<{ status: string }>('/portfolio/items/restore', {
    method: 'POST',
    token,
    body: JSON.stringify(payload),
  })
}

export type CompareStatePayload = {
  compare_tabs: Array<Record<string, unknown>>
  active_compare_tab_id: string | null
  compare_mode: 'same-part' | 'different-same-vendor' | 'different-different-vendors'
  scraped_vendor_filter: string
  scraped_view_mode: 'row' | 'column'
  scraped_selected_fields: string[]
  scraped_value_search: string
  scraped_non_empty_only: boolean
  scraped_data_by_part: Record<string, Array<{ url: string; data: Record<string, unknown> }>>
  scraped_data: Array<{ url: string; data: Record<string, unknown> }>
}

export type CompareStateResponse = CompareStatePayload & {
  owner_id: number
  created_at: string
  updated_at: string
}

export async function getCompareState(token: string): Promise<CompareStateResponse | null> {
  return request<CompareStateResponse | null>('/compare/state', { token })
}

export async function upsertCompareState(
  payload: CompareStatePayload,
  token: string
): Promise<CompareStateResponse> {
  return request<CompareStateResponse>('/compare/state', {
    method: 'PUT',
    token,
    body: JSON.stringify(payload),
  })
}

export type ResearchOpenTabPayload = {
  file_id: number
  name: string
  folder_path?: string | null
}

export type ResearchStatePayload = {
  open_tabs: ResearchOpenTabPayload[]
  active_file_id: number | null
  page_state: Record<string, unknown>
}

export type ResearchStateResponse = ResearchStatePayload & {
  owner_id: number
  created_at: string
  updated_at: string
}

export async function getResearchState(token: string): Promise<ResearchStateResponse | null> {
  return request<ResearchStateResponse | null>('/research/state', { token })
}

export async function upsertResearchState(
  payload: ResearchStatePayload,
  token: string
): Promise<ResearchStateResponse> {
  return request<ResearchStateResponse>('/research/state', {
    method: 'PUT',
    token,
    body: JSON.stringify(payload),
  })
}

export type ResearchJobStatus = 'running' | 'done' | 'failed'

export type ResearchJob = {
  id: number
  status: ResearchJobStatus
  selection_id?: number | null
  file_id?: number | null
  tab_id?: string | null
  table_row_indices: number[]
  completed_rows: number
  total_rows: number
  total_urls: number
  error?: string | null
  started_at: string
  updated_at: string
}

export async function listActiveResearchJobs(
  token: string,
  options?: { fileId?: number | null; tabId?: string | null }
): Promise<ResearchJob[]> {
  const params = new URLSearchParams()
  if (options?.fileId != null) params.set('file_id', String(options.fileId))
  if (options?.tabId != null) params.set('tab_id', options.tabId)
  const search = params.toString() ? `?${params}` : ''
  return request<ResearchJob[]>(`/research/jobs/active${search}`, { token })
}

export async function deleteWorkspaceItem(itemId: number, token: string): Promise<void> {
  const headers: HeadersInit = { ...bearerAuthHeader() }
  void token
  const res = await fetch(`${API_BASE}/workspace/items/${itemId}`, { method: 'DELETE', headers })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    const msg = Array.isArray(err.detail) ? err.detail[0]?.msg ?? 'Request failed' : (err.detail ?? 'Request failed')
    throw new Error(typeof msg === 'string' ? msg : 'Request failed')
  }
}

export type AiChatMode = 'chat' | 'summarize' | 'rewrite' | 'brainstorm' | 'report'

export type AiChatHistoryMessage = { role: 'user' | 'assistant'; content: string }

export type AiChatRequestBody = {
  mode: AiChatMode
  message: string
  history?: AiChatHistoryMessage[]
  /** Chat mode only — continue a thread stored in MongoDB */
  session_id?: string | null
  /** Chat mode — JSON or text grounding (sheet row + scraped structured data) */
  context?: string | null
  /** Stored on each turn; shown in /ai history */
  session_label?: string | null
  /** e.g. research_inspector */
  source?: string | null
}

export type AiChatResponseBody = {
  content: string
  model: string
  session_id: string
}

export async function aiGroqChat(token: string, body: AiChatRequestBody): Promise<AiChatResponseBody> {
  const payload: Record<string, unknown> = {
    mode: body.mode,
    message: body.message,
    history: body.history ?? [],
  }
  if (body.session_id != null && body.session_id !== '') payload.session_id = body.session_id
  if (body.context != null && body.context !== '') payload.context = body.context
  if (body.session_label != null && body.session_label !== '') payload.session_label = body.session_label
  if (body.source != null && body.source !== '') payload.source = body.source
  return request<AiChatResponseBody>('/ai/chat', {
    method: 'POST',
    token,
    body: JSON.stringify(payload),
  })
}

export type AiSessionSummary = {
  session_id: string
  mode: string
  preview: string
  last_at: string
  turn_count: number
  session_label?: string | null
  source?: string | null
}

export async function listAiSessions(
  token: string,
  options?: { mode?: string; limit?: number }
): Promise<AiSessionSummary[]> {
  const params = new URLSearchParams()
  if (options?.mode) params.set('mode', options.mode)
  if (options?.limit != null) params.set('limit', String(options.limit))
  const q = params.toString() ? `?${params}` : ''
  return request<AiSessionSummary[]>(`/ai/sessions${q}`, { token })
}

export type AiSessionMessagesResponse = {
  session_id: string
  mode: string
  messages: AiChatHistoryMessage[]
}

export async function getAiSessionMessages(
  token: string,
  sessionId: string
): Promise<AiSessionMessagesResponse> {
  const enc = encodeURIComponent(sessionId)
  return request<AiSessionMessagesResponse>(`/ai/sessions/${enc}/messages`, { token })
}


// ---------------------------------------------------------------------------
// Purchase orders
// ---------------------------------------------------------------------------

export type PurchaseOrderStatus =
  | 'draft'
  | 'submitted'
  | 'approved'
  | 'sent'
  | 'partial'
  | 'closed'

export type PurchaseOrderLinePayload = {
  id: string
  sku: string
  description: string
  qty: number
  uom: string
  unit_price: number
  /** Product or vendor page URL (e.g. from scraped research) */
  vendor_url?: string
}

export type PurchaseOrderCreatePayload = {
  number: string
  vendor_name: string
  vendor_email: string
  issue_date: string
  required_by: string
  status: PurchaseOrderStatus
  ship_to: string
  payment_terms: string
  notes: string
  lines: PurchaseOrderLinePayload[]
  /** Saved datasheet selection used to populate lines from scraped data */
  source_selection_id?: number | null
}

export type PurchaseOrderUpdatePayload = Partial<Omit<PurchaseOrderCreatePayload, 'lines'>> & {
  lines?: PurchaseOrderLinePayload[]
}

export type PurchaseOrderResponse = {
  id: number
  owner_id: number
  number: string
  vendor_name: string
  vendor_email: string
  issue_date: string
  required_by: string
  status: PurchaseOrderStatus
  ship_to: string
  payment_terms: string
  notes: string
  lines: PurchaseOrderLinePayload[]
  source_selection_id: number | null
  created_at: string
  updated_at: string
}

export async function listPurchaseOrders(token: string): Promise<PurchaseOrderResponse[]> {
  return request<PurchaseOrderResponse[]>('/purchase-orders', { token })
}

export async function createPurchaseOrder(
  token: string,
  payload: PurchaseOrderCreatePayload
): Promise<PurchaseOrderResponse> {
  return request<PurchaseOrderResponse>('/purchase-orders', {
    method: 'POST',
    token,
    body: JSON.stringify(payload),
  })
}

export async function updatePurchaseOrder(
  token: string,
  id: number,
  payload: PurchaseOrderUpdatePayload
): Promise<PurchaseOrderResponse> {
  return request<PurchaseOrderResponse>(`/purchase-orders/${id}`, {
    method: 'PUT',
    token,
    body: JSON.stringify(payload),
  })
}

export async function deletePurchaseOrder(token: string, id: number): Promise<void> {
  const headers: HeadersInit = { ...bearerAuthHeader() }
  void token
  const res = await fetch(`${API_BASE}/purchase-orders/${id}`, { method: 'DELETE', headers })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    const msg = Array.isArray(err.detail) ? err.detail[0]?.msg ?? 'Request failed' : (err.detail ?? 'Request failed')
    throw new Error(typeof msg === 'string' ? msg : 'Request failed')
  }
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export type ReportPayload = {
  title: string
  blocks: Array<Record<string, unknown>>
}

export type ReportUpdatePayload = {
  title?: string
  blocks?: Array<Record<string, unknown>>
}

export type ReportResponse = {
  id: number
  owner_id: number
  title: string
  blocks: Array<Record<string, unknown>>
  created_at: string
  updated_at: string
  workspace_parent_id?: number | null
  source_workspace_file_id?: number | null
  source_workspace_pdf_id?: number | null
}

export async function createReport(token: string, payload: ReportPayload): Promise<ReportResponse> {
  return request<ReportResponse>('/reports', {
    method: 'POST',
    token,
    body: JSON.stringify(payload),
  })
}

export async function listReports(token: string): Promise<ReportResponse[]> {
  return request<ReportResponse[]>('/reports', { token })
}

export async function getReport(token: string, id: number): Promise<ReportResponse> {
  return request<ReportResponse>(`/reports/${id}`, { token })
}

/** Open an uploaded workspace Word file as an editable report. */
export async function importReportFromDocx(token: string, workspaceItemId: number): Promise<ReportResponse> {
  return request<ReportResponse>(`/reports/import-from-docx/${workspaceItemId}`, {
    method: 'POST',
    token,
  })
}

export async function updateReport(
  token: string,
  id: number,
  payload: ReportUpdatePayload,
): Promise<ReportResponse> {
  return request<ReportResponse>(`/reports/${id}`, {
    method: 'PUT',
    token,
    body: JSON.stringify(payload),
  })
}

export async function deleteReport(token: string, id: number): Promise<void> {
  const headers: HeadersInit = { ...bearerAuthHeader() }
  void token
  const res = await fetch(`${API_BASE}/reports/${id}`, { method: 'DELETE', headers })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    const msg = Array.isArray(err.detail) ? err.detail[0]?.msg ?? 'Request failed' : (err.detail ?? 'Request failed')
    throw new Error(typeof msg === 'string' ? msg : 'Request failed')
  }
}

async function fetchBlob(path: string, token: string): Promise<Blob> {
  void token
  const res = await fetch(`${API_BASE}${path}`, {
    headers: bearerAuthHeader(),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    const msg = typeof err.detail === 'string' ? err.detail : 'Export failed'
    throw new Error(msg)
  }
  return res.blob()
}

export async function exportReportDocx(token: string, id: number): Promise<Blob> {
  return fetchBlob(`/reports/${id}/export/docx`, token)
}

export async function exportReportPdf(token: string, id: number): Promise<Blob> {
  return fetchBlob(`/reports/${id}/export/pdf`, token)
}
