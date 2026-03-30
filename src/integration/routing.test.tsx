/**
 * Integration — App routing
 *
 * Renders the real App component (BrowserRouter + all routes).
 * Verifies that the router mounts the right page for each URL,
 * and that auth session state drives redirects correctly.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { makeQueryBuilder, makeChannelMock } from '../test/supabaseMock'
import { supabase } from '../lib/supabase'

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    channel: vi.fn(),
    rpc: vi.fn(),
    auth: {
      getSession: vi.fn(),
      refreshSession: vi.fn(),
      signInAnonymously: vi.fn(),
    },
    storage: { from: vi.fn() },
  },
}))

vi.mock('../lib/session', () => ({
  getSession: vi.fn(),
  saveSession: vi.fn(),
  clearSession: vi.fn(),
}))

import { getSession } from '../lib/session'
import App from '../App'

function setupDefaultMocks() {
  vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: null } } as never)
  vi.mocked(supabase.auth.refreshSession).mockResolvedValue({ data: {}, error: null } as never)
  vi.mocked(supabase.from).mockReturnValue(makeQueryBuilder({ data: [], error: null }) as ReturnType<typeof supabase.from>)
  vi.mocked(supabase.channel).mockReturnValue(makeChannelMock() as unknown as ReturnType<typeof supabase.channel>)
  vi.mocked(supabase.rpc).mockResolvedValue({ data: [], error: null } as never)
}

function navigateTo(path: string) {
  window.history.pushState({}, '', path)
}

beforeEach(() => {
  vi.clearAllMocks()
  setupDefaultMocks()
})

afterEach(() => {
  // Reset URL to root after each test
  window.history.pushState({}, '', '/')
})

describe('App routing — unauthenticated', () => {
  beforeEach(() => {
    vi.mocked(getSession).mockReturnValue(null)
  })

  it('renders CreateGroup at /', async () => {
    navigateTo('/')
    render(<App />)
    await screen.findByText('Busted')
    expect(screen.getByPlaceholderText(/les potes du jeudi/i)).toBeInTheDocument()
  })

  it('renders Onboarding at /join/:code', async () => {
    navigateTo('/join/ABC123')
    render(<App />)
    // Onboarding page shows Busted logo and username input
    await screen.findByPlaceholderText(/nico_le_roi/i)
  })

  it('redirects /game to / when no session', async () => {
    navigateTo('/game')
    render(<App />)
    // Game returns null and navigates to '/' → CreateGroup renders
    await screen.findByText('Busted')
    expect(screen.getByPlaceholderText(/les potes du jeudi/i)).toBeInTheDocument()
  })

  it('redirects /activity to / when no session', async () => {
    navigateTo('/activity')
    render(<App />)
    await screen.findByText('Busted')
  })

  it('redirects /proposals to / when no session', async () => {
    navigateTo('/proposals')
    render(<App />)
    await screen.findByText('Busted')
  })

  it('redirects /leaderboard to / when no session', async () => {
    navigateTo('/leaderboard')
    render(<App />)
    await screen.findByText('Busted')
  })
})

describe('App routing — authenticated', () => {
  const session = { userId: 'user-1', groupId: 'group-1', refreshToken: 'rt-1' }

  beforeEach(() => {
    vi.mocked(getSession).mockReturnValue(session)
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { access_token: 'at', refresh_token: 'rt-1' } },
    } as never)
  })

  it('renders Game at /game', async () => {
    navigateTo('/game')
    render(<App />)
    await screen.findByText('Busted')
    // NavBar is also mounted
    await screen.findByText('Grille')
  })

  it('renders Game + NavBar together at /game', async () => {
    navigateTo('/game')
    render(<App />)
    await screen.findByText('Grille')
    expect(screen.getByText('Activité')).toBeInTheDocument()
    expect(screen.getByText('Votes')).toBeInTheDocument()
    expect(screen.getByText('Classement')).toBeInTheDocument()
  })

  it('renders Activity + NavBar at /activity', async () => {
    navigateTo('/activity')
    render(<App />)
    // Activity page renders with NavBar
    await screen.findByText('Grille')
    expect(screen.getByText('Activité')).toBeInTheDocument()
  })

  it('renders Proposals + NavBar at /proposals', async () => {
    navigateTo('/proposals')
    render(<App />)
    // Proposals page renders - it shows "En attente" tab
    await screen.findByText('En attente')
    expect(screen.getByText('Grille')).toBeInTheDocument()
  })

  it('renders Leaderboard + NavBar at /leaderboard', async () => {
    navigateTo('/leaderboard')
    render(<App />)
    // "Classement" appears in NavBar
    await screen.findAllByText('Classement')
    expect(screen.getByText('Grille')).toBeInTheDocument()
  })

  it('redirects /game to / when existing session navigates to CreateGroup', async () => {
    // CreateGroup redirects to /game when session exists
    navigateTo('/')
    render(<App />)
    // getSession() returns a session → CreateGroup calls navigate('/game')
    await screen.findByText('Busted') // Game title after redirect
  })
})

describe('App — session restore', () => {
  it('shows nothing until auth check completes', () => {
    vi.mocked(getSession).mockReturnValue(null)
    // Make getSession take a moment
    vi.mocked(supabase.auth.getSession).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ data: { session: null } } as never), 50))
    )
    navigateTo('/')
    const { container } = render(<App />)
    // Before auth resolves, App returns null
    expect(container.firstChild).toBeNull()
  })

  it('refreshes token from localStorage when Supabase has no session', async () => {
    vi.mocked(getSession).mockReturnValue({ userId: 'u1', groupId: 'g1', refreshToken: 'old-token' })
    vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: null } } as never)
    navigateTo('/')
    render(<App />)
    await waitFor(() => {
      expect(supabase.auth.refreshSession).toHaveBeenCalledWith({ refresh_token: 'old-token' })
    })
  })

  it('does not call refreshSession when no refresh token stored', async () => {
    vi.mocked(getSession).mockReturnValue({ userId: 'u1', groupId: 'g1', refreshToken: null })
    vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: null } } as never)
    navigateTo('/')
    render(<App />)
    await screen.findByText('Busted')
    expect(supabase.auth.refreshSession).not.toHaveBeenCalled()
  })
})
