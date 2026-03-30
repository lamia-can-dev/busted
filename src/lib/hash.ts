const SALT = 'busted_v1_'

export async function hashPassword(password: string): Promise<string> {
  const data = new TextEncoder().encode(SALT + password)
  const buf = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}
