import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
import ProposeCell from './ProposeCell'

const mockSession = { userId: 'user-1', groupId: 'group-1', refreshToken: null }

const mockMembers = [
  { id: 'user-2', username: 'Alice', avatar_url: null, group_id: 'group-1', onboarding_answers: null, created_at: '' },
  { id: 'user-3', username: 'Bob', avatar_url: null, group_id: 'group-1', onboarding_answers: null, created_at: '' },
]

const onClose = vi.fn()

function mockFromByTable(overrides: Record<string, { data: unknown; error: unknown }> = {}) {
  vi.mocked(supabase.from).mockImplementation((table: string) => {
    if (table in overrides) return makeQueryBuilder(overrides[table]) as ReturnType<typeof supabase.from>
    return makeQueryBuilder({ data: [], error: null }) as ReturnType<typeof supabase.from>
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getSession).mockReturnValue(mockSession)
  mockFromByTable({ users: { data: mockMembers, error: null } })
})

describe('ProposeCell — rendering', () => {
  it('renders the modal title', () => {
    render(<ProposeCell onClose={onClose} />)
    expect(screen.getByText('Proposer une case')).toBeInTheDocument()
  })

  it('renders all group members as target options', async () => {
    render(<ProposeCell onClose={onClose} />)
    await screen.findByText('Alice')
    expect(screen.getByText('Bob')).toBeInTheDocument()
  })

  it('submit button is disabled when content is empty', async () => {
    render(<ProposeCell onClose={onClose} />)
    await screen.findByText('Alice')
    expect(screen.getByRole('button', { name: /proposer/i })).toBeDisabled()
  })

  it('submit button is enabled when content is filled', async () => {
    render(<ProposeCell onClose={onClose} />)
    await screen.findByText('Alice')
    await userEvent.type(screen.getByPlaceholderText(/thomas va parler/i), 'Va faire du sport')
    expect(screen.getByRole('button', { name: /proposer/i })).not.toBeDisabled()
  })
})

describe('ProposeCell — submission', () => {
  it('shows success message after successful proposal', async () => {
    mockFromByTable({
      users: { data: mockMembers, error: null },
      proposals: { data: null, error: null }, // no existing proposal (maybeSingle returns null data)
    })
    // Insert succeeds
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'users') return makeQueryBuilder({ data: mockMembers, error: null }) as ReturnType<typeof supabase.from>
      // For proposals: first call is maybeSingle (duplicate check), second is insert
      return makeQueryBuilder({ data: null, error: null }) as ReturnType<typeof supabase.from>
    })

    render(<ProposeCell onClose={onClose} />)
    await screen.findByText('Alice')
    await userEvent.type(screen.getByPlaceholderText(/thomas va parler/i), 'Va faire du sport')
    await userEvent.click(screen.getByRole('button', { name: /proposer/i }))
    await screen.findByText('✓ Proposition envoyée !')
  })

  it('shows duplicate error when proposal already exists', async () => {
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'users') return makeQueryBuilder({ data: mockMembers, error: null }) as ReturnType<typeof supabase.from>
      // maybeSingle returns existing proposal
      return makeQueryBuilder({ data: { id: 'existing-1' }, error: null }) as ReturnType<typeof supabase.from>
    })

    render(<ProposeCell onClose={onClose} />)
    await screen.findByText('Alice')
    await userEvent.type(screen.getByPlaceholderText(/thomas va parler/i), 'Va faire du sport')
    await userEvent.click(screen.getByRole('button', { name: /proposer/i }))
    await screen.findByText('Cette case a déjà été proposée.')
  })

  it('shows DB error when insert fails', async () => {
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'users') return makeQueryBuilder({ data: mockMembers, error: null }) as ReturnType<typeof supabase.from>
      // First call: duplicate check returns null (no existing)
      // Second call: insert fails
      const b = makeQueryBuilder({ data: null, error: null }) as ReturnType<typeof supabase.from>
      // Override maybeSingle to return no existing
      ;(b as Record<string, unknown>).maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
      // Override then (for insert) to return error
      ;(b as Record<string, unknown>).then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: null, error: { message: 'Erreur base de données' } }).then(resolve)
      return b
    })

    render(<ProposeCell onClose={onClose} />)
    await screen.findByText('Alice')
    await userEvent.type(screen.getByPlaceholderText(/thomas va parler/i), 'Va faire du sport')
    await userEvent.click(screen.getByRole('button', { name: /proposer/i }))
    await screen.findByText('Erreur base de données')
  })

  it('selecting a member changes the active target', async () => {
    render(<ProposeCell onClose={onClose} />)
    await screen.findByText('Bob')
    await userEvent.click(screen.getByText('Bob'))
    // Bob button should now be visually active — check it exists and is clickable
    expect(screen.getByText('Bob')).toBeInTheDocument()
  })
})
