import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

vi.mock('../lib/session', () => ({
  getSession: vi.fn(),
}))

vi.mock('../lib/compressImage', () => ({
  compressImage: vi.fn().mockResolvedValue(new Blob(['compressed'], { type: 'image/jpeg' })),
}))

import { getSession } from '../lib/session'
import SubmitProof from './SubmitProof'

const mockSession = { userId: 'user-1', groupId: 'group-1', refreshToken: null }

const mockCell = {
  id: 'cell-1',
  content: 'Va faire du sport ce mois-ci',
  target: { username: 'Alice' },
}

const onClose = vi.fn()
const onSubmitted = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getSession).mockReturnValue(mockSession)
  vi.mocked(supabase.from).mockReturnValue(
    makeQueryBuilder({ data: null, error: null }) as ReturnType<typeof supabase.from>
  )
  vi.mocked(supabase.storage.from).mockReturnValue(
    makeStorageMock() as unknown as ReturnType<typeof supabase.storage.from>
  )
})

describe('SubmitProof — rendering', () => {
  it('displays the cell content', () => {
    render(<SubmitProof cell={mockCell} onClose={onClose} onSubmitted={onSubmitted} />)
    expect(screen.getByText(/"Va faire du sport ce mois-ci"/)).toBeInTheDocument()
  })

  it('displays the target username', () => {
    render(<SubmitProof cell={mockCell} onClose={onClose} onSubmitted={onSubmitted} />)
    expect(screen.getByText(/pari sur alice/i)).toBeInTheDocument()
  })

  it('submit button is disabled when no text and no image', () => {
    render(<SubmitProof cell={mockCell} onClose={onClose} onSubmitted={onSubmitted} />)
    expect(screen.getByRole('button', { name: /soumettre la preuve/i })).toBeDisabled()
  })

  it('submit button becomes enabled when text is entered', async () => {
    render(<SubmitProof cell={mockCell} onClose={onClose} onSubmitted={onSubmitted} />)
    await userEvent.type(screen.getByPlaceholderText(/optionnel/i), 'Voici ma preuve')
    expect(screen.getByRole('button', { name: /soumettre la preuve/i })).not.toBeDisabled()
  })

  it('shows add photo button initially', () => {
    render(<SubmitProof cell={mockCell} onClose={onClose} onSubmitted={onSubmitted} />)
    expect(screen.getByText('Prendre une photo')).toBeInTheDocument()
    expect(screen.getByText('Galerie')).toBeInTheDocument()
  })
})

describe('SubmitProof — submission', () => {
  it('shows success message after successful text submission', async () => {
    render(<SubmitProof cell={mockCell} onClose={onClose} onSubmitted={onSubmitted} />)
    await userEvent.type(screen.getByPlaceholderText(/optionnel/i), 'Voici ma preuve')
    await userEvent.click(screen.getByRole('button', { name: /soumettre la preuve/i }))
    await screen.findByText('✓ Preuve envoyée !')
  })

  it('shows error when submission already exists for this cell', async () => {
    vi.mocked(supabase.from).mockReturnValue(
      makeQueryBuilder({ data: { id: 'existing-sub' }, error: null }) as ReturnType<typeof supabase.from>
    )
    render(<SubmitProof cell={mockCell} onClose={onClose} onSubmitted={onSubmitted} />)
    await userEvent.type(screen.getByPlaceholderText(/optionnel/i), 'Voici ma preuve')
    await userEvent.click(screen.getByRole('button', { name: /soumettre la preuve/i }))
    await screen.findByText('Tu as déjà soumis une preuve pour cette case.')
  })

  it('shows insert error when DB insert fails', async () => {
    let callCount = 0
    vi.mocked(supabase.from).mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        // maybeSingle — no existing
        return makeQueryBuilder({ data: null, error: null }) as ReturnType<typeof supabase.from>
      }
      // insert fails
      return makeQueryBuilder({ data: null, error: { message: 'Erreur insertion' } }) as ReturnType<typeof supabase.from>
    })

    render(<SubmitProof cell={mockCell} onClose={onClose} onSubmitted={onSubmitted} />)
    await userEvent.type(screen.getByPlaceholderText(/optionnel/i), 'Voici ma preuve')
    await userEvent.click(screen.getByRole('button', { name: /soumettre la preuve/i }))
    await screen.findByText('Erreur insertion')
  })

  it('shows upload error when image upload fails', async () => {
    vi.mocked(supabase.storage.from).mockReturnValue({
      upload: vi.fn().mockResolvedValue({ error: { message: 'Upload failed' } }),
      getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: '' } }),
    } as unknown as ReturnType<typeof supabase.storage.from>)

    // Provide a fake image file
    const file = new File(['image'], 'test.jpg', { type: 'image/jpeg' })
    const { container } = render(
      <SubmitProof cell={mockCell} onClose={onClose} onSubmitted={onSubmitted} />
    )

    // There are two file inputs (camera + gallery); use the first one
    const inputs = container.querySelectorAll('input[type="file"]')
    await userEvent.upload(inputs[0] as HTMLInputElement, file)
    await screen.findByText('✕') // remove button appears after image selected

    await userEvent.click(screen.getByRole('button', { name: /soumettre la preuve/i }))
    await screen.findByText(/erreur upload photo/i)
  })

  it('removes image preview when remove button is clicked', async () => {
    const file = new File(['image'], 'test.jpg', { type: 'image/jpeg' })
    const { container } = render(
      <SubmitProof cell={mockCell} onClose={onClose} onSubmitted={onSubmitted} />
    )

    const inputs = container.querySelectorAll('input[type="file"]')
    await userEvent.upload(inputs[0] as HTMLInputElement, file)
    await screen.findByText('✕')

    await userEvent.click(screen.getByText('✕'))
    expect(screen.getByText('Prendre une photo')).toBeInTheDocument()
    // Submit should be disabled again (no text, no image)
    expect(screen.getByRole('button', { name: /soumettre la preuve/i })).toBeDisabled()
  })
})
