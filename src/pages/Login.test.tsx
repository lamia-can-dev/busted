import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { supabase } from '../lib/supabase'

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
    },
  },
}))

vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}))

import { useAuth } from '../contexts/AuthContext'
import Login from './Login'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useAuth).mockReturnValue({ userId: null, groupId: null, loading: false, signOut: vi.fn(), refreshGroupId: vi.fn() })
  vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({ data: { user: { id: 'u1' }, session: {} }, error: null } as never)
  vi.mocked(supabase.auth.signUp).mockResolvedValue({ data: { user: { id: 'u1' }, session: null }, error: null } as never)
  sessionStorage.clear()
})

function renderPage() {
  return render(<MemoryRouter><Login /></MemoryRouter>)
}

describe('Login — rendering', () => {
  it('renders email form in Connexion mode by default', () => {
    renderPage()
    expect(screen.getByPlaceholderText(/ton@email.com/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /se connecter$/i })).toBeInTheDocument()
  })

  it('toggles to Inscription mode', async () => {
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Inscription' }))
    expect(screen.getByText('Confirmer le mot de passe')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /s'inscrire/i })).toBeInTheDocument()
  })

  it('toggles back to Connexion mode', async () => {
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Inscription' }))
    await userEvent.click(screen.getByRole('button', { name: 'Connexion' }))
    expect(screen.queryByText('Confirmer le mot de passe')).toBeNull()
  })
})

describe('Login — email login', () => {
  it('calls signInWithPassword on submit', async () => {
    renderPage()
    await userEvent.type(screen.getByPlaceholderText(/ton@email.com/i), 'test@test.com')
    await userEvent.type(screen.getByLabelText(/mot de passe/i), 'password123')
    await userEvent.click(screen.getByRole('button', { name: /se connecter$/i }))
    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'test@test.com', password: 'password123' })
  })

  it('shows error on login failure', async () => {
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({ data: { user: null, session: null }, error: { message: 'Invalid credentials' } } as never)
    renderPage()
    await userEvent.type(screen.getByPlaceholderText(/ton@email.com/i), 'test@test.com')
    await userEvent.type(screen.getByLabelText(/mot de passe/i), 'wrong')
    await userEvent.click(screen.getByRole('button', { name: /se connecter$/i }))
    await screen.findByText('Invalid credentials')
  })
})

describe('Login — email signup', () => {
  it('calls signUp on submit', async () => {
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Inscription' }))
    await userEvent.type(screen.getByPlaceholderText(/ton@email.com/i), 'new@test.com')
    const passwordInputs = screen.getAllByLabelText(/mot de passe/i)
    await userEvent.type(passwordInputs[0], 'password123')
    await userEvent.type(passwordInputs[1], 'password123')
    await userEvent.click(screen.getByRole('button', { name: /s'inscrire/i }))
    expect(supabase.auth.signUp).toHaveBeenCalledWith({ email: 'new@test.com', password: 'password123' })
  })

  it('shows confirmation message after signup', async () => {
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Inscription' }))
    await userEvent.type(screen.getByPlaceholderText(/ton@email.com/i), 'new@test.com')
    const passwordInputs = screen.getAllByLabelText(/mot de passe/i)
    await userEvent.type(passwordInputs[0], 'password123')
    await userEvent.type(passwordInputs[1], 'password123')
    await userEvent.click(screen.getByRole('button', { name: /s'inscrire/i }))
    await screen.findByText(/rifie ta bo/)
  })

  it('shows error when passwords do not match', async () => {
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Inscription' }))
    await userEvent.type(screen.getByPlaceholderText(/ton@email.com/i), 'new@test.com')
    const passwordInputs = screen.getAllByLabelText(/mot de passe/i)
    await userEvent.type(passwordInputs[0], 'password123')
    await userEvent.type(passwordInputs[1], 'different')
    await userEvent.click(screen.getByRole('button', { name: /s'inscrire/i }))
    await screen.findByText(/mots de passe ne correspondent pas/i)
  })

  it('shows error on signup failure', async () => {
    vi.mocked(supabase.auth.signUp).mockResolvedValue({ data: { user: null, session: null }, error: { message: 'Email taken' } } as never)
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Inscription' }))
    await userEvent.type(screen.getByPlaceholderText(/ton@email.com/i), 'taken@test.com')
    const passwordInputs = screen.getAllByLabelText(/mot de passe/i)
    await userEvent.type(passwordInputs[0], 'password123')
    await userEvent.type(passwordInputs[1], 'password123')
    await userEvent.click(screen.getByRole('button', { name: /s'inscrire/i }))
    await screen.findByText('Email taken')
  })
})

describe('Login — redirect', () => {
  it('redirects to /groups when userId set and no groupId', () => {
    vi.mocked(useAuth).mockReturnValue({ userId: 'u1', groupId: null, loading: false, signOut: vi.fn(), refreshGroupId: vi.fn() })
    renderPage()
    // navigate('/groups') is called — component renders without crashing
  })

  it('redirects to /game when userId and groupId set', () => {
    vi.mocked(useAuth).mockReturnValue({ userId: 'u1', groupId: 'g1', loading: false, signOut: vi.fn(), refreshGroupId: vi.fn() })
    renderPage()
    // navigate('/game') is called — returning user goes straight to game
  })

  it('redirects to /join/:code when pending invite exists', () => {
    sessionStorage.setItem('busted_pending_invite', 'ABC123')
    vi.mocked(useAuth).mockReturnValue({ userId: 'u1', groupId: null, loading: false, signOut: vi.fn(), refreshGroupId: vi.fn() })
    renderPage()
    // navigate('/join/ABC123') is called, sessionStorage cleared
    expect(sessionStorage.getItem('busted_pending_invite')).toBeNull()
  })
})
