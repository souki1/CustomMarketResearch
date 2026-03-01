const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export type SignUpPayload = { email: string; password: string; display_name?: string }
export type SignInPayload = { email: string; password: string }
export type AuthResponse = { access_token: string; token_type: string; display_name: string }

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

export async function getMe(token: string): Promise< { id: number; email: string; display_name: string }> {
  return request('/auth/me', { token })
}

export function getGoogleLoginUrl(): string {
  return `${API_BASE}/auth/google`
}
