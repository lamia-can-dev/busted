import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { hashPassword } from '../lib/hash'

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

vi.mock('../lib/hash', () => ({
  hashPassword: vi.fn(),
}))

vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}))

import { useAuth } from '../contexts/AuthContext'
import Login from './Login'

const loginAs = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useAuth).mockReturnValue({ userId: null, groupId: null, loading: false, signOut: vi.fn(), refreshGroupId: vi.fn(), loginAs })
  vi.mocked(hashPassword).mockResolvedValue('hashed_pw')
  sessionStorage.clear()
})

function mockAccountsSelect(result: { data: unknown; error: unknown }) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  }
  vi.mocked(supabase.from).mockReturnValue(chain as never)
  return chain
}

function mockAccountsInsert(result: { data: unknown; error: unknown }) {
  const chain = {
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
  }
  vi.mocked(supabase.from).mockReturnValue(chain as never)
  return chain
}

function renderPage() {
  return render(<MemoryRouter><Login /></MemoryRouter>)
}

describe('Login — rendering', () => {
  it('renders username form in Connexion mode by default', () => {
    renderPage()
    expect(screen.getByPlaceholderText(/nico_le_roi/i)).toBeInTheDocument()
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

describe('Login — login', () => {
  it('queries accounts table and calls loginAs on success', async () => {
    mockAccountsSelect({ data: { id: 'u1', password_hash: 'hashed_pw' }, error: null })
    renderPage()
    await userEvent.type(screen.getByPlaceholderText(/nico_le_roi/i), 'TestUser')
    await userEvent.type(screen.getByLabelText(/mot de passe/i), 'password123')
    await userEvent.click(screen.getByRole('button', { name: /se connecter$/i }))
    expect(supabase.from).toHaveBeenCalledWith('accounts')
    expect(loginAs).toHaveBeenCalledWith('u1')
  })

  it('shows error on login failure (wrong password)', async () => {
    mockAccountsSelect({ data: { id: 'u1', password_hash: 'different_hash' }, error: null })
    renderPage()
    await userEvent.type(screen.getByPlaceholderText(/nico_le_roi/i), 'TestUser')
    await userEvent.type(screen.getByLabelText(/mot de passe/i), 'wrong')
    await userEvent.click(screen.getByRole('button', { name: /se connecter$/i }))
    await screen.findByText(/identifiant ou mot de passe incorrect/i)
  })

  it('shows error when user not found', async () => {
    mockAccountsSelect({ data: null, error: null })
    renderPage()
    await userEvent.type(screen.getByPlaceholderText(/nico_le_roi/i), 'Nobody')
    await userEvent.type(screen.getByLabelText(/mot de passe/i), 'password123')
    await userEvent.click(screen.getByRole('button', { name: /se connecter$/i }))
    await screen.findByText(/identifiant ou mot de passe incorrect/i)
  })
})

describe('Login — signup', () => {
  it('inserts into accounts table and calls loginAs on success', async () => {
    mockAccountsInsert({ data: { id: 'new-u1' }, error: null })
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Inscription' }))
    await userEvent.type(screen.getByPlaceholderText(/nico_le_roi/i), 'NewUser')
    const passwordInputs = screen.getAllByLabelText(/mot de passe/i)
    await userEvent.type(passwordInputs[0], 'password123')
    await userEvent.type(passwordInputs[1], 'password123')
    await userEvent.click(screen.getByRole('button', { name: /s'inscrire/i }))
    expect(supabase.from).toHaveBeenCalledWith('accounts')
    expect(loginAs).toHaveBeenCalledWith('new-u1')
  })

  it('shows error when passwords do not match', async () => {
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Inscription' }))
    await userEvent.type(screen.getByPlaceholderText(/nico_le_roi/i), 'NewUser')
    const passwordInputs = screen.getAllByLabelText(/mot de passe/i)
    await userEvent.type(passwordInputs[0], 'password123')
    await userEvent.type(passwordInputs[1], 'different')
    await userEvent.click(screen.getByRole('button', { name: /s'inscrire/i }))
    await screen.findByText(/mots de passe ne correspondent pas/i)
  })

  it('shows error on duplicate username', async () => {
    mockAccountsInsert({ data: null, error: { message: 'duplicate key' } })
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Inscription' }))
    await userEvent.type(screen.getByPlaceholderText(/nico_le_roi/i), 'TakenUser')
    const passwordInputs = screen.getAllByLabelText(/mot de passe/i)
    await userEvent.type(passwordInputs[0], 'password123')
    await userEvent.type(passwordInputs[1], 'password123')
    await userEvent.click(screen.getByRole('button', { name: /s'inscrire/i }))
    await screen.findByText(/nom d'utilisateur est déjà pris/i)
  })
})

describe('Login — redirect', () => {
  it('redirects to /groups when userId set and no groupId', () => {
    vi.mocked(useAuth).mockReturnValue({ userId: 'u1', groupId: null, loading: false, signOut: vi.fn(), refreshGroupId: vi.fn(), loginAs })
    renderPage()
  })

  it('redirects to /game when userId and groupId set', () => {
    vi.mocked(useAuth).mockReturnValue({ userId: 'u1', groupId: 'g1', loading: false, signOut: vi.fn(), refreshGroupId: vi.fn(), loginAs })
    renderPage()
  })

  it('redirects to /join/:code when pending invite exists', () => {
    sessionStorage.setItem('busted_pending_invite', 'ABC123')
    vi.mocked(useAuth).mockReturnValue({ userId: 'u1', groupId: null, loading: false, signOut: vi.fn(), refreshGroupId: vi.fn(), loginAs })
    renderPage()
    expect(sessionStorage.getItem('busted_pending_invite')).toBeNull()
  })
})
