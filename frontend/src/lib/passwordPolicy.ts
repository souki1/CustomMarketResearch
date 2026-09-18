export const PASSWORD_POLICY_HINT = 'At least 8 characters, with a letter and a number.'

export function passwordPolicyError(password: string): string | null {
  const value = password.trim()
  if (value.length < 8) return 'Password must be at least 8 characters'
  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) {
    return 'Password must include a letter and a number'
  }
  return null
}
