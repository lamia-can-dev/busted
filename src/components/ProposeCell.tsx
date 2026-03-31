import { useEffect, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { User } from '../../supabase/types'
import BottomSheet from './BottomSheet'
import Avatar from './Avatar'

interface Props {
  onClose: () => void
}

export default function ProposeCell({ onClose }: Props) {
  const { userId, groupId } = useAuth()
  const [members, setMembers] = useState<User[]>([])
  const [targetId, setTargetId] = useState('')
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (!userId || !groupId) return
    supabase
      .from('users')
      .select('*')
      .eq('group_id', groupId)
      .neq('id', userId)
      .then(({ data }) => {
        setMembers(data ?? [])
        if (data && data.length > 0) setTargetId(data[0].id)
      })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!userId || !groupId || !targetId || !content.trim()) return
    setLoading(true)
    setError(null)

    // Vérification unicité
    const { data: existing } = await supabase
      .from('proposals')
      .select('id')
      .eq('target_user_id', targetId)
      .eq('content', content.trim())
      .eq('group_id', groupId)
      .maybeSingle()

    if (existing) {
      setError('Cette case a déjà été proposée.')
      setLoading(false)
      return
    }

    const { error: insertError } = await supabase.from('proposals').insert({
      group_id: groupId,
      proposer_user_id: userId,
      target_user_id: targetId,
      content: content.trim(),
    })

    if (insertError) {
      setError(insertError.message)
      setLoading(false)
      return
    }

    setSuccess(true)
    setTimeout(onClose, 1000)
  }

  return (
    <AnimatePresence>
      <BottomSheet onClose={onClose}>
          <h2 style={styles.title}>Proposer une case</h2>

          {success ? (
            <div style={styles.successMsg}>✓ Proposition envoyée !</div>
          ) : (
            <form onSubmit={handleSubmit} style={styles.form}>
              {/* Sélecteur de cible */}
              <div style={styles.field}>
                <label style={styles.label}>Qui cibler ?</label>
                <div style={styles.memberList}>
                  {members.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setTargetId(m.id)}
                      style={{
                        ...styles.memberBtn,
                        ...(targetId === m.id ? styles.memberBtnActive : {}),
                      }}
                    >
                      <Avatar src={m.avatar_url} name={m.username} userId={m.id} size={24} />
                      <span style={styles.memberName}>{m.username}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Contenu */}
              <div style={styles.field}>
                <label style={styles.label}>La case</label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  maxLength={80}
                  placeholder="ex: Thomas va parler de son régime au déjeuner"
                  rows={3}
                  style={styles.textarea}
                  autoFocus
                />
                <span style={styles.counter}>{content.length}/80</span>
              </div>

              {error && <p style={styles.error}>{error}</p>}

              <button
                type="submit"
                disabled={loading || !content.trim() || !targetId}
                style={{
                  ...styles.submitBtn,
                  ...(!content.trim() || !targetId ? styles.submitBtnDisabled : {}),
                }}
              >
                {loading ? 'Envoi...' : 'Proposer →'}
              </button>
            </form>
          )}
      </BottomSheet>
    </AnimatePresence>
  )
}

const styles: Record<string, React.CSSProperties> = {
  title: {
    color: 'var(--color-text-primary)',
    fontSize: '1.2rem',
    fontWeight: 700,
    marginBottom: '1.5rem',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.25rem',
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
  memberList: {
    display: 'flex',
    gap: '0.5rem',
    flexWrap: 'wrap',
  },
  memberBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    background: 'var(--color-border)',
    border: '1px solid var(--color-border)',
    borderRadius: '2rem',
    padding: '0.5rem 0.875rem 0.5rem 0.5rem',
    cursor: 'pointer',
    minHeight: '44px',
  },
  memberBtnActive: {
    borderColor: 'var(--color-indigo)',
    background: 'var(--color-surface)',
  },
  memberName: {
    color: 'var(--color-text-primary)',
    fontSize: '0.875rem',
    fontWeight: 500,
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
    color: 'var(--color-error)',
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
