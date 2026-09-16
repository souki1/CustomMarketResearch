export const MIN_PASSWORD_LENGTH = 8
export const MAX_PASSWORD_LENGTH = 72

export function passwordPolicyError(password: string, email?: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return 'Password is too long'
  }
  if (password.trim() !== password) {
    return 'Password cannot start or end with spaces'
  }
  const hasLetter = /[A-Za-z]/.test(password)
  const hasDigit = /\d/.test(password)
  if (!hasLetter || !hasDigit) {
    return 'Password must include a letter and a number'
  }
  const local = email?.split('@')[0]?.trim().toLowerCase()
  if (local && local.length >= 3 && password.toLowerCase().includes(local)) {
    return 'Password cannot contain your email address'
  }
  return null
}

export function passwordStrengthLabel(password: string): 'Weak' | 'Fair' | 'Strong' {
  let score = 0
  if (password.length >= 8) score += 1
  if (password.length >= 12) score += 1
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1
  if (/\d/.test(password)) score += 1
  if (/[^A-Za-z0-9]/.test(password)) score += 1
  if (score <= 2) return 'Weak'
  if (score <= 3) return 'Fair'
  return 'Strong'
}
