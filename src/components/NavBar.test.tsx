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

vi.mock('../lib/session', () => ({
  getSession: vi.fn(),
}))

import { getSession } from '../lib/session'
import NavBar from './NavBar'

const mockSession = { userId: 'user-1', groupId: 'group-1', refreshToken: null }

beforeEach(() => {
  vi.clearAllMocks()
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
    vi.mocked(getSession).mockReturnValue(mockSession)
    renderNav()
    expect(screen.getByText('Grille')).toBeInTheDocument()
    expect(screen.getByText('Feed')).toBeInTheDocument()
    expect(screen.getByText('Votes')).toBeInTheDocument()
    expect(screen.getByText('Classement')).toBeInTheDocument()
  })

  it('renders without crashing when no session', () => {
    vi.mocked(getSession).mockReturnValue(null)
    renderNav()
  })

  it('does not show badge when no pending validations', async () => {
    vi.mocked(getSession).mockReturnValue(mockSession)
    vi.mocked(supabase.from).mockReturnValue(
      makeQueryBuilder({ data: [], error: null }) as ReturnType<typeof supabase.from>
    )
    renderNav('/feed')
    await waitFor(() => {
      expect(screen.queryByText(/^\d+$/)).toBeNull()
    })
  })

  it('shows badge when user has pending validations targeting them', async () => {
    vi.mocked(getSession).mockReturnValue(mockSession)
    // Return a submission targeting user-1 with no vote from user-1
    vi.mocked(supabase.from).mockReturnValue(
      makeQueryBuilder({
        data: [
          {
            id: 'sub-1',
            cell: { target_user_id: 'user-1' },
            votes: [],
          },
        ],
        error: null,
      }) as ReturnType<typeof supabase.from>
    )
    renderNav('/game')
    await waitFor(() => {
      expect(screen.getByText('1')).toBeInTheDocument()
    })
  })
})
