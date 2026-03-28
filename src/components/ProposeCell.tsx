import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { getSession } from '../lib/session'
import type { User } from '../../supabase/types'

interface Props {
  onClose: () => void
}

export default function ProposeCell({ onClose }: Props) {
  const session = getSession()
  const [members, setMembers] = useState<User[]>([])
  const [targetId, setTargetId] = useState('')
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (!session) return
    supabase
      .from('users')
      .select('*')
      .eq('group_id', session.groupId)
      .neq('id', session.userId)
      .then(({ data }) => {
        setMembers(data ?? [])
        if (data && data.length > 0) setTargetId(data[0].id)
      })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!session || !targetId || !content.trim()) return
    setLoading(true)
    setError(null)

    // Vérification unicité
    const { data: existing } = await supabase
      .from('proposals')
      .select('id')
      .eq('target_user_id', targetId)
      .eq('content', content.trim())
      .eq('group_id', session.groupId)
      .maybeSingle()

    if (existing) {
      setError('Cette case a déjà été proposée.')
      setLoading(false)
      return
    }

    const { error: insertError } = await supabase.from('proposals').insert({
      group_id: session.groupId,
      proposer_user_id: session.userId,
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
                      {m.avatar_url ? (
                        <img src={m.avatar_url} style={styles.avatar} alt="" />
                      ) : (
                        <div style={styles.avatarFallback}>
                          {m.username[0].toUpperCase()}
                        </div>
                      )}
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
    background: '#1a1a1a',
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
    background: '#333',
    borderRadius: '2px',
    margin: '0 auto 1.25rem',
  },
  title: {
    color: '#fff',
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
    color: '#888',
    fontSize: '0.8rem',
    fontWeight: 500,
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
    background: '#2a2a2a',
    border: '1px solid #333',
    borderRadius: '2rem',
    padding: '0.4rem 0.875rem 0.4rem 0.4rem',
    cursor: 'pointer',
  },
  memberBtnActive: {
    borderColor: '#6c47ff',
    background: '#1a1430',
  },
  avatar: {
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    objectFit: 'cover',
  },
  avatarFallback: {
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    background: '#6c47ff',
    color: '#fff',
    fontSize: '0.7rem',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberName: {
    color: '#ccc',
    fontSize: '0.875rem',
    fontWeight: 500,
  },
  textarea: {
    background: '#111',
    border: '1px solid #333',
    borderRadius: '0.75rem',
    color: '#fff',
    fontSize: '0.95rem',
    padding: '0.75rem 1rem',
    resize: 'none',
    lineHeight: 1.5,
    outline: 'none',
    fontFamily: 'system-ui, sans-serif',
  },
  counter: {
    color: '#555',
    fontSize: '0.75rem',
    alignSelf: 'flex-end',
  },
  submitBtn: {
    background: '#6c47ff',
    color: '#fff',
    border: 'none',
    borderRadius: '0.75rem',
    padding: '0.875rem',
    fontSize: '1rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  submitBtnDisabled: {
    background: '#2a2a2a',
    color: '#555',
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
