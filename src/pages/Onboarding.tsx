import { useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { saveSession } from '../lib/session'

// ─── Types ────────────────────────────────────────────────────

interface FormData {
  username: string
  avatarFile: File | null
  avatarPreview: string | null
  weekendActivity: string[]
  badHabit: string
  partyStyle: string[]
}

// ─── Animation variants ───────────────────────────────────────

const variants = {
  enter: (dir: number) => ({ x: dir > 0 ? 320 : -320, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? -320 : 320, opacity: 0 }),
}

const transition = { duration: 0.3, ease: [0.32, 0.72, 0, 1] as const }

// ─── Chip button ──────────────────────────────────────────────

function Chip({
  label,
  selected,
  onClick,
}: {
  label: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button type="button" onClick={onClick} style={{
      ...chipStyle,
      background: selected ? '#6c47ff' : '#2a2a2a',
      borderColor: selected ? '#6c47ff' : '#333',
      color: selected ? '#fff' : '#aaa',
    }}>
      {label}
    </button>
  )
}

// ─── Main component ───────────────────────────────────────────

export default function Onboarding() {
  const { invite_code } = useParams<{ invite_code: string }>()
  const navigate = useNavigate()

  const [step, setStep] = useState(1)
  const [direction, setDirection] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState<FormData>({
    username: '',
    avatarFile: null,
    avatarPreview: null,
    weekendActivity: [],
    badHabit: '',
    partyStyle: [],
  })

  function goTo(next: number) {
    setDirection(next > step ? 1 : -1)
    setStep(next)
  }

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setForm((f) => ({
      ...f,
      avatarFile: file,
      avatarPreview: URL.createObjectURL(file),
    }))
  }

  async function handleSubmit() {
    if (!invite_code) return
    setLoading(true)
    setError(null)

    // 1. Récupérer le group_id depuis l'invite_code
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

    // 2. Connexion anonyme Supabase
    const { data: authData, error: authError } = await supabase.auth.signInAnonymously()
    if (authError || !authData.user) {
      setError('Erreur d\'authentification : ' + (authError?.message ?? ''))
      setLoading(false)
      return
    }
    const userId = authData.user.id

    // 3. Upload de l'avatar si présent
    let avatarUrl: string | null = null
    if (form.avatarFile) {
      const ext = form.avatarFile.name.split('.').pop() ?? 'jpg'
      const path = `${userId}/avatar.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, form.avatarFile, { upsert: true })

      if (!uploadError) {
        const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
        avatarUrl = urlData.publicUrl
      }
    }

    // 4. Insert de l'utilisateur
    const { error: insertError } = await supabase.from('users').insert({
      id: userId,
      group_id: group.id,
      username: form.username.trim(),
      avatar_url: avatarUrl,
      onboarding_answers: {
        weekendActivity: form.weekendActivity,
        badHabit: form.badHabit,
        partyStyle: form.partyStyle,
      },
    })

    if (insertError) {
      setError('Erreur lors de la création du profil : ' + insertError.message)
      setLoading(false)
      return
    }

    // 5. Sauvegarder la session et rediriger
    saveSession(userId, group.id)
    navigate('/game')
  }

  const canGoNextStep1 = form.username.trim().length > 0
  const canGoNextStep2 = form.weekendActivity.length > 0 && form.badHabit.trim() && form.partyStyle.length > 0

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <a href="/" style={styles.backBtn}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
        </a>
        <div style={styles.progressTrack}>
          <motion.div
            style={styles.progressBar}
            animate={{ width: `${(step / 3) * 100}%` }}
            transition={transition}
          />
        </div>
        <span style={styles.stepLabel}>{step}/3</span>
      </div>

      {/* Contenu des étapes */}
      <div style={styles.slideContainer}>
        <AnimatePresence mode="popLayout" custom={direction}>
          <motion.div
            key={step}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={transition}
            style={styles.slide}
          >
            {step === 1 && <Step1 form={form} setForm={setForm} fileInputRef={fileInputRef} onAvatarChange={handleAvatarChange} />}
            {step === 2 && <Step2 form={form} setForm={setForm} />}
            {step === 3 && <Step3 form={form} />}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Navigation */}
      <div style={styles.nav}>
        {step > 1 && (
          <button onClick={() => goTo(step - 1)} style={styles.backBtn}>
            ← Retour
          </button>
        )}

        {step < 3 && (
          <button
            onClick={() => goTo(step + 1)}
            disabled={step === 1 ? !canGoNextStep1 : !canGoNextStep2}
            style={{ ...styles.nextBtn, marginLeft: step > 1 ? undefined : 'auto' }}
          >
            Suivant →
          </button>
        )}

        {step === 3 && (
          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{ ...styles.nextBtn, marginLeft: 'auto' }}
          >
            {loading ? 'Chargement...' : 'Rejoindre le groupe 🎉'}
          </button>
        )}
      </div>

      {error && <p style={styles.error}>{error}</p>}

    </div>
  )
}

// ─── Step 1 — Identité ────────────────────────────────────────

function Step1({
  form,
  setForm,
  fileInputRef,
  onAvatarChange,
}: {
  form: FormData
  setForm: React.Dispatch<React.SetStateAction<FormData>>
  fileInputRef: React.RefObject<HTMLInputElement | null>
  onAvatarChange: (e: React.ChangeEvent<HTMLInputElement>) => void
}) {
  return (
    <div style={styles.stepContent}>
      <h2 style={styles.stepTitle}>Qui es-tu ?</h2>

      {/* Avatar */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
        <div
          onClick={() => fileInputRef.current?.click()}
          style={{
            ...styles.avatarCircle,
            backgroundImage: form.avatarPreview ? `url(${form.avatarPreview})` : undefined,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            cursor: 'pointer',
          }}
        >
          {!form.avatarPreview && <span style={{ fontSize: '2.5rem' }}>📷</span>}
        </div>
        <span style={{ color: '#888', fontSize: '0.85rem' }}>
          {form.avatarPreview ? 'Changer la photo' : 'Ajouter une photo'}
        </span>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={onAvatarChange}
          style={{ display: 'none' }}
        />
      </div>

      {/* Username */}
      <label style={styles.label}>
        Ton pseudo
        <input
          type="text"
          value={form.username}
          onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
          maxLength={20}
          placeholder="ex: Nico_le_Roi"
          style={styles.input}
          autoFocus
        />
        <span style={{ color: '#666', fontSize: '0.8rem', alignSelf: 'flex-end' }}>
          {form.username.length}/20
        </span>
      </label>
    </div>
  )
}

// ─── Step 2 — Habitudes ───────────────────────────────────────

function Step2({
  form,
  setForm,
}: {
  form: FormData
  setForm: React.Dispatch<React.SetStateAction<FormData>>
}) {
  return (
    <div style={styles.stepContent}>
      <h2 style={styles.stepTitle}>Tes habitudes</h2>

      {/* Question 1 */}
      <div style={styles.question}>
        <p style={styles.questionLabel}>Ton truc du weekend c'est plutôt...</p>
        <div style={styles.chips}>
          {['Netflix', 'Sortir', 'Sport', 'Cuisine', 'Flemme totale'].map((opt) => (
            <Chip
              key={opt}
              label={opt}
              selected={form.weekendActivity.includes(opt)}
              onClick={() => setForm((f) => ({
                ...f,
                weekendActivity: f.weekendActivity.includes(opt)
                  ? f.weekendActivity.filter((v) => v !== opt)
                  : [...f.weekendActivity, opt],
              }))}
            />
          ))}
        </div>
      </div>

      {/* Question 2 */}
      <div style={styles.question}>
        <label style={styles.questionLabel}>
          Ta mauvaise habitude c'est...
          <input
            type="text"
            value={form.badHabit}
            onChange={(e) => setForm((f) => ({ ...f, badHabit: e.target.value }))}
            maxLength={60}
            placeholder="Sois honnête 👀"
            style={{ ...styles.input, marginTop: '0.5rem' }}
          />
          <span style={{ color: '#666', fontSize: '0.8rem', alignSelf: 'flex-end' }}>
            {form.badHabit.length}/60
          </span>
        </label>
      </div>

      {/* Question 3 */}
      <div style={styles.question}>
        <p style={styles.questionLabel}>En soirée tu es plutôt...</p>
        <div style={styles.chips}>
          {['Le premier parti', 'Le dernier debout', 'Celui qui mange tout', 'Le photographe'].map((opt) => (
            <Chip
              key={opt}
              label={opt}
              selected={form.partyStyle.includes(opt)}
              onClick={() => setForm((f) => ({
                ...f,
                partyStyle: f.partyStyle.includes(opt)
                  ? f.partyStyle.filter((v) => v !== opt)
                  : [...f.partyStyle, opt],
              }))}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Step 3 — Confirmation ────────────────────────────────────

function Step3({ form }: { form: FormData }) {
  return (
    <div style={styles.stepContent}>
      <h2 style={styles.stepTitle}>Ton profil</h2>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
        <div style={{
          ...styles.avatarCircle,
          backgroundImage: form.avatarPreview ? `url(${form.avatarPreview})` : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          width: '90px',
          height: '90px',
        }}>
          {!form.avatarPreview && <span style={{ fontSize: '2rem' }}>👤</span>}
        </div>
        <strong style={{ color: '#fff', fontSize: '1.25rem' }}>{form.username}</strong>
      </div>

      <div style={styles.recap}>
        <RecapRow emoji="🛋️" label="Weekend" value={form.weekendActivity.join(', ')} />
        <RecapRow emoji="😅" label="Mauvaise habitude" value={form.badHabit} />
        <RecapRow emoji="🎉" label="En soirée" value={form.partyStyle.join(', ')} />
      </div>
    </div>
  )
}

function RecapRow({ emoji, label, value }: { emoji: string; label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
      <span style={{ fontSize: '1.1rem' }}>{emoji}</span>
      <div>
        <div style={{ color: '#888', fontSize: '0.8rem' }}>{label}</div>
        <div style={{ color: '#fff', fontSize: '0.95rem' }}>{value}</div>
      </div>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#0f0f0f',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '1rem 1rem 2rem',
    fontFamily: 'system-ui, sans-serif',
    overflowX: 'hidden',
  },
  header: {
    width: '100%',
    maxWidth: '480px',
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    marginBottom: '2rem',
  },
  backBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    background: '#1e1e1e',
    color: '#fff',
    flexShrink: 0,
    textDecoration: 'none',
  },
  progressTrack: {
    flex: 1,
    height: '4px',
    background: '#2a2a2a',
    borderRadius: '2px',
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    background: '#6c47ff',
    borderRadius: '2px',
  },
  stepLabel: {
    color: '#555',
    fontSize: '0.8rem',
    flexShrink: 0,
  },
  slideContainer: {
    width: '100%',
    maxWidth: '480px',
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  slide: {
    width: '100%',
  },
  stepContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.75rem',
  },
  stepTitle: {
    color: '#fff',
    fontSize: '1.6rem',
    fontWeight: 700,
    margin: 0,
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    color: '#ccc',
    fontSize: '0.9rem',
    fontWeight: 500,
  },
  input: {
    background: '#1e1e1e',
    border: '1px solid #333',
    borderRadius: '0.75rem',
    color: '#fff',
    fontSize: '1rem',
    padding: '0.75rem 1rem',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  },
  question: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  questionLabel: {
    color: '#ccc',
    fontSize: '0.95rem',
    fontWeight: 500,
    margin: 0,
  },
  chips: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.5rem',
  },
  avatarCircle: {
    width: '80px',
    height: '80px',
    borderRadius: '50%',
    background: '#2a2a2a',
    border: '2px dashed #444',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recap: {
    background: '#1a1a1a',
    borderRadius: '1rem',
    padding: '1.25rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    border: '1px solid #2a2a2a',
  },
  nav: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    maxWidth: '480px',
    marginTop: '2rem',
    gap: '1rem',
  },
  backBtn: {
    background: 'transparent',
    border: '1px solid #333',
    color: '#888',
    borderRadius: '0.75rem',
    padding: '0.75rem 1.25rem',
    fontSize: '0.9rem',
    cursor: 'pointer',
  },
  nextBtn: {
    background: '#6c47ff',
    color: '#fff',
    border: 'none',
    borderRadius: '0.75rem',
    padding: '0.75rem 1.5rem',
    fontSize: '0.95rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  error: {
    color: '#ff6b6b',
    fontSize: '0.875rem',
    marginTop: '1rem',
    textAlign: 'center',
  },
}

const chipStyle: React.CSSProperties = {
  border: '1px solid',
  borderRadius: '2rem',
  padding: '0.5rem 1rem',
  fontSize: '0.875rem',
  cursor: 'pointer',
  fontWeight: 500,
  transition: 'all 0.15s',
}
