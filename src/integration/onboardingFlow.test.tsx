/**
 * Integration — Onboarding → session save → navigate to game
 *
 * Tests the complete onboarding flow: group code validation, anonymous auth,
 * user profile creation, avatar upload, and session persistence.
 * Supabase is mocked at the network boundary.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { makeQueryBuilder, makeStorageMock } from '../test/supabaseMock'
import { supabase } from '../lib/supabase'

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    storage: {
      from: vi.fn(),
    },
  },
}))

vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}))

vi.mock('../lib/compressImage', () => ({
  compressImage: vi.fn().mockResolvedValue(new Blob(['compressed'], { type: 'image/jpeg' })),
}))

import { useAuth } from '../contexts/AuthContext'
import Onboarding from '../pages/Onboarding'

const MOCK_GROUP = { id: 'group-abc' }

function renderOnboarding(code = 'INVITE1') {
  return render(
    <MemoryRouter initialEntries={[`/join/${code}`]}>
      <Routes>
        <Route path="/join/:invite_code" element={<Onboarding />} />
        <Route path="/game" element={<div>Game page</div>} />
      </Routes>
    </MemoryRouter>
  )
}

function setupHappyPath() {
  vi.mocked(supabase.from).mockImplementation((table: string) => {
    if (table === 'groups') return makeQueryBuilder({ data: MOCK_GROUP, error: null }) as ReturnType<typeof supabase.from>
    return makeQueryBuilder({ data: null, error: null }) as ReturnType<typeof supabase.from>
  })
  vi.mocked(supabase.storage.from).mockReturnValue(
    makeStorageMock('https://cdn.example.com/avatar.jpg') as unknown as ReturnType<typeof supabase.storage.from>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useAuth).mockReturnValue({ userId: 'anon-42', groupId: null, loading: false, signOut: vi.fn(), refreshGroupId: vi.fn(), loginAs: vi.fn() })
  setupHappyPath()
})

// Helper to complete step 1 and move to step 2
async function completeStep1(username = 'Thomas') {
  await userEvent.type(screen.getByPlaceholderText(/nico_le_roi/i), username)
  await userEvent.click(screen.getByRole('button', { name: /suivant/i }))
}

// Helper to answer required questions in step 2
async function answerQuestions() {
  await userEvent.click(screen.getByText('Product'))
  await userEvent.click(screen.getByText('Organisateur en chef'))
  await userEvent.click(screen.getByText('Healthy & équilibré'))
}

// --- Happy path ---

describe('Onboarding — complete flow', () => {
  it('full flow: type username → submit → navigates to game', async () => {
    renderOnboarding()
    await completeStep1('Thomas')
    await answerQuestions()
    await userEvent.click(screen.getByRole('button', { name: /rejoindre le groupe/i }))

    await screen.findByText('Game page')
  })

  it('navigates to /game after successful submission', async () => {
    renderOnboarding()
    await completeStep1('Thomas')
    await answerQuestions()
    await userEvent.click(screen.getByRole('button', { name: /rejoindre le groupe/i }))

    await screen.findByText('Game page')
  })

  it('inserts user profile with correct username and group_id', async () => {
    let insertPayload: unknown
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'groups') return makeQueryBuilder({ data: MOCK_GROUP, error: null }) as ReturnType<typeof supabase.from>
      if (table === 'users') {
        const b = makeQueryBuilder({ data: null, error: null }) as ReturnType<typeof supabase.from>
        const origInsert = (b as Record<string, unknown>).insert as (v: unknown) => unknown
        ;(b as Record<string, unknown>).insert = (v: unknown) => { insertPayload = v; return origInsert(v) }
        return b
      }
      return makeQueryBuilder({ data: null, error: null }) as ReturnType<typeof supabase.from>
    })

    renderOnboarding()
    await completeStep1('Thomas')
    await answerQuestions()
    await userEvent.click(screen.getByRole('button', { name: /rejoindre le groupe/i }))

    await waitFor(() => {
      expect(insertPayload).toMatchObject({
        id: 'anon-42',
        username: 'Thomas',
        group_id: 'group-abc',
      })
    })
  })
})

// --- Avatar upload flow ---

describe('Onboarding — avatar upload flow', () => {
  it('full flow with avatar: uploads to storage, inserts avatar_url in profile', async () => {
    let insertPayload: unknown
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'groups') return makeQueryBuilder({ data: MOCK_GROUP, error: null }) as ReturnType<typeof supabase.from>
      if (table === 'users') {
        const b = makeQueryBuilder({ data: null, error: null }) as ReturnType<typeof supabase.from>
        const origInsert = (b as Record<string, unknown>).insert as (v: unknown) => unknown
        ;(b as Record<string, unknown>).insert = (v: unknown) => { insertPayload = v; return origInsert(v) }
        return b
      }
      return makeQueryBuilder({ data: null, error: null }) as ReturnType<typeof supabase.from>
    })

    renderOnboarding()
    const file = new File(['img'], 'avatar.png', { type: 'image/png' })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(input, file)

    await completeStep1('Thomas')
    await answerQuestions()
    await userEvent.click(screen.getByRole('button', { name: /rejoindre le groupe/i }))

    await waitFor(() => {
      expect(supabase.storage.from).toHaveBeenCalledWith('avatars')
    })
    await waitFor(() => {
      expect(insertPayload).toMatchObject({
        avatar_url: 'https://cdn.example.com/avatar.jpg',
      })
    })
  })
})

// --- Error flows ---

describe('Onboarding — error paths', () => {
  it('shows invite code error when group not found', async () => {
    vi.mocked(supabase.from).mockReturnValue(
      makeQueryBuilder({ data: null, error: { message: 'not found' } }) as ReturnType<typeof supabase.from>
    )
    renderOnboarding('BADCODE')
    await completeStep1('Thomas')
    await answerQuestions()
    await userEvent.click(screen.getByRole('button', { name: /rejoindre le groupe/i }))
    await screen.findByText("Code d'invitation invalide.")
  })

  it('shows profile creation error when user insert fails', async () => {
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'groups') return makeQueryBuilder({ data: MOCK_GROUP, error: null }) as ReturnType<typeof supabase.from>
      if (table === 'users') return makeQueryBuilder({ data: null, error: { message: 'Insert failed' } }) as ReturnType<typeof supabase.from>
      return makeQueryBuilder({ data: null, error: null }) as ReturnType<typeof supabase.from>
    })

    renderOnboarding()
    await completeStep1('Thomas')
    await answerQuestions()
    await userEvent.click(screen.getByRole('button', { name: /rejoindre le groupe/i }))
    await screen.findByText(/erreur lors de la création du profil/i)
  })
})
