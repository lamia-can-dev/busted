import { describe, it, expect } from 'vitest'
import { hashPassword } from './hash'

describe('hashPassword', () => {
  it('returns a 64-char hex string (SHA-256)', async () => {
    const hash = await hashPassword('test')
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('returns consistent output for the same input', async () => {
    const a = await hashPassword('mypassword')
    const b = await hashPassword('mypassword')
    expect(a).toBe(b)
  })

  it('returns different output for different inputs', async () => {
    const a = await hashPassword('password1')
    const b = await hashPassword('password2')
    expect(a).not.toBe(b)
  })
})
