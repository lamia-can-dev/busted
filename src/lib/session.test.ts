import { describe, it, expect, beforeEach } from 'vitest'
import { saveSession, getSession, clearSession } from './session'

beforeEach(() => {
  localStorage.clear()
})

describe('saveSession', () => {
  it('persists userId and groupId', () => {
    saveSession('user-1', 'group-1')
    expect(localStorage.getItem('busted_user_id')).toBe('user-1')
    expect(localStorage.getItem('busted_group_id')).toBe('group-1')
  })

  it('persists refreshToken when provided', () => {
    saveSession('user-1', 'group-1', 'token-abc')
    expect(localStorage.getItem('busted_refresh_token')).toBe('token-abc')
  })

  it('does not write refreshToken when omitted', () => {
    saveSession('user-1', 'group-1')
    expect(localStorage.getItem('busted_refresh_token')).toBeNull()
  })

  it('overwrites a previous session', () => {
    saveSession('user-1', 'group-1', 'old-token')
    saveSession('user-2', 'group-2', 'new-token')
    expect(localStorage.getItem('busted_user_id')).toBe('user-2')
    expect(localStorage.getItem('busted_group_id')).toBe('group-2')
    expect(localStorage.getItem('busted_refresh_token')).toBe('new-token')
  })
})

describe('getSession', () => {
  it('returns null when localStorage is empty', () => {
    expect(getSession()).toBeNull()
  })

  it('returns null when only userId is present', () => {
    localStorage.setItem('busted_user_id', 'user-1')
    expect(getSession()).toBeNull()
  })

  it('returns null when only groupId is present', () => {
    localStorage.setItem('busted_group_id', 'group-1')
    expect(getSession()).toBeNull()
  })

  it('returns session object when both userId and groupId are present', () => {
    saveSession('user-1', 'group-1')
    expect(getSession()).toEqual({ userId: 'user-1', groupId: 'group-1', refreshToken: null })
  })

  it('includes refreshToken in returned object', () => {
    saveSession('user-1', 'group-1', 'my-token')
    expect(getSession()).toEqual({ userId: 'user-1', groupId: 'group-1', refreshToken: 'my-token' })
  })

  it('returns refreshToken: null when token was not saved', () => {
    saveSession('user-1', 'group-1')
    const session = getSession()
    expect(session?.refreshToken).toBeNull()
  })
})

describe('clearSession', () => {
  it('removes all session keys', () => {
    saveSession('user-1', 'group-1', 'token-abc')
    clearSession()
    expect(localStorage.getItem('busted_user_id')).toBeNull()
    expect(localStorage.getItem('busted_group_id')).toBeNull()
    expect(localStorage.getItem('busted_refresh_token')).toBeNull()
  })

  it('returns null from getSession after clearing', () => {
    saveSession('user-1', 'group-1', 'token-abc')
    clearSession()
    expect(getSession()).toBeNull()
  })

  it('is safe to call when no session exists', () => {
    expect(() => clearSession()).not.toThrow()
  })
})
