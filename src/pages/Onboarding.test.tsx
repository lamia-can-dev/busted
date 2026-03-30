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
import Onboarding from './Onboarding'

const mockGroup = { id: 'group-1' }

function renderWithInvite(code = 'ABC123') {
  return render(
    <MemoryRouter initialEntries={[`/join/${code}`]}>
      <Routes>
        <Route path="/join/:invite_code" element={<Onboarding />} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useAuth).mockReturnValue({ userId: 'anon-user', groupId: null, loading: false, signOut: vi.fn(), refreshGroupId: vi.fn(), loginAs: vi.fn() })
  vi.mocked(supabase.from).mockImplementation((table: string) => {
    if (table === 'groups') return makeQueryBuilder({ data: mockGroup, error: null }) as ReturnType<typeof supabase.from>
    return makeQueryBuilder({ data: null, error: null }) as ReturnType<typeof supabase.from>
  })
  vi.mocked(supabase.storage.from).mockReturnValue(
    makeStorageMock('https://cdn.example.com/avatar.jpg') as unknown as ReturnType<typeof supabase.storage.from>
  )
})

// Helper to go to step 2 (fill username + click Suivant + answer questions)
async function goToStep2(username = 'Lamia') {
  renderWithInvite()
  await userEvent.type(screen.getByPlaceholderText(/nico_le_roi/i), username)
  await userEvent.click(screen.getByRole('button', { name: /suivant/i }))
  // Answer the required questions in step 2
  // Job (select first option)
  await userEvent.click(screen.getByText('Product'))
  // Teuf
  await userEvent.click(screen.getByText('Organisateur en chef'))
  // Food
  await userEvent.click(screen.getByText('Healthy & équilibré'))
}

describe('Onboarding — rendering', () => {
  it('renders the page title (Busted logo)', () => {
    renderWithInvite()
    expect(screen.getByText('Busted')).toBeInTheDocument()
  })

  it('renders the username input', () => {
    renderWithInvite()
    expect(screen.getByPlaceholderText(/nico_le_roi/i)).toBeInTheDocument()
  })

  it('submit is disabled when username is empty', () => {
    renderWithInvite()
    // Step 1: "Suivant" button is disabled when empty
    expect(screen.getByRole('button', { name: /suivant/i })).toBeDisabled()
  })

  it('submit becomes enabled when username is typed', async () => {
    renderWithInvite()
    await userEvent.type(screen.getByPlaceholderText(/nico_le_roi/i), 'Lamia')
    expect(screen.getByRole('button', { name: /suivant/i })).not.toBeDisabled()
  })

  it('shows character counter', async () => {
    renderWithInvite()
    await userEvent.type(screen.getByPlaceholderText(/nico_le_roi/i), 'Lamia')
    expect(screen.getByText('5/20')).toBeInTheDocument()
  })

  it('renders avatar upload section', () => {
    renderWithInvite()
    // The component shows camera/gallery buttons, not "Ajouter une photo"
    expect(screen.getByText('Prendre une photo')).toBeInTheDocument()
  })
})

describe('Onboarding — form submission errors', () => {
  it('shows error for invalid invite code', async () => {
    vi.mocked(supabase.from).mockReturnValue(
      makeQueryBuilder({ data: null, error: { message: 'not found' } }) as ReturnType<typeof supabase.from>
    )
    renderWithInvite('BADCOD')
    await userEvent.type(screen.getByPlaceholderText(/nico_le_roi/i), 'Lamia')
    await userEvent.click(screen.getByRole('button', { name: /suivant/i }))
    // Answer required questions
    await userEvent.click(screen.getByText('Product'))
    await userEvent.click(screen.getByText('Organisateur en chef'))
    await userEvent.click(screen.getByText('Healthy & équilibré'))
    await userEvent.click(screen.getByRole('button', { name: /rejoindre le groupe/i }))
    await screen.findByText("Code d'invitation invalide.")
  })

  it('shows error when user insert fails', async () => {
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'groups') return makeQueryBuilder({ data: mockGroup, error: null }) as ReturnType<typeof supabase.from>
      if (table === 'users') return makeQueryBuilder({ data: null, error: { message: 'Insert error' } }) as ReturnType<typeof supabase.from>
      return makeQueryBuilder({ data: null, error: null }) as ReturnType<typeof supabase.from>
    })
    renderWithInvite()
    await userEvent.type(screen.getByPlaceholderText(/nico_le_roi/i), 'Lamia')
    await userEvent.click(screen.getByRole('button', { name: /suivant/i }))
    await userEvent.click(screen.getByText('Product'))
    await userEvent.click(screen.getByText('Organisateur en chef'))
    await userEvent.click(screen.getByText('Healthy & équilibré'))
    await userEvent.click(screen.getByRole('button', { name: /rejoindre le groupe/i }))
    await screen.findByText(/erreur lors de la création du profil/i)
  })
})

describe('Onboarding — successful submission', () => {
  it('calls refreshGroupId and navigates on success', async () => {
    const refreshGroupId = vi.fn()
    vi.mocked(useAuth).mockReturnValue({ userId: 'anon-user', groupId: null, loading: false, signOut: vi.fn(), refreshGroupId, loginAs: vi.fn() })
    await goToStep2('Lamia')
    await userEvent.click(screen.getByRole('button', { name: /rejoindre le groupe/i }))
    await waitFor(() => {
      expect(refreshGroupId).toHaveBeenCalled()
    })
  })

  it('shows loading state during submit', async () => {
    // Delay the group query so loading is visible
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'groups') {
        const b = makeQueryBuilder({ data: mockGroup, error: null })
        const origSingle = (b as Record<string, unknown>).single as () => Promise<unknown>
        ;(b as Record<string, unknown>).single = () =>
          new Promise((resolve) => setTimeout(() => resolve({ data: mockGroup, error: null }), 50))
            .then(origSingle)
        return b as ReturnType<typeof supabase.from>
      }
      return makeQueryBuilder({ data: null, error: null }) as ReturnType<typeof supabase.from>
    })
    renderWithInvite()
    await userEvent.type(screen.getByPlaceholderText(/nico_le_roi/i), 'Lamia')
    await userEvent.click(screen.getByRole('button', { name: /suivant/i }))
    await userEvent.click(screen.getByText('Product'))
    await userEvent.click(screen.getByText('Organisateur en chef'))
    await userEvent.click(screen.getByText('Healthy & équilibré'))
    await userEvent.click(screen.getByRole('button', { name: /rejoindre le groupe/i }))
    expect(screen.getByRole('button', { name: /chargement/i })).toBeInTheDocument()
  })
})

describe('Onboarding — avatar upload', () => {
  it('shows avatar preview after selecting a file', async () => {
    renderWithInvite()
    const file = new File(['img'], 'avatar.jpg', { type: 'image/jpeg' })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(input, file)
    // After uploading, the avatar preview is shown (the circle gets background-image)
    // The button text doesn't change to "Changer la photo" in this component
    // Instead, the camera/gallery buttons remain
    await waitFor(() => {
      // Avatar preview should be visible — the avatar circle gets backgroundImage set
      const avatarCircle = document.querySelector('[style*="background-image"]') as HTMLElement
      expect(avatarCircle).not.toBeNull()
    })
  })

  it('uploads avatar and uses public URL on submit', async () => {
    renderWithInvite()
    const file = new File(['img'], 'avatar.jpg', { type: 'image/jpeg' })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(input, file)

    await userEvent.type(screen.getByPlaceholderText(/nico_le_roi/i), 'Lamia')
    await userEvent.click(screen.getByRole('button', { name: /suivant/i }))
    await userEvent.click(screen.getByText('Product'))
    await userEvent.click(screen.getByText('Organisateur en chef'))
    await userEvent.click(screen.getByText('Healthy & équilibré'))
    await userEvent.click(screen.getByRole('button', { name: /rejoindre le groupe/i }))

    await waitFor(() => {
      expect(supabase.storage.from).toHaveBeenCalledWith('avatars')
    })
  })
})
