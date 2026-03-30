import { useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { compressImage } from '../lib/compressImage'
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

export default function ProofSheet({ cell, onClose, onSubmitted }: Props) {
  const session = getSession()
  const [proofText, setProofText] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [compressing, setCompressing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState(false)

  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)

  const canSubmit = proofText.trim().length > 0 || imageFile !== null

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setCompressing(true)
    const blob = await compressImage(file)
    setImageFile(new File([blob], 'photo.jpg', { type: 'image/jpeg' }))
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
      const path = `${session.userId}/${Date.now()}.jpg`
      const { error: uploadError } = await supabase.storage
        .from('proofs')
        .upload(path, imageFile)
      if (uploadError) {
        setError('Erreur upload : ' + uploadError.message)
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

    await supabase
      .from('cells')
      .update({ status: 'pending_confirmation' })
      .eq('id', cell.id)

    setToast(true)
    setTimeout(() => {
      onSubmitted()
      onClose()
    }, 1800)
  }

  return (
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

          {/* Toast */}
          <AnimatePresence>
            {toast && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                style={styles.toast}
              >
                Preuve envoyée ! {cell.target?.username ?? 'La personne ciblée'} doit maintenant valider.
              </motion.div>
            )}
          </AnimatePresence>

          {/* Titre */}
          <p style={styles.title}>Ta preuve</p>
          <p style={styles.subtitle}>
            {cell.target?.username ?? '—'} · {cell.content}
          </p>

          <form onSubmit={handleSubmit} style={styles.form}>
            {/* Textarea */}
            <textarea
              value={proofText}
              onChange={(e) => setProofText(e.target.value)}
              maxLength={300}
              placeholder="Décris ce qui s'est passé..."
              rows={3}
              style={styles.textarea}
            />

            {/* Photo */}
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={handleImageChange} style={{ display: 'none' }} />
            <input ref={galleryRef} type="file" accept="image/*" onChange={handleImageChange} style={{ display: 'none' }} />

            {imagePreview ? (
              <div style={styles.thumbRow}>
                <div style={styles.thumbWrapper}>
                  <img src={imagePreview} style={styles.thumb} alt="preuve" />
                  <button
                    type="button"
                    onClick={() => { setImageFile(null); setImagePreview(null) }}
                    style={styles.removeBtn}
                  >
                    ✕
                  </button>
                </div>
              </div>
            ) : (
              <div style={styles.photoRow}>
                <button
                  type="button"
                  onClick={() => cameraRef.current?.click()}
                  style={styles.photoBtn}
                  disabled={compressing}
                >
                  <CameraIcon />
                  <span style={styles.photoBtnLabel}>
                    {compressing ? 'Compression...' : 'Prendre une photo'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => galleryRef.current?.click()}
                  style={styles.photoBtn}
                  disabled={compressing}
                >
                  <GalleryIcon />
                  <span style={styles.photoBtnLabel}>Galerie</span>
                </button>
              </div>
            )}

            {error && <p style={styles.error}>{error}</p>}

            <div style={styles.actions}>
              <button
                type="submit"
                disabled={loading || !canSubmit}
                style={{ ...styles.submitBtn, ...(!canSubmit ? styles.submitBtnDisabled : {}) }}
              >
                {loading ? 'Envoi...' : 'Envoyer au groupe'}
              </button>
              <button type="button" onClick={onClose} style={styles.cancelBtn}>
                Annuler
              </button>
            </div>
          </form>
        </motion.div>
      </motion.div>
  )
}

function CameraIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  )
}

function GalleryIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
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
    background: '#1A1A2E',
    borderRadius: '20px 20px 0 0',
    padding: '0.75rem 1.5rem 2.5rem',
    width: '100%',
    maxWidth: '560px',
    margin: '0 auto',
    boxShadow: '0 -4px 40px rgba(0,0,0,0.4)',
  },
  handle: {
    width: '32px',
    height: '3px',
    background: '#3A3A5A',
    borderRadius: '2px',
    margin: '0 auto 1.25rem',
  },
  toast: {
    background: '#22c55e',
    color: '#fff',
    fontFamily: 'var(--font-body)',
    fontWeight: 700,
    fontSize: '0.875rem',
    borderRadius: '10px',
    padding: '0.625rem 1rem',
    textAlign: 'center' as const,
    marginBottom: '1rem',
  },
  title: {
    fontFamily: 'var(--font-title)',
    fontWeight: 900,
    fontSize: '13px',
    color: '#F0F0FF',
    margin: '0 0 0.25rem',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
  },
  subtitle: {
    fontFamily: 'var(--font-body)',
    fontWeight: 400,
    fontSize: '11px',
    color: '#7878AA',
    margin: '0 0 1.25rem',
    lineHeight: 1.4,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  textarea: {
    background: '#0F0F1A',
    border: '1px solid #3A3A5A',
    borderRadius: '12px',
    color: '#F0F0FF',
    fontSize: '13px',
    fontFamily: 'var(--font-body)',
    padding: '12px',
    minHeight: '80px',
    resize: 'none',
    outline: 'none',
    lineHeight: 1.5,
    width: '100%',
    boxSizing: 'border-box' as const,
  },
  photoRow: {
    display: 'flex',
    gap: '0.5rem',
  },
  photoBtn: {
    flex: 1,
    background: '#0F0F1A',
    border: '1px solid #3A3A5A',
    borderRadius: '10px',
    color: '#7878AA',
    fontFamily: 'var(--font-body)',
    padding: '0.625rem 0.5rem',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.375rem',
    minHeight: '44px',
  },
  photoBtnLabel: {
    fontSize: '10px',
    fontWeight: 600,
    color: '#7878AA',
  },
  thumbRow: {
    display: 'flex',
    gap: '0.5rem',
  },
  thumbWrapper: {
    position: 'relative',
    width: '60px',
    height: '60px',
    flexShrink: 0,
  },
  thumb: {
    width: '60px',
    height: '60px',
    borderRadius: '8px',
    objectFit: 'cover',
  },
  removeBtn: {
    position: 'absolute',
    top: '-6px',
    right: '-6px',
    width: '18px',
    height: '18px',
    borderRadius: '50%',
    background: '#3A3A5A',
    color: '#F0F0FF',
    border: 'none',
    cursor: 'pointer',
    fontSize: '9px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 1,
  },
  actions: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  submitBtn: {
    background: '#4338CA',
    color: '#ffffff',
    border: 'none',
    borderRadius: '13px',
    padding: '0.875rem',
    fontFamily: 'var(--font-body)',
    fontWeight: 700,
    fontSize: '0.9375rem',
    cursor: 'pointer',
    width: '100%',
    minHeight: '44px',
  },
  submitBtnDisabled: {
    background: '#2A2A4A',
    color: '#555577',
    cursor: 'not-allowed',
  },
  cancelBtn: {
    background: 'transparent',
    color: '#F0F0FF',
    border: '1px solid #3A3A5A',
    borderRadius: '13px',
    padding: '0.875rem',
    fontFamily: 'var(--font-body)',
    fontWeight: 600,
    fontSize: '0.9375rem',
    cursor: 'pointer',
    width: '100%',
    minHeight: '44px',
  },
  error: {
    color: '#ef4444',
    fontSize: '0.875rem',
    fontFamily: 'var(--font-body)',
    margin: 0,
  },
}
