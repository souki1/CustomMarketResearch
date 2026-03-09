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

export async function deleteWorkspaceItem(itemId: number, token: string): Promise<void> {
  const headers: HeadersInit = { Authorization: `Bearer ${token}` }
  const res = await fetch(`${API_BASE}/workspace/items/${itemId}`, { method: 'DELETE', headers })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    const msg = Array.isArray(err.detail) ? err.detail[0]?.msg ?? 'Request failed' : (err.detail ?? 'Request failed')
    throw new Error(typeof msg === 'string' ? msg : 'Request failed')
  }
}
