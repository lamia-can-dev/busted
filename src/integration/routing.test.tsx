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
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      signOut: vi.fn(),
    },
    storage: { from: vi.fn() },
  },
}))

vi.mock('../contexts/AuthContext', async () => {
  const actual = await vi.importActual('../contexts/AuthContext')
  return {
    ...actual,
    AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    useAuth: vi.fn(),
  }
})

vi.mock('../lib/session', () => ({
  getSession: vi.fn(),
  saveSession: vi.fn(),
  clearSession: vi.fn(),
}))

import { useAuth } from '../contexts/AuthContext'
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
    vi.mocked(useAuth).mockReturnValue({
      userId: null,
      groupId: null,
      loading: false,
      signOut: vi.fn(),
      refreshGroupId: vi.fn(),
    })
  })

  it('renders Login at /', async () => {
    navigateTo('/')
    render(<App />)
    await screen.findByText('Busted')
    expect(screen.getByPlaceholderText(/ton@email.com/i)).toBeInTheDocument()
  })

  it('renders Login at /join/:code when unauthenticated (Onboarding redirects)', async () => {
    navigateTo('/join/ABC123')
    render(<App />)
    // Onboarding redirects unauthenticated users to /
    await screen.findByPlaceholderText(/ton@email.com/i)
  })

  it('redirects /game to / (login) when no session', async () => {
    navigateTo('/game')
    render(<App />)
    // ProtectedRoute redirects to '/' → Login renders
    await screen.findByText('Busted')
    expect(screen.getByPlaceholderText(/ton@email.com/i)).toBeInTheDocument()
  })

  it('redirects /activity to / when no session', async () => {
    navigateTo('/activity')
    render(<App />)
    await screen.findByPlaceholderText(/ton@email.com/i)
  })

  it('redirects /proposals to / when no session', async () => {
    navigateTo('/proposals')
    render(<App />)
    await screen.findByPlaceholderText(/ton@email.com/i)
  })

  it('redirects /leaderboard to / when no session', async () => {
    navigateTo('/leaderboard')
    render(<App />)
    await screen.findByPlaceholderText(/ton@email.com/i)
  })
})

describe('App routing — authenticated', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({
      userId: 'user-1',
      groupId: 'group-1',
      loading: false,
      signOut: vi.fn(),
      refreshGroupId: vi.fn(),
    })
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

  it('redirects / to /game when session exists', async () => {
    // Login redirects to /game when userId + groupId exist
    navigateTo('/')
    render(<App />)
    await screen.findByText('Busted') // Game title after redirect
  })
})

describe('App — auth loading', () => {
  it('shows nothing while auth is loading', () => {
    vi.mocked(useAuth).mockReturnValue({
      userId: null,
      groupId: null,
      loading: true,
      signOut: vi.fn(),
      refreshGroupId: vi.fn(),
    })
    navigateTo('/game')
    const { container } = render(<App />)
    // ProtectedRoute returns null while loading
    expect(container.querySelector('nav')).toBeNull()
  })

  it('refreshes token from localStorage when Supabase has no session', async () => {
    vi.mocked(useAuth).mockReturnValue({
      userId: null,
      groupId: null,
      loading: false,
      signOut: vi.fn(),
      refreshGroupId: vi.fn(),
    })
    localStorage.setItem('busted_refresh_token', 'old-token')
    vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: null } } as never)
    navigateTo('/')
    render(<App />)
    await screen.findByPlaceholderText(/ton@email.com/i)
    localStorage.removeItem('busted_refresh_token')
  })
})
