import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { makeQueryBuilder, makeChannelMock } from '../test/supabaseMock'
import { supabase } from '../lib/supabase'

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    channel: vi.fn(),
  },
}))

vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}))

import { useAuth } from '../contexts/AuthContext'
import NavBar from './NavBar'

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  vi.mocked(useAuth).mockReturnValue({ userId: 'user-1', groupId: 'group-1', loading: false, signOut: vi.fn(), refreshGroupId: vi.fn(), loginAs: vi.fn() })
  vi.mocked(supabase.from).mockReturnValue(
    makeQueryBuilder({ data: [], error: null }) as ReturnType<typeof supabase.from>
  )
  vi.mocked(supabase.channel).mockReturnValue(makeChannelMock() as unknown as ReturnType<typeof supabase.channel>)
})

function renderNav(path = '/game') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <NavBar />
    </MemoryRouter>
  )
}

describe('NavBar', () => {
  it('renders all 5 tabs', () => {
    renderNav()
    expect(screen.getByText('Grille')).toBeInTheDocument()
    expect(screen.getByText('Activité')).toBeInTheDocument()
    expect(screen.getByText('Actions')).toBeInTheDocument()
    expect(screen.getByText('Classement')).toBeInTheDocument()
    expect(screen.getByText('Profil')).toBeInTheDocument()
  })

  it('renders without crashing when no session', () => {
    vi.mocked(useAuth).mockReturnValue({ userId: null, groupId: null, loading: false, signOut: vi.fn(), refreshGroupId: vi.fn(), loginAs: vi.fn() })
    renderNav()
  })

  it('does not show badge when no pending submissions', async () => {
    renderNav()
    await waitFor(() => {
      expect(screen.queryByText(/^\d+$/)).toBeNull()
    })
  })

  it('shows badge when user has unseen submissions', async () => {
    vi.mocked(supabase.from).mockReturnValue(
      makeQueryBuilder({
        data: [
          { id: 'cell-1', status: 'unchecked', submissions: [{ id: 'sub-1' }, { id: 'sub-2' }] },
        ],
        error: null,
      }) as ReturnType<typeof supabase.from>
    )
    renderNav()
    await waitFor(() => {
      expect(screen.getByText('2')).toBeInTheDocument()
    })
  })

  it('does not count already-seen submissions', async () => {
    localStorage.setItem('busted_seen_notif_ids', JSON.stringify(['vote_required_sub-1']))
    vi.mocked(supabase.from).mockReturnValue(
      makeQueryBuilder({
        data: [
          { id: 'cell-1', status: 'unchecked', submissions: [{ id: 'sub-1' }, { id: 'sub-2' }] },
        ],
        error: null,
      }) as ReturnType<typeof supabase.from>
    )
    renderNav()
    await waitFor(() => {
      expect(screen.getByText('1')).toBeInTheDocument()
    })
  })
})
