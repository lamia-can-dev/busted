import { useRef, useState } from 'react'
import { compressImage } from '../lib/compressImage'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { getSession } from '../lib/session'

interface Props {
  cell: {
    id: string
    content: string | null
    target: { username: string } | null
  }
  onClose: () => void
  onSubmitted: () => void
}

export default function SubmitProof({ cell, onClose, onSubmitted }: Props) {
  const session = getSession()
  const [proofText, setProofText] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [compressing, setCompressing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)

  const canSubmit = proofText.trim().length > 0 || imageFile !== null

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setCompressing(true)
    const blob = await compressImage(file)
    const compressed = new File([blob], 'photo.jpg', { type: 'image/jpeg' })
    setImageFile(compressed)
    setImagePreview(URL.createObjectURL(blob))
    setCompressing(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!session || !canSubmit) return
    setLoading(true)
    setError(null)

    const { data: existing } = await supabase
      .from('submissions')
      .select('id')
      .eq('cell_id', cell.id)
      .eq('submitter_user_id', session.userId)
      .maybeSingle()

    if (existing) {
      setError('Tu as déjà soumis une preuve pour cette case.')
      setLoading(false)
      return
    }

    let proofImageUrl: string | null = null
    if (imageFile) {
      const ext = imageFile.name.split('.').pop() ?? 'jpg'
      const path = `${session.userId}/${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('proofs')
        .upload(path, imageFile)
      if (uploadError) {
        setError('Erreur upload photo : ' + uploadError.message)
        setLoading(false)
        return
      }
      const { data: urlData } = supabase.storage.from('proofs').getPublicUrl(path)
      proofImageUrl = urlData.publicUrl
    }

    const { error: insertError } = await supabase.from('submissions').insert({
      cell_id: cell.id,
      submitter_user_id: session.userId,
      proof_text: proofText.trim() || null,
      proof_image_url: proofImageUrl,
    })

    if (insertError) {
      setError(insertError.message)
      setLoading(false)
      return
    }

    setSuccess(true)
    setTimeout(() => { onSubmitted(); onClose() }, 1200)
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        style={styles.backdrop}
      >
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
          style={styles.sheet}
        >
          <div style={styles.handle} />

          {success ? (
            <div style={styles.successMsg}>✓ Preuve envoyée !</div>
          ) : (
            <>
              <div style={styles.cellPreview}>
                <span style={styles.targetLabel}>
                  Pari sur {cell.target?.username ?? '—'}
                </span>
                <p style={styles.cellContent}>"{cell.content}"</p>
              </div>

              <form onSubmit={handleSubmit} style={styles.form}>
                {/* Text proof */}
                <div style={styles.field}>
                  <label style={styles.label}>Décris ce qui s'est passé</label>
                  <textarea
                    value={proofText}
                    onChange={(e) => setProofText(e.target.value)}
                    maxLength={200}
                    placeholder="Optionnel si tu as une photo..."
                    rows={3}
                    style={styles.textarea}
                    autoFocus
                  />
                  <span style={styles.counter}>{proofText.length}/200</span>
                </div>

                {/* Image proof */}
                <div style={styles.field}>
                  <label style={styles.label}>Photo</label>
                  <input ref={cameraInputRef} type="file" accept="image/*" capture="user" onChange={handleImageChange} style={{ display: 'none' }} />
                  <input ref={galleryInputRef} type="file" accept="image/*" onChange={handleImageChange} style={{ display: 'none' }} />
                  {imagePreview ? (
                    <div style={styles.imagePreviewWrapper}>
                      <img src={imagePreview} style={styles.imagePreview} alt="preuve" />
                      <button
                        type="button"
                        onClick={() => { setImageFile(null); setImagePreview(null) }}
                        style={styles.removeImageBtn}
                      >
                        ✕
                      </button>
                    </div>
                  ) : compressing ? (
                    <div style={styles.compressingLabel}>Compression en cours...</div>
                  ) : (
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        type="button"
                        onClick={() => cameraInputRef.current?.click()}
                        style={styles.addImageBtn}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>
                        </svg>
                        Prendre une photo
                      </button>
                      <button
                        type="button"
                        onClick={() => galleryInputRef.current?.click()}
                        style={styles.addImageBtn}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                        </svg>
                        Galerie
                      </button>
                    </div>
                  )}
                </div>

                {error && <p style={styles.error}>{error}</p>}

                <button
                  type="submit"
                  disabled={loading || !canSubmit}
                  style={{
                    ...styles.submitBtn,
                    ...(!canSubmit ? styles.submitBtnDisabled : {}),
                  }}
                >
                  {loading ? 'Envoi...' : 'Soumettre la preuve →'}
                </button>
              </form>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.6)',
    zIndex: 200,
    display: 'flex',
    alignItems: 'flex-end',
  },
  sheet: {
    background: 'var(--color-surface)',
    borderRadius: '1.5rem 1.5rem 0 0',
    padding: '1rem 1.5rem 2.5rem',
    width: '100%',
    maxWidth: '560px',
    margin: '0 auto',
    boxShadow: '0 -4px 40px rgba(0,0,0,0.4)',
  },
  handle: {
    width: '40px',
    height: '4px',
    background: 'var(--color-border)',
    borderRadius: '2px',
    margin: '0 auto 1.25rem',
  },
  cellPreview: {
    background: 'var(--color-bg)',
    borderRadius: '0.875rem',
    padding: '0.875rem 1rem',
    marginBottom: '1.25rem',
  },
  targetLabel: {
    fontFamily: 'var(--font-body)',
    fontWeight: 400,
    color: 'var(--color-text-secondary)',
    fontSize: '0.875rem',
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
    display: 'block',
    marginBottom: '0.3rem',
  },
  cellContent: {
    fontFamily: 'var(--font-body)',
    fontWeight: 400,
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
    fontStyle: 'italic',
    margin: 0,
    lineHeight: 1.4,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  label: {
    fontFamily: 'var(--font-body)',
    fontWeight: 400,
    color: 'var(--color-text-secondary)',
    fontSize: '0.875rem',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  },
  textarea: {
    background: 'var(--color-bg)',
    border: '1px solid var(--color-border)',
    borderRadius: '0.75rem',
    color: 'var(--color-text-primary)',
    fontSize: '0.95rem',
    padding: '0.75rem 1rem',
    resize: 'none',
    lineHeight: 1.5,
    outline: 'none',
    fontFamily: 'var(--font-body)',
  },
  counter: {
    color: 'var(--color-text-secondary)',
    fontSize: '0.875rem',
    alignSelf: 'flex-end',
  },
  compressingLabel: {
    fontFamily: 'var(--font-body)',
    fontWeight: 400,
    color: 'var(--color-text-secondary)',
    fontSize: '0.875rem',
    padding: '0.75rem 0',
    textAlign: 'center' as const,
  },
  addImageBtn: {
    background: 'var(--color-bg)',
    border: '1px dashed var(--color-border)',
    borderRadius: '0.75rem',
    color: 'var(--color-text-secondary)',
    fontFamily: 'var(--font-body)',
    fontWeight: 700,
    fontSize: '0.9375rem',
    padding: '0.75rem 1rem',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    justifyContent: 'center',
    minHeight: '44px',
  },
  imagePreviewWrapper: {
    position: 'relative',
    display: 'inline-block',
    width: '100%',
  },
  imagePreview: {
    width: '100%',
    maxHeight: '200px',
    objectFit: 'cover',
    borderRadius: '0.75rem',
  },
  removeImageBtn: {
    position: 'absolute',
    top: '0.5rem',
    right: '0.5rem',
    background: 'rgba(0,0,0,0.6)',
    color: 'var(--color-text-primary)',
    border: 'none',
    borderRadius: '50%',
    width: '28px',
    height: '28px',
    cursor: 'pointer',
    fontSize: '0.8rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtn: {
    background: 'var(--color-indigo)',
    color: '#ffffff',
    border: 'none',
    borderRadius: '20px',
    padding: '0.875rem',
    fontFamily: 'var(--font-body)',
    fontWeight: 700,
    fontSize: '0.9375rem',
    cursor: 'pointer',
    minHeight: '44px',
  },
  submitBtnDisabled: {
    background: 'var(--color-border)',
    color: 'var(--color-text-secondary)',
    cursor: 'not-allowed',
  },
  error: {
    color: '#ef4444',
    fontSize: '0.875rem',
    margin: 0,
  },
  successMsg: {
    color: '#22c55e',
    fontSize: '1.1rem',
    fontWeight: 600,
    textAlign: 'center',
    padding: '2rem 0',
  },
}
