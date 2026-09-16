/** Client-side password rules; the API is the source of truth. */

export const MIN_PASSWORD_LENGTH = 10

export function validatePassword(password: string, email?: string | null): string | null {
  if (!password) return 'Password is required'
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`
  }
  if (password.length > 72) return 'Password must be at most 72 characters'
  if (password !== password.trim()) return 'Password cannot start or end with whitespace'
  if (/\s/.test(password)) return 'Password cannot contain spaces'
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return 'Password must include at least one letter and one number'
  }
  const local = email?.split('@')[0]?.trim().toLowerCase()
  if (local && local.length >= 3 && password.toLowerCase().includes(local)) {
    return 'Password cannot contain your email address'
  }
  return null
}
