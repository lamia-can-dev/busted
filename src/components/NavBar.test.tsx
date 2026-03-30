import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { makeQueryBuilder } from '../test/supabaseMock'
import { supabase } from '../lib/supabase'

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}))

import { useAuth } from '../contexts/AuthContext'
import NavBar from './NavBar'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useAuth).mockReturnValue({ userId: 'user-1', groupId: 'group-1', loading: false, signOut: vi.fn(), refreshGroupId: vi.fn() })
  vi.mocked(supabase.from).mockReturnValue(
    makeQueryBuilder({ data: [], error: null }) as ReturnType<typeof supabase.from>
  )
})

function renderNav(path = '/game') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <NavBar />
    </MemoryRouter>
  )
}

describe('NavBar', () => {
  it('renders all 4 tabs', () => {
    renderNav()
    expect(screen.getByText('Grille')).toBeInTheDocument()
    expect(screen.getByText('Activité')).toBeInTheDocument()
    expect(screen.getByText('Votes')).toBeInTheDocument()
    expect(screen.getByText('Classement')).toBeInTheDocument()
  })

  it('renders without crashing when no session', () => {
    vi.mocked(useAuth).mockReturnValue({ userId: null, groupId: null, loading: false, signOut: vi.fn(), refreshGroupId: vi.fn() })
    renderNav()
  })

  it('does not show badge when no pending validations', async () => {
    vi.mocked(supabase.from).mockReturnValue(
      makeQueryBuilder({ data: [], error: null }) as ReturnType<typeof supabase.from>
    )
    renderNav('/feed')
    await waitFor(() => {
      expect(screen.queryByText(/^\d+$/)).toBeNull()
    })
  })

  it('shows badge when user has unseen count in localStorage', async () => {
    localStorage.setItem('busted_unread_count', '3')
    renderNav('/game')
    await waitFor(() => {
      expect(screen.getByText('3')).toBeInTheDocument()
    })
    localStorage.removeItem('busted_unread_count')
  })
})
