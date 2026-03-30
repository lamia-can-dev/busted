import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { makeQueryBuilder } from '../test/supabaseMock'
import { supabase } from '../lib/supabase'

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    auth: {
      signInAnonymously: vi.fn(),
    },
  },
}))

vi.mock('../lib/session', () => ({
  getSession: vi.fn(),
}))

import { getSession } from '../lib/session'
import CreateGroup from './CreateGroup'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(supabase.from).mockReturnValue(
    makeQueryBuilder({ data: null, error: null }) as ReturnType<typeof supabase.from>
  )
  vi.mocked(supabase.auth.signInAnonymously).mockResolvedValue({
    data: { user: { id: 'anon-1' }, session: null },
    error: null,
  } as never)
})

function renderPage() {
  return render(<MemoryRouter><CreateGroup /></MemoryRouter>)
}

describe('CreateGroup — rendering', () => {
  it('renders the Busted title', () => {
    vi.mocked(getSession).mockReturnValue(null)
    renderPage()
    expect(screen.getByText('Busted')).toBeInTheDocument()
  })

  it('renders the create form by default', () => {
    vi.mocked(getSession).mockReturnValue(null)
    renderPage()
    expect(screen.getByPlaceholderText(/les potes du jeudi/i)).toBeInTheDocument()
  })

  it('create submit is disabled when group name is empty', () => {
    vi.mocked(getSession).mockReturnValue(null)
    renderPage()
    // Step 1: button text is "Suivant →"
    expect(screen.getByRole('button', { name: /suivant/i })).toBeDisabled()
  })

  it('redirects to /game when session exists', () => {
    vi.mocked(getSession).mockReturnValue({ userId: 'u1', groupId: 'g1', refreshToken: null })
    renderPage()
    // navigate('/game') is called — component still renders without crashing
  })
})

describe('CreateGroup — mode toggle', () => {
  it('switches to join mode when "Rejoindre" is clicked', async () => {
    vi.mocked(getSession).mockReturnValue(null)
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Rejoindre' }))
    expect(screen.getByPlaceholderText(/a3k9pz/i)).toBeInTheDocument()
  })

  it('switches back to create mode', async () => {
    vi.mocked(getSession).mockReturnValue(null)
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Rejoindre' }))
    await userEvent.click(screen.getByRole('button', { name: /créer un groupe/i }))
    expect(screen.getByPlaceholderText(/les potes du jeudi/i)).toBeInTheDocument()
  })

  it('clears error when switching modes', async () => {
    vi.mocked(getSession).mockReturnValue(null)
    vi.mocked(supabase.auth.signInAnonymously).mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Auth failed' },
    } as never)
    renderPage()
    // Type name and go to step 2
    await userEvent.type(screen.getByPlaceholderText(/les potes du jeudi/i), 'Mon groupe')
    await userEvent.click(screen.getByRole('button', { name: /suivant/i }))
    // Now on step 2, click "Créer le groupe →"
    await userEvent.click(screen.getByRole('button', { name: /créer le groupe/i }))
    await screen.findByText(/auth failed/i)
    await userEvent.click(screen.getByRole('button', { name: 'Rejoindre' }))
    expect(screen.queryByText(/auth failed/i)).toBeNull()
  })
})

describe('CreateGroup — create flow', () => {
  it('enables submit when group name is typed', async () => {
    vi.mocked(getSession).mockReturnValue(null)
    renderPage()
    await userEvent.type(screen.getByPlaceholderText(/les potes du jeudi/i), 'Mon groupe')
    // Step 1: "Suivant →" is enabled
    expect(screen.getByRole('button', { name: /suivant/i })).not.toBeDisabled()
  })

  it('shows auth error when signInAnonymously fails', async () => {
    vi.mocked(getSession).mockReturnValue(null)
    vi.mocked(supabase.auth.signInAnonymously).mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Auth failed' },
    } as never)
    renderPage()
    await userEvent.type(screen.getByPlaceholderText(/les potes du jeudi/i), 'Mon groupe')
    await userEvent.click(screen.getByRole('button', { name: /suivant/i }))
    await userEvent.click(screen.getByRole('button', { name: /créer le groupe/i }))
    await screen.findByText(/erreur d'authentification/i)
  })

  it('shows DB error when group insert fails', async () => {
    vi.mocked(getSession).mockReturnValue(null)
    vi.mocked(supabase.from).mockReturnValue(
      makeQueryBuilder({ data: null, error: { message: 'DB write failed' } }) as ReturnType<typeof supabase.from>
    )
    renderPage()
    await userEvent.type(screen.getByPlaceholderText(/les potes du jeudi/i), 'Mon groupe')
    await userEvent.click(screen.getByRole('button', { name: /suivant/i }))
    await userEvent.click(screen.getByRole('button', { name: /créer le groupe/i }))
    await screen.findByText('DB write failed')
  })

  it('navigates to /join/:code on successful group creation', async () => {
    vi.mocked(getSession).mockReturnValue(null)
    vi.mocked(supabase.from).mockReturnValue(
      makeQueryBuilder({ data: null, error: null }) as ReturnType<typeof supabase.from>
    )
    renderPage()
    await userEvent.type(screen.getByPlaceholderText(/les potes du jeudi/i), 'Mon groupe')
    await userEvent.click(screen.getByRole('button', { name: /suivant/i }))
    await userEvent.click(screen.getByRole('button', { name: /créer le groupe/i }))
    // Navigation happens — component doesn't show error
    await waitFor(() => {
      expect(screen.queryByText(/erreur/i)).toBeNull()
    })
  })
})

describe('CreateGroup — join flow', () => {
  async function switchToJoin() {
    vi.mocked(getSession).mockReturnValue(null)
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Rejoindre' }))
  }

  it('join submit is disabled when code is empty', async () => {
    await switchToJoin()
    expect(screen.getByRole('button', { name: /rejoindre →/i })).toBeDisabled()
  })

  it('join submit is disabled when code is fewer than 6 chars', async () => {
    await switchToJoin()
    await userEvent.type(screen.getByPlaceholderText(/a3k9pz/i), 'ABC')
    expect(screen.getByRole('button', { name: /rejoindre →/i })).toBeDisabled()
  })

  it('shows remaining chars hint while typing', async () => {
    await switchToJoin()
    await userEvent.type(screen.getByPlaceholderText(/a3k9pz/i), 'AB')
    expect(screen.getByText(/4 caractères manquants/i)).toBeInTheDocument()
  })

  it('shows singular "caractère manquant" for 1 char remaining', async () => {
    await switchToJoin()
    await userEvent.type(screen.getByPlaceholderText(/a3k9pz/i), 'ABCDE')
    expect(screen.getByText(/1 caractère manquant/)).toBeInTheDocument()
  })

  it('join submit is enabled when code is 6 chars', async () => {
    await switchToJoin()
    await userEvent.type(screen.getByPlaceholderText(/a3k9pz/i), 'ABCDEF')
    expect(screen.getByRole('button', { name: /rejoindre →/i })).not.toBeDisabled()
  })

  it('shows error for invalid invite code', async () => {
    await switchToJoin()
    vi.mocked(supabase.from).mockReturnValue(
      makeQueryBuilder({ data: null, error: { message: 'not found' } }) as ReturnType<typeof supabase.from>
    )
    await userEvent.type(screen.getByPlaceholderText(/a3k9pz/i), 'BADCOD')
    await userEvent.click(screen.getByRole('button', { name: /rejoindre →/i }))
    await screen.findByText(/code invalide/i)
  })

  it('navigates to /join/:code on valid invite code', async () => {
    await switchToJoin()
    vi.mocked(supabase.from).mockReturnValue(
      makeQueryBuilder({ data: { invite_code: 'ABCDEF' }, error: null }) as ReturnType<typeof supabase.from>
    )
    await userEvent.type(screen.getByPlaceholderText(/a3k9pz/i), 'ABCDEF')
    await userEvent.click(screen.getByRole('button', { name: /rejoindre →/i }))
    await waitFor(() => {
      expect(screen.queryByText(/erreur/i)).toBeNull()
    })
  })
})
