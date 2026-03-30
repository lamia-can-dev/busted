import { describe, it, expect, beforeEach } from 'vitest'
import { saveSession, getSession, clearSession, saveUserId, getUserId } from './session'

beforeEach(() => {
  localStorage.clear()
})

describe('saveUserId / getUserId', () => {
  it('persists and retrieves userId', () => {
    saveUserId('user-1')
    expect(getUserId()).toBe('user-1')
  })

  it('returns null when no userId saved', () => {
    expect(getUserId()).toBeNull()
  })
})

describe('saveSession', () => {
  it('persists userId and groupId', () => {
    saveSession('user-1', 'group-1')
    expect(localStorage.getItem('busted_user_id')).toBe('user-1')
    expect(localStorage.getItem('busted_group_id')).toBe('group-1')
  })

  it('overwrites a previous session', () => {
    saveSession('user-1', 'group-1')
    saveSession('user-2', 'group-2')
    expect(localStorage.getItem('busted_user_id')).toBe('user-2')
    expect(localStorage.getItem('busted_group_id')).toBe('group-2')
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
    expect(getSession()).toEqual({ userId: 'user-1', groupId: 'group-1' })
  })
})

describe('clearSession', () => {
  it('removes all session keys', () => {
    saveSession('user-1', 'group-1')
    clearSession()
    expect(localStorage.getItem('busted_user_id')).toBeNull()
    expect(localStorage.getItem('busted_group_id')).toBeNull()
  })

  it('returns null from getSession after clearing', () => {
    saveSession('user-1', 'group-1')
    clearSession()
    expect(getSession()).toBeNull()
  })

  it('is safe to call when no session exists', () => {
    expect(() => clearSession()).not.toThrow()
  })
})
