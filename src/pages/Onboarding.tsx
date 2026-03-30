import { useState, useRef } from 'react'
import { compressImage } from '../lib/compressImage'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { saveSession } from '../lib/session'
import Logo from '../components/Logo'

const JOB_OPTIONS   = ['Product', 'Tech Lead', 'Dev', 'Sales', 'Autres']
const TEUF_OPTIONS  = ['Organisateur en chef', 'Présent mais discret', 'Je viens pour manger', 'Plutôt soirée canapé']
const FOOD_OPTIONS  = ['Healthy & équilibré', 'Fast food assumé', 'Je mange n\'importe quoi', 'Veggie / vegan']

export default function Onboarding() {
  const { invite_code } = useParams<{ invite_code: string }>()
  const navigate = useNavigate()

  // Step 1
  const [step, setStep] = useState<1 | 2>(1)
  const [username, setUsername] = useState('')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)

  // Step 2
  const [job, setJob] = useState('')
  const [teuf, setTeuf] = useState('')
  const [food, setFood] = useState('')
  const [defaut, setDefaut] = useState('')

  const [loading, setLoading] = useState(false)
  const [compressing, setCompressing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setCompressing(true)
    const blob = await compressImage(file)
    const compressed = new File([blob], 'photo.jpg', { type: 'image/jpeg' })
    setAvatarFile(compressed)
    setAvatarPreview(URL.createObjectURL(blob))
    setCompressing(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!invite_code || !username.trim()) return
    setLoading(true)
    setError(null)

    const { data: group, error: groupError } = await supabase
      .from('groups')
      .select('id')
      .eq('invite_code', invite_code.toUpperCase())
      .single()

    if (groupError || !group) {
      setError('Code d\'invitation invalide.')
      setLoading(false)
      return
    }

    const { data: authData, error: authError } = await supabase.auth.signInAnonymously()
    if (authError || !authData.user) {
      setError('Erreur d\'authentification : ' + (authError?.message ?? ''))
      setLoading(false)
      return
    }
    const userId = authData.user.id

    let avatarUrl: string | null = null
    if (avatarFile) {
      const ext = avatarFile.name.split('.').pop() ?? 'jpg'
      const path = `${userId}/avatar.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, avatarFile, { upsert: true })
      if (!uploadError) {
        const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
        avatarUrl = urlData.publicUrl
      }
    }

    const { error: insertError } = await supabase.from('users').insert({
      id: userId,
      group_id: group.id,
      username: username.trim(),
      avatar_url: avatarUrl,
      onboarding_answers: { job, teuf, food, defaut: defaut.trim() },
    })

    if (insertError) {
      setError('Erreur lors de la création du profil : ' + insertError.message)
      setLoading(false)
      return
    }

    const refreshToken = authData.session?.refresh_token
    saveSession(userId, group.id, refreshToken ?? undefined)
    navigate('/game')
  }

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <a href="/" style={styles.backBtn}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
        </a>
        <Logo variant="full" />
      </header>

      {/* Progress */}
      <div style={styles.progressRow}>
        <div style={{ ...styles.progressDot, ...(step >= 1 ? styles.progressDotActive : {}) }} />
        <div style={styles.progressLine} />
        <div style={{ ...styles.progressDot, ...(step >= 2 ? styles.progressDotActive : {}) }} />
      </div>

      {step === 1 ? (
        <form
          onSubmit={(e) => { e.preventDefault(); setStep(2) }}
          style={styles.form}
        >
          <div style={styles.avatarSection}>
            <div
              style={{
                ...styles.avatarCircle,
                backgroundImage: avatarPreview ? `url(${avatarPreview})` : undefined,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
            >
              {!avatarPreview && !compressing && <span style={{ fontSize: '2rem' }}>📷</span>}
              {compressing && <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>Compression...</span>}
            </div>
            {!compressing && (
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="button" onClick={() => cameraInputRef.current?.click()} style={styles.photoBtn}>
                  Prendre une photo
                </button>
                <button type="button" onClick={() => galleryInputRef.current?.click()} style={styles.photoBtn}>
                  Choisir dans la galerie
                </button>
              </div>
            )}
            <input ref={cameraInputRef} type="file" accept="image/*" capture="user" onChange={handleAvatarChange} style={{ display: 'none' }} />
            <input ref={galleryInputRef} type="file" accept="image/*" onChange={handleAvatarChange} style={{ display: 'none' }} />
          </div>

          <label style={styles.label}>
            Ton pseudo
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              maxLength={20}
              placeholder="ex: Nico_le_Roi"
              style={styles.input}
              autoFocus
            />
            <span style={styles.counter}>{username.length}/20</span>
          </label>

          <button
            type="submit"
            disabled={!username.trim()}
            style={{
              ...styles.submitBtn,
              ...(!username.trim() ? styles.submitBtnDisabled : {}),
            }}
          >
            Suivant →
          </button>
        </form>
      ) : (
        <form onSubmit={handleSubmit} style={styles.form}>

          {/* Question 1 — Métier */}
          <div style={styles.field}>
            <span style={styles.questionLabel}>Tu es plutôt...</span>
            <div style={styles.optionList}>
              {JOB_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setJob(opt)}
                  style={{ ...styles.optionBtn, ...(job === opt ? styles.optionBtnActive : {}) }}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          {/* Question 2 — Teuf */}
          <div style={styles.field}>
            <span style={styles.questionLabel}>Tu aimes la teuf ?</span>
            <div style={styles.optionList}>
              {TEUF_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setTeuf(opt)}
                  style={{ ...styles.optionBtn, ...(teuf === opt ? styles.optionBtnActive : {}) }}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          {/* Question 3 — Alimentation */}
          <div style={styles.field}>
            <span style={styles.questionLabel}>Ton type d'alimentation ?</span>
            <div style={styles.optionList}>
              {FOOD_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setFood(opt)}
                  style={{ ...styles.optionBtn, ...(food === opt ? styles.optionBtnActive : {}) }}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          {/* Question 4 — Défaut */}
          <label style={styles.label}>
            Ton pire défaut ?
            <input
              type="text"
              value={defaut}
              onChange={(e) => setDefaut(e.target.value)}
              maxLength={60}
              placeholder="ex: Je suis toujours en retard"
              style={styles.input}
            />
            <span style={styles.counter}>{defaut.length}/60</span>
          </label>

          {error && <p style={styles.error}>{error}</p>}

          <button
            type="submit"
            disabled={loading || !job || !teuf || !food}
            style={{
              ...styles.submitBtn,
              ...(!job || !teuf || !food ? styles.submitBtnDisabled : {}),
            }}
          >
            {loading ? 'Chargement...' : 'Rejoindre le groupe 🎉'}
          </button>
        </form>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: 'var(--color-bg)',
    display: 'flex',
    flexDirection: 'column',
    padding: '1rem 1.25rem 2rem',
    maxWidth: '480px',
    margin: '0 auto',
    boxSizing: 'border-box',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    marginBottom: '1.5rem',
  },
  backBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    background: 'var(--color-surface)',
    color: 'var(--color-text-primary)',
    flexShrink: 0,
    textDecoration: 'none',
  },
  progressRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    marginBottom: '2rem',
  },
  progressDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: 'var(--color-border)',
    flexShrink: 0,
    transition: 'background 0.2s',
  },
  progressDotActive: {
    background: 'var(--color-indigo)',
  },
  progressLine: {
    flex: 1,
    height: '2px',
    background: 'var(--color-border)',
    borderRadius: '1px',
  },
  title: {
    fontFamily: 'var(--font-title)',
    fontWeight: 900,
    fontSize: '1.375rem',
    color: 'var(--color-text-primary)',
    letterSpacing: '-0.5px',
    margin: 0,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.75rem',
    flex: 1,
  },
  avatarSection: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.625rem',
  },
  avatarCircle: {
    width: '88px',
    height: '88px',
    borderRadius: '50%',
    background: 'var(--color-border)',
    border: '2px dashed var(--color-text-secondary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  photoBtn: {
    fontFamily: 'var(--font-body)',
    fontWeight: 700,
    fontSize: '0.875rem',
    color: 'var(--color-text-primary)',
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: '20px',
    padding: '0.625rem 0.875rem',
    cursor: 'pointer',
    minHeight: '44px',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  questionLabel: {
    fontFamily: 'var(--font-body)',
    fontWeight: 700,
    fontSize: '0.875rem',
    color: 'var(--color-text-primary)',
  },
  optionList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.5rem',
  },
  optionBtn: {
    fontFamily: 'var(--font-body)',
    fontWeight: 500,
    fontSize: '0.9375rem',
    color: 'var(--color-text-secondary)',
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: '20px',
    padding: '0.625rem 0.875rem',
    cursor: 'pointer',
    transition: 'all 0.15s',
    minHeight: '44px',
  },
  optionBtnActive: {
    background: 'var(--color-indigo)',
    borderColor: 'var(--color-indigo)',
    color: '#ffffff',
    fontWeight: 700,
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    color: 'var(--color-text-primary)',
    fontSize: '0.875rem',
    fontWeight: 700,
    fontFamily: 'var(--font-body)',
  },
  input: {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: '0.75rem',
    color: 'var(--color-text-primary)',
    fontSize: '1rem',
    padding: '0.75rem 1rem',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box' as const,
    fontFamily: 'var(--font-body)',
  },
  counter: {
    color: 'var(--color-text-secondary)',
    fontSize: '0.75rem',
    alignSelf: 'flex-end',
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
    marginTop: 'auto',
    minHeight: '44px',
  },
  submitBtnDisabled: {
    background: 'var(--color-border)',
    color: 'var(--color-text-secondary)',
    cursor: 'not-allowed',
  },
  error: {
    color: '#ff6b6b',
    fontSize: '0.875rem',
    margin: 0,
  },
}
