import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface Props {
  onComplete: () => void
}

const STEPS = [
  {
    icon: '🎉',
    title: 'Bienvenue sur Busted !',
    description:
      'Busted, c\'est le jeu de paris entre potes. Parie sur les habitudes de tes amis et prouve que tu les connais mieux que personne.',
  },
  {
    icon: '🎯',
    title: 'Ta grille de bingo',
    description:
      'Chaque semaine, tu reçois une grille personnalisée. Chaque case est un pari sur un ami — à toi de prouver qu\'il s\'est réalisé !',
  },
  {
    icon: '➕',
    title: 'Propose des paris',
    description:
      'Appuie sur le bouton + pour proposer un nouveau pari. Le groupe vote, et les meilleurs paris se retrouvent dans les grilles.',
  },
  {
    icon: '📸',
    title: 'Soumets une preuve',
    description:
      'Clique sur une case pour soumettre ta preuve (texte ou photo). La personne ciblée devra confirmer que c\'est vrai !',
  },
  {
    icon: '🗳️',
    title: 'Valide ou refuse',
    description:
      'Quand quelqu\'un te cible, c\'est à toi de valider ou refuser la preuve. Sois honnête — c\'est le jeu !',
  },
  {
    icon: '🏆',
    title: 'Classement & bingo',
    description:
      'Complete des lignes pour scorer un BINGO ! Le classement se met à jour en temps réel. Qui connaît le mieux le groupe ?',
  },
]

export default function Tutorial({ onComplete }: Props) {
  const [step, setStep] = useState(0)

  function finish() {
    localStorage.setItem('busted_tutorial_done', 'true')
    onComplete()
  }

  function next() {
    if (step < STEPS.length - 1) setStep(step + 1)
    else finish()
  }

  function prev() {
    if (step > 0) setStep(step - 1)
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={styles.overlay}
    >
      <button onClick={finish} style={styles.skipBtn}>
        Passer
      </button>

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 60 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -60 }}
          transition={{ duration: 0.25 }}
          style={styles.card}
        >
          <div style={styles.iconCircle}>{STEPS[step].icon}</div>
          <h2 style={styles.title}>{STEPS[step].title}</h2>
          <p style={styles.description}>{STEPS[step].description}</p>
        </motion.div>
      </AnimatePresence>

      {/* Dots */}
      <div style={styles.dots}>
        {STEPS.map((_, i) => (
          <div
            key={i}
            style={{
              ...styles.dot,
              background: i === step ? 'var(--color-indigo)' : 'var(--color-border)',
            }}
          />
        ))}
      </div>

      {/* Navigation */}
      <div style={styles.navRow}>
        {step > 0 ? (
          <button onClick={prev} style={styles.backBtn}>
            Retour
          </button>
        ) : (
          <div />
        )}
        <button onClick={next} style={styles.nextBtn}>
          {step < STEPS.length - 1 ? 'Suivant' : 'C\'est parti !'}
        </button>
      </div>
    </motion.div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'var(--color-bg)',
    zIndex: 400,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2rem 1.5rem',
  },
  skipBtn: {
    position: 'absolute',
    top: 'calc(1rem + env(safe-area-inset-top, 0px))',
    right: '1rem',
    background: 'transparent',
    border: 'none',
    color: 'var(--color-text-secondary)',
    fontFamily: 'var(--font-body)',
    fontWeight: 600,
    fontSize: '0.875rem',
    cursor: 'pointer',
    padding: '0.5rem 0.75rem',
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    maxWidth: '360px',
    gap: '1rem',
  },
  iconCircle: {
    width: '80px',
    height: '80px',
    borderRadius: '50%',
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '2rem',
    marginBottom: '0.5rem',
  },
  title: {
    fontFamily: 'var(--font-title)',
    fontWeight: 900,
    fontSize: 'clamp(1.25rem, 4vw, 1.5rem)',
    color: 'var(--color-text-primary)',
    margin: 0,
  },
  description: {
    fontFamily: 'var(--font-body)',
    fontWeight: 400,
    fontSize: '0.9375rem',
    color: 'var(--color-text-secondary)',
    lineHeight: 1.6,
    margin: 0,
  },
  dots: {
    display: 'flex',
    gap: '0.5rem',
    marginTop: '2rem',
  },
  dot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    transition: 'background 0.2s',
  },
  navRow: {
    display: 'flex',
    justifyContent: 'space-between',
    width: '100%',
    maxWidth: '360px',
    marginTop: '2rem',
    gap: '0.75rem',
  },
  backBtn: {
    background: 'transparent',
    border: '1px solid var(--color-border)',
    color: 'var(--color-text-secondary)',
    borderRadius: '0.75rem',
    padding: '0.75rem 1.25rem',
    fontFamily: 'var(--font-body)',
    fontWeight: 700,
    fontSize: '0.875rem',
    cursor: 'pointer',
    minHeight: '44px',
  },
  nextBtn: {
    background: 'var(--color-indigo)',
    border: 'none',
    color: '#ffffff',
    borderRadius: '0.75rem',
    padding: '0.75rem 1.5rem',
    fontFamily: 'var(--font-body)',
    fontWeight: 700,
    fontSize: '0.875rem',
    cursor: 'pointer',
    minHeight: '44px',
    flex: 1,
  },
}
